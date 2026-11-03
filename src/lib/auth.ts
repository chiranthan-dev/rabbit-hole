// Client side of accounts: who is logged in, and the calls that change it.
// The session itself is an HttpOnly cookie the browser handles; we never see it.

import { create } from 'zustand';
import { useStore } from './store';
import { connect, disconnect, syncNow } from './sync';

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

type Status = 'loading' | 'in' | 'out' | 'unavailable';

export const useAuth = create<{ status: Status; user: AccountUser | null; message?: string }>(() => ({ status: 'loading', user: null }));

const API = '/api/account';

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(op: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}?op=${op}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AuthError('You’re offline. Check your connection and try again.', 0);
  }
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new AuthError('Accounts aren’t available on this copy of the app.', 503);
  const data = await res.json();
  if (!res.ok) throw new AuthError(data.error ?? `Request failed (${res.status}).`, res.status);
  return data as T;
}

/** Link this device's data to the account that just signed in. */
function adopt(user: AccountUser) {
  const s = useStore.getState();
  // Data on this device belongs to someone else? Clear it before syncing.
  if (s.sync.userId && s.sync.userId !== user.id) s.resetAll();
  if (!useStore.getState().profile.name) useStore.getState().setProfile({ name: user.name });
  useAuth.setState({ status: 'in', user, message: undefined });
  if (useStore.getState().sync.userId !== user.id) connect(user.id);
  else void syncNow();
}

/** Check the session on startup. */
export async function refreshAuth() {
  try {
    const { user } = await call<{ user: AccountUser }>('me');
    adopt(user);
  } catch (e) {
    const err = e as AuthError;
    if (err.status === 401) {
      // The session expired or was signed out elsewhere: stop syncing, keep working locally.
      const wasLinked = !!useStore.getState().sync.userId;
      useAuth.setState({ status: 'out', user: null, message: wasLinked ? 'You were signed out. Log in again to keep your devices in sync.' : undefined });
    } else if (err.status === 0) {
      // Offline: if this device was linked, assume still logged in; sync resumes later.
      const linked = useStore.getState().sync.userId;
      useAuth.setState({ status: linked ? 'in' : 'out', user: null });
    } else useAuth.setState({ status: 'unavailable', user: null, message: err.message });
  }
}

export async function signUp(name: string, email: string, password: string) {
  const r = await call<{ user: AccountUser; recoveryCode: string }>('signup', { body: { name, email, password } });
  adopt(r.user);
  return r.recoveryCode;
}

export async function logIn(email: string, password: string) {
  const r = await call<{ user: AccountUser }>('login', { body: { email, password } });
  adopt(r.user);
  return r.user;
}

export async function resetPassword(email: string, recoveryCode: string, next: string) {
  const r = await call<{ user: AccountUser; recoveryCode: string }>('reset', { body: { email, recoveryCode, next } });
  adopt(r.user);
  return r.recoveryCode;
}

export async function changePassword(current: string, next: string) {
  await call('password', { body: { current, next } });
}

/** Log out and remove this account's data from this device (it stays safe in the account). */
export async function logOut(everywhere = false) {
  await syncNow(); // save anything unsynced first
  try {
    await call(everywhere ? 'logout-all' : 'logout', { body: {} });
  } catch {
    /* the cookie is cleared server-side; local cleanup below still happens */
  }
  disconnect();
  useStore.getState().resetAll();
  useAuth.setState({ status: 'out', user: null, message: undefined });
}

export async function deleteAccount(password: string) {
  await call('delete', { body: { password } });
  disconnect();
  useStore.getState().resetAll();
  useAuth.setState({ status: 'out', user: null, message: undefined });
}

export async function accountsAvailable() {
  try {
    const r = await fetch(`${API}?op=ping`);
    if (!(r.headers.get('content-type') ?? '').includes('json')) return false;
    return Boolean((await r.json()).configured);
  } catch {
    return false;
  }
}
