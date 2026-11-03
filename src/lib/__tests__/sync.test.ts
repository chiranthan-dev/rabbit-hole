import { describe, expect, it } from 'vitest';
import { merge, type Payload } from '../sync';
import { emptyMeta } from '../store';
import type { Hole, Profile } from '../types';

const hole = (id: string, title: string, createdAt = '2026-01-01'): Hole => ({ id, title, createdAt } as unknown as Hole);
const profile = (name: string) => ({ name } as unknown as Profile);
const payload = (p: Partial<Payload>): Payload => ({ profile: profile('x'), holes: [], savedTopics: [], aiSuggestions: null, meta: emptyMeta(), ...p });

describe('merge', () => {
  it('newest profile wins', () => {
    const a = payload({ profile: profile('laptop'), meta: { ...emptyMeta(), profileAt: 10 } });
    const b = payload({ profile: profile('phone'), meta: { ...emptyMeta(), profileAt: 20 } });
    expect(merge(a, b).profile.name).toBe('phone');
    expect(merge(b, a).profile.name).toBe('phone');
  });

  it('unions holes and keeps the newest edit of each', () => {
    const a = payload({ holes: [hole('1', 'old title'), hole('2', 'laptop only')], meta: { ...emptyMeta(), holesAt: { '1': 5, '2': 5 } } });
    const b = payload({ holes: [hole('1', 'new title'), hole('3', 'phone only', '2026-02-01')], meta: { ...emptyMeta(), holesAt: { '1': 9, '3': 9 } } });
    const m = merge(a, b);
    expect(m.holes.map((h) => h.title)).toEqual(['new title', 'laptop only', 'phone only']);
    expect(m.meta.holesAt).toEqual({ '1': 9, '2': 5, '3': 9 });
  });

  it('remembers deletions, unless the hole was edited afterwards', () => {
    const a = payload({ holes: [], meta: { ...emptyMeta(), deleted: { '1': 10, '2': 10 } } });
    const b = payload({ holes: [hole('1', 'stale'), hole('2', 'edited later')], meta: { ...emptyMeta(), holesAt: { '1': 8, '2': 12 } } });
    const m = merge(a, b);
    expect(m.holes.map((h) => h.id)).toEqual(['2']);
  });

  it('a brand-new device takes everything from the server', () => {
    const fresh = payload({ profile: profile('') });
    const server = payload({ profile: profile('Chiranthan'), holes: [hole('1', 'Fungi')], activeHoleId: '1', meta: { ...emptyMeta(), profileAt: 3, activeAt: 3, holesAt: { '1': 3 } } });
    const m = merge(fresh, server);
    expect(m.profile.name).toBe('Chiranthan');
    expect(m.activeHoleId).toBe('1');
    expect(m.holes).toHaveLength(1);
  });

  it('is stable when nothing changed', () => {
    const p = payload({ holes: [hole('1', 'x')], meta: { ...emptyMeta(), holesAt: { '1': 4 } } });
    expect(JSON.stringify(merge(p, p))).toBe(JSON.stringify(p));
  });
});
