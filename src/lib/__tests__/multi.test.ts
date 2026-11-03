import { beforeEach, describe, expect, it } from 'vitest';
import { activeCount, canStartHole, MAX_ACTIVE, useStore } from '../store';
import { offlineBrief, offlinePlan, rescheduleFromToday } from '../planner';
import type { Hole } from '../types';
import { addDays, isoDate } from '../util';

const mk = (id: string): Hole => {
  const brief = offlineBrief(id);
  return {
    id,
    topic: id,
    title: id,
    tagline: '',
    domain: 'science',
    tags: ['x'],
    createdAt: new Date().toISOString(),
    startDate: isoDate(),
    status: 'active',
    depth: 'curious',
    style: 'mixed',
    brief,
    days: offlinePlan(id, brief, isoDate(), Array(7).fill(30), 'mixed', 'curious'),
    questions: [],
    quizzes: [],
    explanations: [],
    source: 'offline',
  };
};

describe('multiple rabbit holes', () => {
  beforeEach(() => useStore.getState().resetAll());

  it(`allows up to ${MAX_ACTIVE} at once without shelving the others`, () => {
    const s = useStore.getState();
    ['a', 'b', 'c'].forEach((id) => s.addHole(mk(id)));
    const st = useStore.getState();
    expect(activeCount(st.holes)).toBe(3);
    expect(st.activeHoleId).toBe('c'); // the newest is in focus
    expect(canStartHole(st.holes)).toBe(false);
  });

  it('refuses a fourth', () => {
    const s = useStore.getState();
    ['a', 'b', 'c', 'd'].forEach((id) => s.addHole(mk(id)));
    expect(useStore.getState().holes.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('shelving frees a slot and moves focus to another active hole', () => {
    const s = useStore.getState();
    ['a', 'b', 'c'].forEach((id) => s.addHole(mk(id)));
    s.abandonHole('c');
    const st = useStore.getState();
    expect(st.activeHoleId).toBe('a');
    expect(canStartHole(st.holes)).toBe(true);
  });

  it('resume respects the limit', () => {
    const s = useStore.getState();
    ['a', 'b', 'c'].forEach((id) => s.addHole(mk(id)));
    s.abandonHole('a');
    s.addHole(mk('d'));
    expect(useStore.getState().resumeHole('a')).toBe(false);
    s.abandonHole('b');
    expect(useStore.getState().resumeHole('a')).toBe(true);
    expect(useStore.getState().activeHoleId).toBe('a');
  });

  it('switching focus keeps each hole’s progress separate', () => {
    const s = useStore.getState();
    s.addHole(mk('a'));
    s.addHole(mk('b'));
    const taskA = useStore.getState().holes[0].days[0].tasks[0].id;
    s.completeTask('a', taskA, {});
    s.setActive('a');
    const st = useStore.getState();
    expect(st.holes[0].days[0].tasks[0].done).toBe(true);
    expect(st.holes[1].days[0].tasks.some((t) => t.done)).toBe(false);
  });
});


describe('resuming an old shelved hole', () => {
  beforeEach(() => useStore.getState().resetAll());

  it('slides unfinished days so the first one is today', () => {
    const h = mk('old');
    h.startDate = addDays(isoDate(), -20);
    h.days = h.days.map((d, i) => ({ ...d, date: addDays(h.startDate, i) }));
    h.days[0].tasks = h.days[0].tasks.map((t) => ({ ...t, done: true }));
    h.days[1].tasks = h.days[1].tasks.map((t) => ({ ...t, done: true }));
    const r = rescheduleFromToday(h);
    expect(r.days[2].date).toBe(isoDate()); // first unfinished day = today
    expect(r.days[0].date).toBe(addDays(isoDate(), -2));
    expect(r.days[0].tasks.every((t) => t.done)).toBe(true);
  });

  it('leaves an on-schedule hole alone', () => {
    const h = mk('now');
    expect(rescheduleFromToday(h)).toBe(h);
  });

  it('resume via the store reschedules and focuses the hole', () => {
    const s = useStore.getState();
    const h = mk('old');
    h.startDate = addDays(isoDate(), -30);
    h.days = h.days.map((d, i) => ({ ...d, date: addDays(h.startDate, i) }));
    s.addHole(h);
    s.abandonHole('old');
    expect(useStore.getState().resumeHole('old')).toBe(true);
    const st = useStore.getState();
    expect(st.activeHoleId).toBe('old');
    expect(st.holes[0].days[0].date).toBe(isoDate());
  });
});
