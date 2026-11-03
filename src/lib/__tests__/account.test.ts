import { describe, expect, it } from 'vitest';
import { handleAccount, memoryKV, type KV } from '../../../api/account';

type Jar = { cookie?: string };
const call = async (kv: KV, jar: Jar, method: string, op: string, body?: unknown, ip = '1.1.1.1') => {
  const res = await handleAccount(
    new Request(`https://rh.test/api/account?op=${op}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(jar.cookie ? { cookie: jar.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    kv,
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
