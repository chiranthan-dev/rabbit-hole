// Keeps your data in step across every device you're logged in on (/api/account?op=data).
//
// Every change on this device is timestamped per section (profile, each
// hole, saved topics…). On sync we fetch the server copy, merge section by
// section (newest wins, deletions are remembered), apply the result locally
// and push it back if it differs. The server rejects stale writes (409), in
// which case we simply merge again.

import { create } from 'zustand';
import { emptyMeta, useStore, type SyncMeta } from './store';
import type { CatalogTopic, Hole, Profile } from './types';

export interface Payload {
  profile: Profile;
  holes: Hole[];
  savedTopics: CatalogTopic[];
  activeHoleId?: string;
  aiSuggestions: { at: string; items: (CatalogTopic & { why: string })[] } | null;
  meta: SyncMeta;
}

type Status = 'off' | 'syncing' | 'synced' | 'error' | 'offline' | 'unavailable';
export const useSyncStatus = create<{ status: Status; message?: string; at?: number }>(() => ({ status: 'off' }));
const setStatus = (status: Status, message?: string) => useSyncStatus.setState({ status, message, at: Date.now() });

// ------------------------------------------------------------------ merge (pure)

const ts = (m: Record<string, number>, id: string, exists: boolean) => m[id] ?? (exists ? 1 : 0);

export function merge(local: Payload, remote: Payload): Payload {
  const lm = { ...emptyMeta(), ...local.meta };
  const rm = { ...emptyMeta(), ...remote.meta };
  // Same key order as emptyMeta() so unchanged data serialises identically.
  const meta: SyncMeta = {
    profileAt: Math.max(lm.profileAt, rm.profileAt),
    holesAt: {},
    deleted: { ...lm.deleted },
    savedAt: Math.max(lm.savedAt, rm.savedAt),
    activeAt: Math.max(lm.activeAt, rm.activeAt),
    ideasAt: Math.max(lm.ideasAt, rm.ideasAt),
  };
  for (const [id, t] of Object.entries(rm.deleted)) meta.deleted[id] = Math.max(meta.deleted[id] ?? 0, t);

  const lh = new Map(local.holes.map((h) => [h.id, h]));
  const rh = new Map(remote.holes.map((h) => [h.id, h]));
  const holes: Hole[] = [];
  for (const id of new Set([...lh.keys(), ...rh.keys()])) {
    const l = lh.get(id);
    const r = rh.get(id);
    const lt = ts(lm.holesAt, id, !!l);
    const rt = ts(rm.holesAt, id, !!r);
    const pick = r && (!l || rt > lt) ? r : l!;
    const at = Math.max(lt, rt);
    if ((meta.deleted[id] ?? 0) >= at) continue; // deleted after its last edit
    holes.push(pick);
    meta.holesAt[id] = at;
  }
  holes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const remoteNewer = (l: number, r: number) => r > l;
  const activeHoleId = remoteNewer(lm.activeAt, rm.activeAt) ? remote.activeHoleId : local.activeHoleId;
  return {
    // A set-up profile always beats a blank one (e.g. a phone that was just linked).
    profile:
      remote.profile?.onboarded && !local.profile?.onboarded
        ? remote.profile
        : local.profile?.onboarded && !remote.profile?.onboarded
          ? local.profile
          : remoteNewer(lm.profileAt, rm.profileAt)
            ? remote.profile
            : local.profile,
    holes,
    savedTopics: remoteNewer(lm.savedAt, rm.savedAt) ? remote.savedTopics : local.savedTopics,
    activeHoleId: holes.some((h) => h.id === activeHoleId) ? activeHoleId : holes.find((h) => h.status === 'active')?.id,
    aiSuggestions: remoteNewer(lm.ideasAt, rm.ideasAt) ? remote.aiSuggestions : local.aiSuggestions,
    meta,
  };
}

// ------------------------------------------------------------------ local state

export const snapshot = (): Payload => {
  const s = useStore.getState();
  return {
    profile: s.profile,
    holes: s.holes,
    savedTopics: s.savedTopics,
    activeHoleId: s.activeHoleId,
    aiSuggestions: s.aiSuggestions,
    meta: s.sync.meta,
  };
};

let applying = false;
function apply(p: Payload) {
  applying = true;
  try {
    useStore.setState((s) => ({
      profile: p.profile,
      holes: p.holes,
      savedTopics: p.savedTopics,
      activeHoleId: p.activeHoleId,
      aiSuggestions: p.aiSuggestions,
      sync: { ...s.sync, meta: p.meta },
    }));
  } finally {
    applying = false;
  }
}

const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

// ------------------------------------------------------------------ network

const API = '/api/account?op=data';
const authed = (init: RequestInit = {}) =>
  fetch(API, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' } });

/** Called when the server says the session is gone (set by auth.ts, avoiding a circular import). */
let onUnauthorized: () => void = () => {};
export const setOnUnauthorized = (fn: () => void) => (onUnauthorized = fn);

let running = false;
let again = false;

export async function syncNow(): Promise<void> {
  const userId = useStore.getState().sync.userId;
  if (!userId) {
    setStatus('off');
    return;
  }
  if (running) {
    again = true;
    return;
  }
  running = true;
  setStatus('syncing');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      let res: Response;
      try {
        res = await authed();
      } catch {
        setStatus('offline', 'Offline — changes will sync when you’re back.');
        return;
      }
      if (!(res.headers.get('content-type') ?? '').includes('json')) {
        setStatus('unavailable', 'No sync server here.');
        return;
      }
      const remote = (await res.json()) as { version: number; data: Payload | null; error?: string };
      if (res.status === 401) {
        setStatus('error', 'Signed out — log in again to keep syncing.');
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        setStatus(res.status === 503 ? 'unavailable' : 'error', remote.error ?? `Sync failed (${res.status}).`);
        return;
      }
      const local = snapshot();
      const merged = remote.data ? merge(local, remote.data) : local;
      if (!same(merged, local)) apply(merged);
      if (remote.data && same(merged, remote.data)) {
        useStore.getState().setSync({ version: remote.version, lastSyncAt: new Date().toISOString() });
        setStatus('synced');
        return;
      }
      const put = await authed({ method: 'PUT', body: JSON.stringify({ baseVersion: remote.version, data: merged }) });
      if (put.status === 409) continue; // another device wrote first — merge again
      const out = await put.json().catch(() => ({}));
      if (!put.ok) {
        setStatus('error', out.error ?? `Sync failed (${put.status}).`);
        return;
      }
      useStore.getState().setSync({ version: out.version, lastSyncAt: new Date().toISOString() });
      setStatus('synced');
      return;
    }
    setStatus('error', 'Too many conflicting edits — try again.');
  } catch (e) {
    setStatus('error', (e as Error).message);
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

// ------------------------------------------------------------------ change tracking + triggers

let started = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

export function startSync() {
  if (started) return;
  started = true;

  useStore.subscribe((s, prev) => {
    if (applying || !s.sync.userId) return;
    if (s.sync.userId !== prev.sync.userId) {
      void syncNow();
      return;
    }
    const now = Date.now();
    const meta: SyncMeta = { ...emptyMeta(), ...s.sync.meta, holesAt: { ...s.sync.meta.holesAt }, deleted: { ...s.sync.meta.deleted } };
    let changed = false;
    if (s.profile !== prev.profile) (meta.profileAt = now), (changed = true);
    if (s.savedTopics !== prev.savedTopics) (meta.savedAt = now), (changed = true);
    if (s.activeHoleId !== prev.activeHoleId) (meta.activeAt = now), (changed = true);
    if (s.aiSuggestions !== prev.aiSuggestions) (meta.ideasAt = now), (changed = true);
    if (s.holes !== prev.holes) {
      const before = new Map(prev.holes.map((h) => [h.id, h]));
      for (const h of s.holes) if (before.get(h.id) !== h) (meta.holesAt[h.id] = now), (changed = true);
      const ids = new Set(s.holes.map((h) => h.id));
      for (const id of before.keys())
        if (!ids.has(id)) {
          meta.deleted[id] = now;
          delete meta.holesAt[id];
          changed = true;
        }
    }
    if (!changed) return;
    applying = true;
    useStore.setState({ sync: { ...s.sync, meta } });
    applying = false;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void syncNow(), 1500);
  });

  const onVisible = () => document.visibilityState === 'visible' && void syncNow();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('online', () => void syncNow());
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 45_000);
  void syncNow();
}

// ------------------------------------------------------------------ account link

/**
 * Start syncing this device with an account. The device's own stamps stay as
 * they are, so the account's copy wins where both have something, while
 * anything only this device has (e.g. holes made as a guest) is kept and uploaded.
 */
export function connect(userId: string) {
  useStore.getState().setSync({ userId, version: 0 });
}

export function disconnect() {
  useStore.getState().setSync({ userId: undefined, version: 0, lastSyncAt: undefined });
  setStatus('off');
}

/** Run a sync and wait until it (and any follow-up run) has finished. */
export async function syncSettled(timeoutMs = 12_000) {
  const t0 = Date.now();
  await syncNow();
  while (running && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 100));
}
