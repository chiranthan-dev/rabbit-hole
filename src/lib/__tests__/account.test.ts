import { describe, expect, it } from 'vitest';
import { createECDH, randomBytes } from 'node:crypto';
import { handleAccount, localClock, memoryKV, reminderFor, type Deps, type KV, type PushRequest } from '../../../api/account';

type Jar = { cookie?: string };
const call = async (kv: KV, jar: Jar, method: string, op: string, body?: unknown, ip = '1.1.1.1', deps: Deps = {}) => {
  const res = await handleAccount(
    new Request(`https://rh.test/api/account?op=${op}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(jar.cookie ? { cookie: jar.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    kv,
    deps,
  );
  const set = res.headers.get('set-cookie');
  if (set) jar.cookie = set.split(';')[0].endsWith('=') ? undefined : set.split(';')[0];
  return { status: res.status, body: await res.json(), setCookie: set };
};
const signup = (kv: KV, jar: Jar, email = 'ana@example.com', password = 'correct horse') =>
  call(kv, jar, 'POST', 'signup', { name: 'Ana', email, password });

describe('accounts', () => {
  it('reports when the database is missing', async () => {
    expect((await call(memoryKV(), {}, 'GET', 'ping')).body).toEqual({ ok: true, configured: true });
    expect((await handleAccount(new Request('https://x/api/account?op=me'), null)).status).toBe(503);
  });

  it('signs up with a secure session cookie and a recovery code', async () => {
    const kv = memoryKV();
    const jar: Jar = {};
    const r = await signup(kv, jar);
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ name: 'Ana', email: 'ana@example.com' });
    expect(r.body.user.pass).toBeUndefined();
    expect(r.body.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(r.setCookie).toMatch(/HttpOnly/);
    expect(r.setCookie).toMatch(/Secure/);
    expect(r.setCookie).toMatch(/SameSite=Lax/);
    expect((await call(kv, jar, 'GET', 'me')).body.user.name).toBe('Ana');
  });

  it('validates input and refuses duplicate emails (case-insensitive)', async () => {
    const kv = memoryKV();
    expect((await call(kv, {}, 'POST', 'signup', { name: 'A', email: 'nope', password: 'longenough' })).status).toBe(400);
    expect((await call(kv, {}, 'POST', 'signup', { name: 'A', email: 'a@b.co', password: 'short' })).status).toBe(400);
    await signup(kv, {});
    expect((await signup(kv, {}, 'ANA@example.com')).status).toBe(409);
  });

  it('logs in and out; wrong passwords get one generic message', async () => {
    const kv = memoryKV();
    await signup(kv, {});
    const jar: Jar = {};
    const bad = await call(kv, jar, 'POST', 'login', { email: 'ana@example.com', password: 'wrong password' });
    const unknown = await call(kv, jar, 'POST', 'login', { email: 'who@example.com', password: 'whatever1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
    expect((await call(kv, jar, 'POST', 'login', { email: ' Ana@Example.com ', password: 'correct horse' })).status).toBe(200);
    expect((await call(kv, jar, 'GET', 'me')).status).toBe(200);
    await call(kv, jar, 'POST', 'logout');
    expect((await call(kv, jar, 'GET', 'me')).status).toBe(401);
  });

  it('rate-limits password guessing', async () => {
    const kv = memoryKV();
    await signup(kv, {});
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call(kv, {}, 'POST', 'login', { email: 'ana@example.com', password: `guess-${i}xx` }, `9.9.9.${i}`)).status;
    expect(last).toBe(429);
  });

  it('keeps each user’s data private and versioned', async () => {
    const kv = memoryKV();
    const ana: Jar = {};
    const ben: Jar = {};
    await signup(kv, ana);
    await signup(kv, ben, 'ben@example.com');
    expect((await call(kv, ana, 'PUT', 'data', { baseVersion: 0, data: { holes: ['a'] } })).body.version).toBe(1);
    expect((await call(kv, ben, 'GET', 'data')).body.data).toBeNull();
    expect((await call(kv, ana, 'PUT', 'data', { baseVersion: 0, data: { holes: ['stale'] } })).status).toBe(409);
    expect((await call(kv, ana, 'GET', 'data')).body).toMatchObject({ version: 1, data: { holes: ['a'] } });
    expect((await call(kv, {}, 'GET', 'data')).status).toBe(401);
  });

  it('changing the password signs out other devices', async () => {
    const kv = memoryKV();
    const laptop: Jar = {};
    await signup(kv, laptop);
    const phone: Jar = {};
    await call(kv, phone, 'POST', 'login', { email: 'ana@example.com', password: 'correct horse' });
    expect((await call(kv, laptop, 'POST', 'password', { current: 'nope nope', next: 'new password 1' })).status).toBe(401);
    expect((await call(kv, laptop, 'POST', 'password', { current: 'correct horse', next: 'new password 1' })).status).toBe(200);
    expect((await call(kv, laptop, 'GET', 'me')).status).toBe(200);
    expect((await call(kv, phone, 'GET', 'me')).status).toBe(401);
    expect((await call(kv, {}, 'POST', 'login', { email: 'ana@example.com', password: 'new password 1' })).status).toBe(200);
  });

  it('resets a forgotten password with the recovery code (once)', async () => {
    const kv = memoryKV();
    const code = (await signup(kv, {})).body.recoveryCode as string;
    expect((await call(kv, {}, 'POST', 'reset', { email: 'ana@example.com', recoveryCode: 'AAAA-AAAA-AAAA-AAAA', next: 'brand new pw' })).status).toBe(401);
    const jar: Jar = {};
    const r = await call(kv, jar, 'POST', 'reset', { email: 'ana@example.com', recoveryCode: code.toLowerCase().replace(/-/g, ' '), next: 'brand new pw' });
    expect(r.status).toBe(200);
    expect(r.body.recoveryCode).not.toBe(code); // a fresh code replaces the used one
    expect((await call(kv, jar, 'GET', 'me')).status).toBe(200);
    expect((await call(kv, {}, 'POST', 'reset', { email: 'ana@example.com', recoveryCode: code, next: 'again again' })).status).toBe(401);
  });

  it('log out everywhere, and account deletion', async () => {
    const kv = memoryKV();
    const a: Jar = {};
    await signup(kv, a);
    const b: Jar = {};
    await call(kv, b, 'POST', 'login', { email: 'ana@example.com', password: 'correct horse' });
    await call(kv, a, 'POST', 'logout-all');
    expect((await call(kv, b, 'GET', 'me')).status).toBe(401);
    const c: Jar = {};
    await call(kv, c, 'POST', 'login', { email: 'ana@example.com', password: 'correct horse' });
    await call(kv, c, 'PUT', 'data', { baseVersion: 0, data: { x: 1 } });
    expect((await call(kv, c, 'POST', 'delete', { password: 'wrong one!' })).status).toBe(401);
    expect((await call(kv, c, 'POST', 'delete', { password: 'correct horse' })).status).toBe(200);
    expect((await call(kv, {}, 'POST', 'login', { email: 'ana@example.com', password: 'correct horse' })).status).toBe(401);
    expect((await signup(kv, {})).status).toBe(201); // email is free again
  });
});


// ------------------------------------------------------------------ notifications

/** A browser-like push subscription with real keys, so web-push can encrypt to it. */
const fakeSubscription = (n = 1) => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { endpoint: `https://push.example.com/send/${n}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
};

const today = (tz: string, d: Date) => localClock(tz, d).date;
const dataWithTasks = (date: string) => ({
  holes: [
    {
      id: 'h1',
      title: 'Training for an Ironman',
      status: 'active',
      days: [{ date, tasks: [{ title: 'Do a mini brick', minutes: 30 }, { title: 'Lab notes', minutes: 10 }, { title: 'Done one', minutes: 20, done: true }, { title: 'Bonus', minutes: 15, optional: true }] }],
    },
  ],
});

describe('notifications', () => {
  it('creates push keys once and serves the public key', async () => {
    const kv = memoryKV();
    const a = (await call(kv, {}, 'GET', 'push-config')).body.publicKey;
    const b = (await call(kv, {}, 'GET', 'push-config')).body.publicKey;
    expect(a).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b).toBe(a);
  });

  it('needs an account and a valid subscription', async () => {
    const kv = memoryKV();
    expect((await call(kv, {}, 'POST', 'push-subscribe', { subscription: fakeSubscription(), tz: 'Asia/Kolkata', time: '19:00' })).status).toBe(401);
    const jar: Jar = {};
    await signup(kv, jar);
    expect((await call(kv, jar, 'POST', 'push-subscribe', { subscription: { endpoint: 'http://insecure', keys: {} }, tz: 'UTC', time: '19:00' })).status).toBe(400);
    const sub = fakeSubscription();
    expect((await call(kv, jar, 'POST', 'push-subscribe', { subscription: sub, tz: 'Asia/Kolkata', time: '19:30' })).body).toMatchObject({ ok: true, tz: 'Asia/Kolkata', time: '19:30' });
    expect((await call(kv, jar, 'POST', 'push-status', { endpoint: sub.endpoint })).body).toMatchObject({ subscribed: true, devices: 1, time: '19:30' });
  });

  it('sends a test notification as an encrypted Web Push request', async () => {
    const kv = memoryKV();
    const jar: Jar = {};
    await signup(kv, jar);
    await call(kv, jar, 'POST', 'push-subscribe', { subscription: fakeSubscription(), tz: 'UTC', time: '19:00' });
    const sent: PushRequest[] = [];
    const r = await call(kv, jar, 'POST', 'push-test', {}, '1.1.1.1', { send: async (req) => (sent.push(req), 201) });
    expect(r.body).toEqual({ sent: 1, failed: 0 });
    expect(sent[0].endpoint).toBe('https://push.example.com/send/1');
    expect(sent[0].headers.Authorization).toMatch(/^vapid t=/);
    expect(sent[0].headers['Content-Encoding']).toBe('aes128gcm');
  });

  it('sends the daily reminder once, after the chosen local time, with today’s tasks', async () => {
    const kv = memoryKV();
    const jar: Jar = {};
    await signup(kv, jar);
    await call(kv, jar, 'POST', 'push-subscribe', { subscription: fakeSubscription(), tz: 'Asia/Kolkata', time: '19:00' });
    // 13:00 UTC = 18:30 in India → too early; 13:40 UTC = 19:10 → due
    const early = new Date('2026-11-25T13:00:00Z');
    const due = new Date('2026-11-25T13:40:00Z');
    await call(kv, jar, 'PUT', 'data', { baseVersion: 0, data: dataWithTasks(today('Asia/Kolkata', due)) });
    const payloads: string[] = [];
    const deps = (now: Date): Deps => ({ now: () => now, send: async () => (payloads.push('x'), 201) });
    const run = async (now: Date) => {
      await kv.del('rh:cron:lock'); // the throttle is per few minutes; reset it between simulated runs
      return (await call(kv, {}, 'POST', 'cron', undefined, '1.1.1.1', deps(now))).body;
    };
    expect(await run(early)).toEqual({ checked: 1, sent: 0 });
    expect(await run(due)).toEqual({ checked: 1, sent: 1 });
    expect(await run(new Date('2026-11-25T14:30:00Z'))).toEqual({ checked: 1, sent: 0 }); // once a day
  });

  it('throttles the schedule endpoint', async () => {
    const kv = memoryKV();
    expect((await call(kv, {}, 'POST', 'cron')).body).toMatchObject({ checked: 0 });
    expect((await call(kv, {}, 'POST', 'cron')).body).toEqual({ skipped: true });
  });

  it('forgets devices the push service says are gone', async () => {
    const kv = memoryKV();
    const jar: Jar = {};
    await signup(kv, jar);
    const sub = fakeSubscription();
    await call(kv, jar, 'POST', 'push-subscribe', { subscription: sub, tz: 'UTC', time: '19:00' });
    await call(kv, jar, 'POST', 'push-test', {}, '1.1.1.1', { send: async () => 410 });
    expect((await call(kv, jar, 'POST', 'push-status', { endpoint: sub.endpoint })).body).toMatchObject({ subscribed: false, devices: 0 });
    expect(await kv.smembers('rh:pushusers')).toEqual([]);
  });

  it('unsubscribe and account deletion remove push data', async () => {
    const kv = memoryKV();
    const jar: Jar = {};
    await signup(kv, jar);
    const sub = fakeSubscription();
    await call(kv, jar, 'POST', 'push-subscribe', { subscription: sub, tz: 'UTC', time: '19:00' });
    await call(kv, jar, 'POST', 'push-unsubscribe', { endpoint: sub.endpoint });
    expect(await kv.smembers('rh:pushusers')).toEqual([]);
    await call(kv, jar, 'POST', 'push-subscribe', { subscription: sub, tz: 'UTC', time: '19:00' });
    await call(kv, jar, 'POST', 'delete', { password: 'correct horse' });
    expect(await kv.smembers('rh:pushusers')).toEqual([]);
  });
});

describe('reminder text', () => {
  it('names the hole, what is left and the next task', () => {
    const r = reminderFor(dataWithTasks('2026-11-25'), '2026-11-25', 3)!;
    expect(r.title).toBe('Training for an Ironman');
    expect(r.body).toBe('2 tasks left today · 40 min. Next: Do a mini brick');
  });
  it('summarises several holes', () => {
    const d = dataWithTasks('2026-11-25');
    d.holes.push({ ...d.holes[0], id: 'h2', title: 'Cosmere' });
    expect(reminderFor(d, '2026-11-25', 3)!.body).toBe('Training for an Ironman: 2 left · Cosmere: 2 left — 80 min in all');
  });
  it('nudges a wrap-up when the week is over, and stays quiet when all is done', () => {
    expect(reminderFor(dataWithTasks('2026-11-20'), '2026-11-25', 3)!.tag).toBe('wrapup');
    const done = dataWithTasks('2026-11-25');
    done.holes[0].days[0].tasks.forEach((t) => ((t as { done?: boolean }).done = true));
    expect(reminderFor(done, '2026-11-25', 3)).toBeNull();
  });
  it('suggests a new hole on Sundays only when none is running', () => {
    const idle = { holes: [{ id: 'x', title: 'Old', status: 'completed', days: [] }] };
    expect(reminderFor(idle, '2026-11-29', 0)!.tag).toBe('weekly');
    expect(reminderFor(idle, '2026-11-25', 3)).toBeNull();
    expect(reminderFor({ holes: [] }, '2026-11-29', 0)).toBeNull();
  });
});
