// Vercel Function: /api/account — accounts, sessions and per-user data.
//
// Everything lives in Upstash Redis (Vercel → Storage → Upstash Redis), with
// keys prefixed "rh:" so the database can be shared with other apps.
// This file is deliberately self-contained (no relative imports) so it runs
// on Vercel exactly as it runs in tests and in `npm run dev`.
//
//   POST /api/account?op=signup   {name, email, password}      → {user, recoveryCode}
//   POST /api/account?op=login    {email, password}            → {user}
//   POST /api/account?op=logout                                 → {ok}
//   POST /api/account?op=logout-all                             → {ok}    (signs out every device)
//   GET  /api/account?op=me                                     → {user} | 401
//   POST /api/account?op=password {current, next}               → {ok}
//   POST /api/account?op=reset    {email, recoveryCode, next}   → {user, recoveryCode}
//   POST /api/account?op=delete   {password}                    → {ok}
//   GET  /api/account?op=data                                   → {version, updatedAt, data}
//   PUT  /api/account?op=data     {baseVersion, data}           → {version, updatedAt} | 409 {…server copy}
//   GET  /api/account?op=ping                                   → {ok, configured}

import { Redis } from '@upstash/redis';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';

// ------------------------------------------------------------------ storage

export interface KV {
  get<T = unknown>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Increment a counter, starting its expiry window on first use. */
  incr(key: string, windowSec: number): Promise<number>;
}

export function redisKV(env: Record<string, string | undefined> = process.env): KV | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  return {
    get: (k) => redis.get(k),
    set: async (k, v, o) => {
      const opts = o?.nx && o?.ex ? { nx: true as const, ex: o.ex } : o?.nx ? { nx: true as const } : o?.ex ? { ex: o.ex } : undefined;
      const r = await (opts ? redis.set(k, v, opts) : redis.set(k, v));
      return r === 'OK';
    },
    del: async (k) => {
      await redis.del(k);
    },
    incr: async (k, w) => {
      const n = await redis.incr(k);
      if (n === 1) await redis.expire(k, w);
      return n;
    },
  };
}

/** In-memory store for tests and the local dev server. */
export function memoryKV(): KV {
  const m = new Map<string, { v: string; exp?: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.exp && e.exp < Date.now()) {
      m.delete(k);
      return undefined;
    }
    return e;
  };
  return {
    get: async <T,>(k: string) => {
      const e = live(k);
      return e ? (JSON.parse(e.v) as T) : null;
    },
    set: async (k, v, o) => {
      if (o?.nx && live(k)) return false;
      m.set(k, { v: JSON.stringify(v), exp: o?.ex ? Date.now() + o.ex * 1000 : undefined });
      return true;
    },
    del: async (k) => {
      m.delete(k);
    },
    incr: async (k, w) => {
      const e = live(k);
      const n = (e ? Number(JSON.parse(e.v)) : 0) + 1;
      m.set(k, { v: JSON.stringify(n), exp: e?.exp ?? Date.now() + w * 1000 });
      return n;
    },
  };
}

// ------------------------------------------------------------------ helpers

interface User {
  id: string;
  email: string;
  name: string;
  pass: string; // scrypt$N$r$p$salt$hash
  recovery: string; // same format, for the recovery code
  sv: number; // session version — bump to sign out everywhere
  createdAt: string;
}
interface Session {
  uid: string;
  sv: number;
}
interface Stored {
  version: number;
  updatedAt: string | null;
  data: unknown;
}

const SESSION_DAYS = 30;
const COOKIE = 'rh_session';
const MAX_DATA_BYTES = 900_000;
const k = {
  user: (id: string) => `rh:user:${id}`,
  email: (email: string) => `rh:email:${email}`,
  sess: (hash: string) => `rh:sess:${hash}`,
  data: (id: string) => `rh:data:${id}`,
  rl: (what: string, who: string) => `rh:rl:${what}:${who}`,
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((res, rej) =>
    scryptCb(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? rej(e) : res(key))),
  );
}
async function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const [N, r, p] = [16384, 8, 1];
  const key = await scrypt(secret, salt, N, r, p);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifySecret(secret: string, stored: string) {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(secret, Buffer.from(salt, 'base64'), Number(N), Number(r), Number(p));
  const expected = Buffer.from(hash, 'base64');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
/** e.g. 7KQ2-M9XD-4HPA-ZT3C — 80 bits, easy to write down. */
function recoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += alphabet[bytes[i] % alphabet.length];
  return s.match(/.{4}/g)!.join('-');
}
const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

const cookieOf = (req: Request, name: string) =>
  (req.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([n]) => n === name)?.[1];

function sessionCookie(req: Request, value: string, maxAge: number) {
  const https = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}

const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'local').split(',')[0].trim();
const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const passwordProblem = (p: unknown) =>
  typeof p !== 'string' || p.length < 8 ? 'Use at least 8 characters for your password.' : p.length > 200 ? 'That password is too long.' : null;

async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

async function startSession(req: Request, kv: KV, user: User) {
  const t = token();
  await kv.set(k.sess(sha256(t)), { uid: user.id, sv: user.sv } satisfies Session, { ex: SESSION_DAYS * 86400 });
  return sessionCookie(req, t, SESSION_DAYS * 86400);
}

async function currentUser(req: Request, kv: KV): Promise<{ user: User; tokenHash: string } | null> {
  const t = cookieOf(req, COOKIE);
  if (!t) return null;
  const tokenHash = sha256(t);
  const s = await kv.get<Session>(k.sess(tokenHash));
  if (!s) return null;
  const user = await kv.get<User>(k.user(s.uid));
  if (!user || user.sv !== s.sv) return null; // deleted, or signed out everywhere
  return { user, tokenHash };
}

async function limited(kv: KV, what: string, who: string, max: number, windowSec: number) {
  return (await kv.incr(k.rl(what, who), windowSec)) > max;
}

// ------------------------------------------------------------------ handler

export async function handleAccount(req: Request, kv: KV | null): Promise<Response> {
  const url = new URL(req.url);
  const op = url.searchParams.get('op') ?? '';
  if (op === 'ping') return json({ ok: true, configured: !!kv });
  if (!kv) return fail(503, 'Accounts aren’t set up on this server yet (the database isn’t connected).');
  const ip = ipOf(req);

  try {
    switch (`${req.method} ${op}`) {
      case 'POST signup': {
        if (await limited(kv, 'signup', ip, 10, 3600)) return fail(429, 'Too many sign-ups from here. Try again in an hour.');
        const b = await body<{ name: string; email: string; password: string }>(req);
        const email = String(b.email ?? '').trim().toLowerCase();
        const name = String(b.name ?? '').trim().slice(0, 60);
        if (!name) return fail(400, 'What should we call you?');
        if (!EMAIL_RE.test(email) || email.length > 200) return fail(400, 'That doesn’t look like an email address.');
        const bad = passwordProblem(b.password);
        if (bad) return fail(400, bad);
        const id = token(12);
        if (!(await kv.set(k.email(email), id, { nx: true }))) return fail(409, 'There’s already an account with that email. Try logging in.');
        const code = recoveryCode();
        const user: User = {
          id,
          email,
          name,
          pass: await hashSecret(b.password as string),
          recovery: await hashSecret(normCode(code)),
          sv: 1,
          createdAt: new Date().toISOString(),
        };
        await kv.set(k.user(id), user);
        const cookie = await startSession(req, kv, user);
        return json({ user: publicUser(user), recoveryCode: code }, 201, { 'Set-Cookie': cookie });
      }

      case 'POST login': {
        const b = await body<{ email: string; password: string }>(req);
        const email = String(b.email ?? '').trim().toLowerCase();
        if (await limited(kv, 'login-ip', ip, 30, 900)) return fail(429, 'Too many attempts. Wait 15 minutes and try again.');
        if (await limited(kv, 'login-email', sha256(email), 10, 900)) return fail(429, 'Too many attempts for this account. Wait 15 minutes, or reset your password.');
        const id = await kv.get<string>(k.email(email));
        const user = id ? await kv.get<User>(k.user(id)) : null;
        // Same message either way, so emails can't be probed.
        if (!user || !(await verifySecret(String(b.password ?? ''), user.pass))) return fail(401, 'Wrong email or password.');
        await kv.del(k.rl('login-email', sha256(email)));
        return json({ user: publicUser(user) }, 200, { 'Set-Cookie': await startSession(req, kv, user) });
      }

      case 'POST logout': {
        const cur = await currentUser(req, kv);
        if (cur) await kv.del(k.sess(cur.tokenHash));
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
      }

      case 'GET me': {
        const cur = await currentUser(req, kv);
        return cur ? json({ user: publicUser(cur.user) }) : fail(401, 'Not logged in.');
      }

      case 'POST logout-all': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const user = { ...cur.user, sv: cur.user.sv + 1 };
        await kv.set(k.user(user.id), user);
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
      }

      case 'POST password': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const b = await body<{ current: string; next: string }>(req);
        if (await limited(kv, 'password', cur.user.id, 10, 900)) return fail(429, 'Too many attempts. Try again later.');
        if (!(await verifySecret(String(b.current ?? ''), cur.user.pass))) return fail(401, 'Your current password is wrong.');
        const bad = passwordProblem(b.next);
        if (bad) return fail(400, bad);
        // New password signs out every other device; this one gets a fresh session.
        const user = { ...cur.user, pass: await hashSecret(b.next as string), sv: cur.user.sv + 1 };
        await kv.set(k.user(user.id), user);
        await kv.del(k.sess(cur.tokenHash));
        return json({ ok: true }, 200, { 'Set-Cookie': await startSession(req, kv, user) });
      }

      case 'POST reset': {
        if (await limited(kv, 'reset', ip, 10, 3600)) return fail(429, 'Too many attempts. Try again in an hour.');
        const b = await body<{ email: string; recoveryCode: string; next: string }>(req);
        const email = String(b.email ?? '').trim().toLowerCase();
        const id = await kv.get<string>(k.email(email));
        const user = id ? await kv.get<User>(k.user(id)) : null;
        if (!user || !(await verifySecret(normCode(String(b.recoveryCode ?? '')), user.recovery))) return fail(401, 'That email and recovery code don’t match.');
        const bad = passwordProblem(b.next);
        if (bad) return fail(400, bad);
        const code = recoveryCode(); // a used code is replaced
        const next = { ...user, pass: await hashSecret(b.next as string), recovery: await hashSecret(normCode(code)), sv: user.sv + 1 };
        await kv.set(k.user(user.id), next);
        return json({ user: publicUser(next), recoveryCode: code }, 200, { 'Set-Cookie': await startSession(req, kv, next) });
      }

      case 'POST delete': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const b = await body<{ password: string }>(req);
        if (!(await verifySecret(String(b.password ?? ''), cur.user.pass))) return fail(401, 'Wrong password.');
        await kv.del(k.data(cur.user.id));
        await kv.del(k.email(cur.user.email));
        await kv.del(k.user(cur.user.id));
        await kv.del(k.sess(cur.tokenHash));
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
      }

      case 'GET data': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        return json((await kv.get<Stored>(k.data(cur.user.id))) ?? { version: 0, updatedAt: null, data: null });
      }

      case 'PUT data': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const text = await req.text();
        if (text.length > MAX_DATA_BYTES) return fail(413, 'Your data is too large to save (over ~900 KB). Export a backup and delete old holes.');
        let b: { baseVersion?: number; data?: unknown };
        try {
          b = JSON.parse(text);
        } catch {
          return fail(400, 'Invalid JSON.');
        }
        if (!b || typeof b.data !== 'object' || b.data === null) return fail(400, 'Missing data.');
        const current = await kv.get<Stored>(k.data(cur.user.id));
        const v = current?.version ?? 0;
        // Another device saved first: send its copy back to merge.
        if ((b.baseVersion ?? 0) !== v) return json(current ?? { version: 0, updatedAt: null, data: null }, 409);
        const next: Stored = { version: v + 1, updatedAt: new Date().toISOString(), data: b.data };
        await kv.set(k.data(cur.user.id), next);
        return json({ version: next.version, updatedAt: next.updatedAt });
      }

      default:
        return fail(404, 'Unknown request.');
    }
  } catch (e) {
    console.error('account error', e);
    return fail(500, 'Something went wrong on the server. Try again.');
  }
}

const handler = (req: Request) => handleAccount(req, redisKV());
export const GET = handler;
export const POST = handler;
export const PUT = handler;
