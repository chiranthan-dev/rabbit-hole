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
//
//   Notifications (Web Push; keys are created automatically and kept in Redis):
//   GET  /api/account?op=push-config                            → {publicKey}
//   POST /api/account?op=push-subscribe {subscription, tz, time} → {ok}
//   POST /api/account?op=push-status    {endpoint}              → {subscribed, devices, time, tz, daily}
//   POST /api/account?op=push-prefs     {tz?, time?, daily?}    → {ok}
//   POST /api/account?op=push-unsubscribe {endpoint}            → {ok}
//   POST /api/account?op=push-test                              → {sent, failed}
//   POST /api/account?op=cron     (run by a schedule)           → {checked, sent}

import { Redis } from '@upstash/redis';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { generateRequestDetails, generateVAPIDKeys } from 'web-push';

// ------------------------------------------------------------------ storage

export interface KV {
  get<T = unknown>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Increment a counter, starting its expiry window on first use. */
  incr(key: string, windowSec: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
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
    sadd: async (k, m) => {
      await redis.sadd(k, m);
    },
    srem: async (k, m) => {
      await redis.srem(k, m);
    },
    smembers: (k) => redis.smembers(k),
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
    sadd: async (k, x) => {
      const cur: string[] = live(k) ? JSON.parse(m.get(k)!.v) : [];
      if (!cur.includes(x)) m.set(k, { v: JSON.stringify([...cur, x]) });
    },
    srem: async (k, x) => {
      const cur: string[] = live(k) ? JSON.parse(m.get(k)!.v) : [];
      m.set(k, { v: JSON.stringify(cur.filter((y) => y !== x)) });
    },
    smembers: async (k) => (live(k) ? JSON.parse(m.get(k)!.v) : []),
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
  push: (id: string) => `rh:push:${id}`,
  pushUsers: 'rh:pushusers',
  pushSent: (id: string, date: string) => `rh:pushsent:${id}:${date}`,
  vapid: 'rh:vapid',
  cronLock: 'rh:cron:lock',
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


// ------------------------------------------------------------------ notifications (Web Push)

interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}
interface PushPrefs {
  subs: PushSub[];
  tz: string;
  time: string; // "HH:MM", local to tz
  daily: boolean;
}
/** Everything needed to send one push, built offline by web-push. */
export interface PushRequest {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: Uint8Array | Buffer | string | null;
}
export interface Deps {
  /** Deliver a push; returns the push service's HTTP status. Swappable in tests. */
  send?: (r: PushRequest) => Promise<number>;
  now?: () => Date;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const validTz = (tz: unknown) => {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
};

/** Local date ("2026-11-25"), time ("19:05") and weekday (0 = Sunday) in a time zone. */
export function localClock(tz: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday };
}

interface LiteTask { title?: string; done?: boolean; skipped?: boolean; optional?: boolean; minutes?: number }
interface LiteHole { id?: string; title?: string; status?: string; days?: { date?: string; tasks?: LiteTask[] }[] }

/** What today's reminder should say, from the user's saved data. Null = nothing worth a nudge. */
export function reminderFor(data: unknown, today: string, weekday: number): { title: string; body: string; url: string; tag: string } | null {
  const holes: LiteHole[] = Array.isArray((data as { holes?: unknown })?.holes) ? (data as { holes: LiteHole[] }).holes : [];
  const active = holes.filter((h) => h?.status === 'active');
  const plans = active
    .map((h) => {
      const day = (h.days ?? []).find((d) => d?.date === today);
      const left = (day?.tasks ?? []).filter((t) => !t.done && !t.skipped && !t.optional);
      return { h, left, minutes: left.reduce((sum, t) => sum + (Number(t.minutes) || 0), 0) };
    })
    .filter((p) => p.left.length);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  if (plans.length === 1) {
    const { h, left, minutes } = plans[0];
    return {
      title: h.title || 'Rabbit Hole',
      body: `${plural(left.length, 'task')} left today · ${minutes} min. Next: ${left[0].title ?? 'your next task'}`,
      url: '/m',
      tag: 'daily',
    };
  }
  if (plans.length > 1) {
    const total = plans.reduce((sum, p) => sum + p.minutes, 0);
    return {
      title: 'Your rabbit holes today',
      body: `${plans.map((p) => `${p.h.title}: ${p.left.length} left`).join(' · ')} — ${total} min in all`,
      url: '/m',
      tag: 'daily',
    };
  }
  const finished = active.find((h) => {
    const last = h.days?.[h.days.length - 1]?.date;
    return last && last < today;
  });
  if (finished)
    return { title: `Your week in ${finished.title} is done`, body: 'Wrap it up: see what you now understand and where it could lead next.', url: `/hole/${finished.id}?tab=finish`, tag: 'wrapup' };
  if (!active.length && holes.length && weekday === 0)
    return { title: 'Ready for a new rabbit hole?', body: 'A fresh week starts tomorrow. Discover has new ideas waiting.', url: '/discover', tag: 'weekly' };
  return null;
}

async function vapidKeys(kv: KV, req: Request) {
  const subject = process.env.VAPID_SUBJECT || `https://${new URL(req.url).host}`;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject };
  let keys = await kv.get<{ publicKey: string; privateKey: string }>(k.vapid);
  if (!keys) {
    // First use: create this app's push identity once and keep it.
    const fresh = generateVAPIDKeys();
    await kv.set(k.vapid, fresh, { nx: true });
    keys = (await kv.get<{ publicKey: string; privateKey: string }>(k.vapid)) ?? fresh;
  }
  return { ...keys, subject };
}

const defaultSend = async (r: PushRequest) => {
  const res = await fetch(r.endpoint, { method: r.method, headers: r.headers, body: r.body as BodyInit | null });
  return res.status;
};

/** Send one notification to every device of a user; forgets devices the push service says are gone. */
async function pushToUser(kv: KV, req: Request, uid: string, payload: object, deps: Deps) {
  const prefs = await kv.get<PushPrefs>(k.push(uid));
  if (!prefs?.subs.length) return { sent: 0, failed: 0 };
  const vapid = await vapidKeys(kv, req);
  const send = deps.send ?? defaultSend;
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    prefs.subs.map(async (sub) => {
      try {
        const d = generateRequestDetails({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
          vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: 4 * 3600,
        });
        const status = await send({ endpoint: d.endpoint, method: d.method, headers: d.headers as Record<string, string>, body: d.body as Buffer | null });
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        if (status >= 200 && status < 300) sent++;
        else failed++;
      } catch (e) {
        console.error('push failed', e);
        failed++;
      }
    }),
  );
  if (gone.length) {
    const fresh = { ...prefs, subs: prefs.subs.filter((s) => !gone.includes(s.endpoint)) };
    await kv.set(k.push(uid), fresh);
    if (!fresh.subs.length) await kv.srem(k.pushUsers, uid);
  }
  return { sent, failed };
}

/** Send every reminder that is due. Safe to call often: each user gets at most one a day. */
async function runReminders(kv: KV, req: Request, deps: Deps) {
  const now = (deps.now ?? (() => new Date()))();
  const uids = await kv.smembers(k.pushUsers);
  let sent = 0;
  for (const uid of uids) {
    const prefs = await kv.get<PushPrefs>(k.push(uid));
    if (!prefs?.daily || !prefs.subs.length) continue;
    const clock = localClock(validTz(prefs.tz), now);
    if (clock.time < prefs.time || clock.time >= '23:00') continue;
    if (!(await kv.set(k.pushSent(uid, clock.date), 1, { nx: true, ex: 2 * 86400 }))) continue; // already handled today
    const stored = await kv.get<{ data?: unknown }>(k.data(uid));
    const msg = reminderFor(stored?.data, clock.date, clock.weekday);
    if (!msg) continue;
    sent += (await pushToUser(kv, req, uid, msg, deps)).sent;
  }
  return { checked: uids.length, sent };
}

// ------------------------------------------------------------------ handler

export async function handleAccount(req: Request, kv: KV | null, deps: Deps = {}): Promise<Response> {
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
        await kv.del(k.push(cur.user.id));
        await kv.srem(k.pushUsers, cur.user.id);
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


      case 'GET push-config': {
        const { publicKey } = await vapidKeys(kv, req);
        return json({ publicKey });
      }

      case 'POST push-subscribe': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Log in to turn on reminders.');
        const b = await body<{ subscription: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; tz: string; time: string }>(req);
        const sub = b.subscription;
        let endpointOk = false;
        try {
          endpointOk = new URL(String(sub?.endpoint)).protocol === 'https:';
        } catch {
          endpointOk = false;
        }
        if (!endpointOk || !sub?.keys?.p256dh || !sub.keys.auth) return fail(400, 'That notification subscription isn’t valid.');
        const prev = (await kv.get<PushPrefs>(k.push(cur.user.id))) ?? { subs: [], tz: 'UTC', time: '19:00', daily: true };
        const entry: PushSub = { endpoint: sub.endpoint!, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, createdAt: new Date().toISOString() };
        const prefs: PushPrefs = {
          subs: [...prev.subs.filter((s2) => s2.endpoint !== entry.endpoint), entry].slice(-10),
          tz: validTz(b.tz ?? prev.tz),
          time: TIME_RE.test(String(b.time)) ? String(b.time) : prev.time,
          daily: true,
        };
        await kv.set(k.push(cur.user.id), prefs);
        await kv.sadd(k.pushUsers, cur.user.id);
        return json({ ok: true, time: prefs.time, tz: prefs.tz });
      }

      case 'POST push-status': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const b = await body<{ endpoint: string }>(req);
        const prefs = await kv.get<PushPrefs>(k.push(cur.user.id));
        return json({
          subscribed: !!prefs?.subs.some((s2) => s2.endpoint === b.endpoint),
          devices: prefs?.subs.length ?? 0,
          time: prefs?.time ?? '19:00',
          tz: prefs?.tz ?? null,
          daily: prefs?.daily ?? false,
        });
      }

      case 'POST push-prefs': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const b = await body<{ tz: string; time: string; daily: boolean }>(req);
        const prefs = await kv.get<PushPrefs>(k.push(cur.user.id));
        if (!prefs) return fail(404, 'Reminders aren’t on for this account yet.');
        if (b.time !== undefined && !TIME_RE.test(String(b.time))) return fail(400, 'Pick a time like 19:00.');
        const next = { ...prefs, tz: b.tz ? validTz(b.tz) : prefs.tz, time: b.time ?? prefs.time, daily: b.daily ?? prefs.daily };
        await kv.set(k.push(cur.user.id), next);
        return json({ ok: true });
      }

      case 'POST push-unsubscribe': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        const b = await body<{ endpoint: string }>(req);
        const prefs = await kv.get<PushPrefs>(k.push(cur.user.id));
        if (prefs) {
          const next = { ...prefs, subs: prefs.subs.filter((s2) => s2.endpoint !== b.endpoint) };
          if (next.subs.length) await kv.set(k.push(cur.user.id), next);
          else {
            await kv.del(k.push(cur.user.id));
            await kv.srem(k.pushUsers, cur.user.id);
          }
        }
        return json({ ok: true });
      }

      case 'POST push-test': {
        const cur = await currentUser(req, kv);
        if (!cur) return fail(401, 'Not logged in.');
        if (await limited(kv, 'push-test', cur.user.id, 10, 3600)) return fail(429, 'That’s plenty of tests for now — try again later.');
        const prefs = await kv.get<PushPrefs>(k.push(cur.user.id));
        const r = await pushToUser(kv, req, cur.user.id, { title: 'Notifications are on ✦', body: `You’ll get a nudge around ${prefs?.time ?? '19:00'} when there’s something left to do.`, url: '/', tag: 'test' }, deps);
        return json(r);
      }

      case 'GET cron':
      case 'POST cron': {
        const secret = process.env.CRON_SECRET;
        if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return fail(401, 'Not allowed.');
        // Without a secret anyone may poke this, so it runs at most every few minutes and
        // never sends anyone more than one reminder a day.
        if (!(await kv.set(k.cronLock, 1, { nx: true, ex: 240 }))) return json({ skipped: true });
        return json(await runReminders(kv, req, deps));
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
