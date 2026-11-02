import { describe, expect, it } from 'vitest';
import { fitSeeds, normalizeTasks, offlineBrief, offlinePlan, rebalance, holeProgress } from '../planner';
import { recommend, tagSimilarity, threadSuggestions } from '../recommend';
import { extractJSON } from '../ai/providers';
import { CATALOG } from '../catalog';
import type { Hole, Profile } from '../types';
import { addDays, isoDate } from '../util';

const profile = (over: Partial<Profile> = {}): Profile => ({
  name: 't',
  onboarded: true,
  adventurousness: 0.5,
  domainAffinity: {},
  tagAffinity: {},
  topicSignals: {},
  defaultMinutes: 45,
  style: 'mixed',
  ...over,
});

const mkHole = (start: string, budgets = Array(7).fill(45)): Hole => {
  const entry = CATALOG[0];
  const brief = offlineBrief(entry.title, entry);
  return {
    id: 'h1', topic: entry.title, title: entry.title, tagline: '', domain: entry.domain, tags: entry.tags, catalogId: entry.id,
    createdAt: new Date().toISOString(), startDate: start, status: 'active', depth: 'committed', style: 'mixed',
    brief, days: offlinePlan(entry.title, brief, start, budgets, 'mixed', 'committed'), questions: [], quizzes: [], explanations: [], source: 'offline',
  };
};

describe('planner', () => {
  it('never schedules more core minutes than the daily budget', () => {
    for (const budget of [10, 15, 30, 45, 60, 90, 180]) {
      const brief = offlineBrief('Black holes');
      const days = offlinePlan('Black holes', brief, isoDate(), Array(7).fill(budget), 'video', 'obsessed');
      for (const d of days) {
        const core = d.tasks.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0);
        expect(core).toBeLessThanOrEqual(budget);
        expect(d.tasks.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives rest days no tasks', () => {
    const days = offlinePlan('X', offlineBrief('X'), isoDate(), [30, 0, 30, 0, 30, 0, 30], 'mixed', 'curious');
    expect(days[1].tasks).toHaveLength(0);
    expect(days[2].tasks.length).toBeGreaterThan(0);
  });

  it('keeps the highest-priority task when the budget is tiny', () => {
    const tasks = fitSeeds(
      [
        { kind: 'read', title: 'low', description: '', why: '', checkpoint: '', ideal: 30, min: 20, priority: 1 },
        { kind: 'read', title: 'high', description: '', why: '', checkpoint: '', ideal: 30, min: 20, priority: 9 },
      ],
      10,
    );
    expect(tasks.map((t) => t.title)).toEqual(['high']);
  });

  it('scales over-long model plans down to the budget', () => {
    const tasks = normalizeTasks(
      [
        { title: 'a', minutes: 60, kind: 'read' },
        { title: 'b', minutes: 60, kind: 'bogus' as never },
        { title: 'c', minutes: 60, kind: 'explain' },
      ],
      45,
    );
    const core = tasks.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0);
    expect(core).toBeLessThanOrEqual(45 * 1.15);
    expect(tasks[1].kind).toBe('read');
  });

  it('rebalance moves unfinished past tasks forward without losing any', () => {
    const start = addDays(isoDate(), -3);
    const h = mkHole(start);
    const before = h.days.flatMap((d) => d.tasks).length;
    const { hole, moved, trimmed } = rebalance(h);
    // Future days are full, so carried work becomes bonus rather than overloading them.
    expect(moved + trimmed).toBeGreaterThan(0);
    expect(hole.days.flatMap((d) => d.tasks).length).toBe(before);
    for (let i = 0; i < 3; i++) expect(hole.days[i].tasks.filter((t) => !t.done && !t.optional)).toHaveLength(0);
    expect(holeProgress(hole).total).toBeGreaterThan(0);
  });
});

describe('rebalance with room', () => {
  it('moves tasks as core work when later days have spare time', () => {
    const start = addDays(isoDate(), -2);
    const h = mkHole(start, [45, 45, 45, 45, 45, 45, 45]);
    // Free up room on the days ahead.
    h.days = h.days.map((d) => (d.index >= 2 ? { ...d, budget: 150 } : d));
    const { moved, hole } = rebalance(h);
    expect(moved).toBeGreaterThan(0);
    for (const d of hole.days.slice(2)) {
      const core = d.tasks.filter((t) => !t.optional && !t.done).reduce((s, t) => s + t.minutes, 0);
      expect(core).toBeLessThanOrEqual(d.budget);
    }
  });
});

describe('recommender', () => {
  it('returns a mix of buckets without duplicates', () => {
    const recs = recommend(profile({ domainAffinity: { music: 2 }, tagAffinity: { perception: 1.5, mind: 1 } }), [], { seed: 3, count: 9 });
    expect(recs.length).toBe(9);
    expect(new Set(recs.map((r) => r.topic.id)).size).toBe(9);
    const buckets = new Set(recs.map((r) => r.bucket));
    expect(buckets.has('alley') && buckets.has('hop') && buckets.has('wildcard')).toBe(true);
    expect(recs.every((r) => r.reason.length > 0)).toBe(true);
  });

  it('puts liked domains in "down your alley"', () => {
    const recs = recommend(profile({ domainAffinity: { space: 4 }, tagAffinity: { gravity: 3 } }), [], { seed: 1, count: 9 });
    expect(recs.filter((r) => r.bucket === 'alley').some((r) => r.topic.domain === 'space')).toBe(true);
  });

  it('more adventurous means more wildcards', () => {
    const calm = recommend(profile({ adventurousness: 0 }), [], { seed: 1 }).filter((r) => r.bucket === 'wildcard').length;
    const wild = recommend(profile({ adventurousness: 1 }), [], { seed: 1 }).filter((r) => r.bucket === 'wildcard').length;
    expect(wild).toBeGreaterThan(calm);
  });

  it('skips recently dismissed topics and topics already explored', () => {
    const id = CATALOG[5].id;
    const recs = recommend(profile({ topicSignals: { [id]: { shown: 0, dismissedAt: new Date().toISOString() } } }), [mkHole(isoDate())], { count: 60 });
    expect(recs.some((r) => r.topic.id === id)).toBe(false);
    expect(recs.some((r) => r.topic.id === CATALOG[0].id)).toBe(false);
  });

  it('tag similarity is symmetric and bounded', () => {
    expect(tagSimilarity('mind', 'perception')).toBeCloseTo(tagSimilarity('perception', 'mind'));
    expect(tagSimilarity('mind', 'mind')).toBe(1);
    expect(tagSimilarity('mind', 'perception')).toBeLessThanOrEqual(1);
  });

  it('turns parked questions into thread suggestions', () => {
    const h = mkHole(isoDate());
    h.questions.push({ id: 'q', text: 'Why is the sky dark at night?', createdAt: '', dayIndex: 0 });
    expect(threadSuggestions([h])[0].topic.title).toContain('sky');
  });
});

describe('extractJSON', () => {
  it('handles fences, think tags, prose and trailing commas', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJSON('<think>hmm</think>{"a":2}')).toEqual({ a: 2 });
    expect(extractJSON('Sure! Here you go: {"a":[1,2,],} hope that helps')).toEqual({ a: [1, 2] });
    expect(() => extractJSON('no json here')).toThrow();
  });
});
