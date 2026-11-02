// Vercel Function: /api/sync
//
// Stores one JSON snapshot per "sync code" in Upstash Redis (add it from the
// Vercel dashboard → Storage → Upstash Redis). There are no accounts: the
// code itself is the secret, and only its SHA-256 hash is used as the key.
// Keys are prefixed with "rh:" so the same database can be shared with
// other apps.
//
//   GET  /api/sync?ping=1           → { ok, configured }
//   GET  /api/sync                  → { version, updatedAt, data }   (Authorization: Bearer <code>)
//   PUT  /api/sync {baseVersion, data} → { version, updatedAt } | 409 { version, updatedAt, data }

import { Redis } from '@upstash/redis';

export interface Stored {
  version: number;
  updatedAt: string;
  data: unknown;
}

export interface KV {
  get(key: string): Promise<Stored | null>;
  set(key: string, value: Stored): Promise<void>;
}

const MAX_BYTES = 900_000; // stay under Upstash's request size limit
const CODE_RE = /^[A-Za-z0-9_-]{24,128}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function keyFor(code: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `rh:sync:${hex}`;
}

export async function handleSync(req: Request, kv: KV | null): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.has('ping')) return json({ ok: true, configured: !!kv });
  if (!kv) return json({ error: 'Sync database is not configured on the server.' }, 503);

  const code = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!CODE_RE.test(code)) return json({ error: 'Missing or invalid sync code.' }, 401);
  const key = await keyFor(code);

  if (req.method === 'GET') {
    const stored = await kv.get(key);
    return json(stored ?? { version: 0, updatedAt: null, data: null });
  }

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: 'Your data is too large to sync (over ~900 KB). Export a backup and delete old holes.' }, 413);
    let body: { baseVersion?: number; data?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'Missing data.' }, 400);
    const current = await kv.get(key);
    const currentVersion = current?.version ?? 0;
    // Someone else (another device) wrote first: hand back their copy to merge.
    if ((body.baseVersion ?? 0) !== currentVersion) return json(current ?? { version: 0, updatedAt: null, data: null }, 409);
    const next: Stored = { version: currentVersion + 1, updatedAt: new Date().toISOString(), data: body.data };
    await kv.set(key, next);
    return json({ version: next.version, updatedAt: next.updatedAt });
  }

  return json({ error: 'Method not allowed.' }, 405);
}

/** Upstash via the Vercel integration exposes either UPSTASH_* or KV_* variables. */
export function redisKV(env: Record<string, string | undefined> = process.env): KV | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  return {
    get: (key) => redis.get<Stored>(key),
    set: async (key, value) => {
      await redis.set(key, value);
    },
  };
}

/** In-memory store used by the local dev server and tests. */
export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: async (k) => (m.has(k) ? (JSON.parse(m.get(k)!) as Stored) : null),
    set: async (k, v) => {
      m.set(k, JSON.stringify(v));
    },
  };
}

export const GET = (req: Request) => handleSync(req, redisKV());
export const PUT = (req: Request) => handleSync(req, redisKV());
