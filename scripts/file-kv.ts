// A tiny file-backed key-value store for running Rabbit Hole on your own
// machine without Upstash: accounts and data survive restarts, saved in
// .data/local-db.json (git-ignored). Same interface as the Upstash store.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KV } from '../api/account';

type Entry = { v: string; exp?: number };

export function fileKV(path: string): KV {
  let db: Record<string, Entry> = {};
  try {
    if (existsSync(path)) db = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    db = {}; // unreadable file: start fresh rather than crash the dev server
  }
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(db));
  };
  const live = (k: string) => {
    const e = db[k];
    if (e?.exp && e.exp < Date.now()) {
      delete db[k];
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
      db[k] = { v: JSON.stringify(v), exp: o?.ex ? Date.now() + o.ex * 1000 : undefined };
      save();
      return true;
    },
    del: async (k) => {
      delete db[k];
      save();
    },
    incr: async (k, w) => {
      const e = live(k);
      const n = (e ? Number(JSON.parse(e.v)) : 0) + 1;
      db[k] = { v: JSON.stringify(n), exp: e?.exp ?? Date.now() + w * 1000 };
      save();
      return n;
    },
  };
}
