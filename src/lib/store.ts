import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AISettings,
  CatalogTopic,
  Concept,
  Domain,
  Explanation,
  FinalReflection,
  Hole,
  Profile,
  QuizAttempt,
  Task,
  UISettings,
  Understanding,
} from './types';
import { clamp, isoDate, uid } from './util';
import { revisitTask } from './planner';

const AFFINITY_MIN = -3;
const AFFINITY_MAX = 5;

/** Nudge interest weights. This is how the recommender learns. */
function bump(p: Profile, domain: Domain, tags: string[], dDomain: number, dTag: number): Profile {
  const domainAffinity = { ...p.domainAffinity };
  domainAffinity[domain] = clamp((domainAffinity[domain] ?? 0) + dDomain, AFFINITY_MIN, AFFINITY_MAX);
  const tagAffinity = { ...p.tagAffinity };
  for (const t of tags) tagAffinity[t] = clamp((tagAffinity[t] ?? 0) + dTag, AFFINITY_MIN, AFFINITY_MAX);
  return { ...p, domainAffinity, tagAffinity };
}

const sigOf = (p: Profile, id: string) => p.topicSignals[id] ?? { shown: 0 };

const defaultProfile: Profile = {
  name: '',
  onboarded: false,
  adventurousness: 0.5,
  domainAffinity: {},
  tagAffinity: {},
  topicSignals: {},
  defaultMinutes: 45,
  style: 'mixed',
};

export const defaultAI: AISettings = {
  provider: 'manual',
  ollama: { baseUrl: '/ollama', model: 'qwen2.5:7b' },
  openai: { baseUrl: '/lmstudio/v1', model: 'qwen2.5-7b-instruct', apiKey: '' },
  anthropic: { apiKey: '', model: 'claude-opus-5-5', webSearch: true },
  temperature: 0.6,
};

const defaultUI: UISettings = { motion: 'full', background: 'animated', sounds: false };

/** When each part of your data last changed on this device (ms). Used to merge across devices. */
export interface SyncMeta {
  profileAt: number;
  holesAt: Record<string, number>;
  deleted: Record<string, number>;
  savedAt: number;
  activeAt: number;
  ideasAt: number;
}
export interface SyncState {
  code?: string;
  version: number;
  lastSyncAt?: string;
  meta: SyncMeta;
}
export const emptyMeta = (): SyncMeta => ({ profileAt: 0, holesAt: {}, deleted: {}, savedAt: 0, activeAt: 0, ideasAt: 0 });

interface State {
  profile: Profile;
  holes: Hole[];
  activeHoleId?: string;
  ai: AISettings;
  ui: UISettings;
  savedTopics: CatalogTopic[];
  aiSuggestions: { at: string; items: (CatalogTopic & { why: string })[] } | null;
  discoverSeed: number;
  sync: SyncState;
  setSync: (p: Partial<SyncState>) => void;

  // profile & signals
  setProfile: (p: Partial<Profile>) => void;
  onboard: (args: { name: string; domains: Domain[]; adventurousness: number; minutes: number; style: Profile['style'] }) => void;
  likeTopic: (t: CatalogTopic) => void;
  dismissTopic: (t: CatalogTopic) => void;
  toggleSaved: (t: CatalogTopic) => void;
  markShown: (ids: string[]) => void;
  reshuffle: () => void;
  setAISuggestions: (items: (CatalogTopic & { why: string })[]) => void;

  // holes
  addHole: (h: Hole) => void;
  updateHole: (id: string, fn: (h: Hole) => Hole) => void;
  setActive: (id?: string) => void;
  /** Bring a shelved hole back. Returns false if you're already in MAX_ACTIVE holes. */
  resumeHole: (id: string) => boolean;
  patchTask: (holeId: string, taskId: string, patch: Partial<Task>) => void;
  completeTask: (holeId: string, taskId: string, r: { understanding?: Understanding; note?: string; spentMinutes?: number }) => void;
  uncompleteTask: (holeId: string, taskId: string) => void;
  addTask: (holeId: string, dayIndex: number, t: Task) => void;
  removeTask: (holeId: string, taskId: string) => void;
  addQuestion: (holeId: string, text: string, dayIndex: number) => void;
  patchQuestion: (holeId: string, qid: string, patch: { answer?: string; resolved?: boolean }) => void;
  removeQuestion: (holeId: string, qid: string) => void;
  setConcept: (holeId: string, cid: string, patch: Partial<Concept>) => void;
  addQuiz: (holeId: string, q: QuizAttempt) => void;
  addExplanation: (holeId: string, e: Explanation) => void;
  setReflection: (holeId: string, dayIndex: number, text: string, mood?: 1 | 2 | 3 | 4 | 5) => void;
  finishHole: (holeId: string, f: Omit<FinalReflection, 'completedAt'>) => void;
  abandonHole: (holeId: string) => void;
  deleteHole: (holeId: string) => void;

  // settings
  setAI: (a: Partial<AISettings>) => void;
  setUI: (u: Partial<UISettings>) => void;
  importData: (json: string) => void;
  resetAll: () => void;
}

const mapTasks = (h: Hole, fn: (t: Task, dayIndex: number) => Task): Hole => ({
  ...h,
  days: h.days.map((d) => ({ ...d, tasks: d.tasks.map((t) => fn(t, d.index)) })),
});

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const upd = (id: string, fn: (h: Hole) => Hole) =>
        set((s) => ({ holes: s.holes.map((h) => (h.id === id ? fn(h) : h)) }));
      return {
        profile: defaultProfile,
        holes: [],
        activeHoleId: undefined,
        ai: defaultAI,
        ui: defaultUI,
        savedTopics: [],
        aiSuggestions: null,
        discoverSeed: Math.floor(Math.random() * 1e9),
        sync: { version: 0, meta: emptyMeta() },
        setSync: (p) => set((s) => ({ sync: { ...s.sync, ...p } })),

        setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
        onboard: ({ name, domains, adventurousness, minutes, style }) =>
          set((s) => {
            let profile: Profile = { ...s.profile, name, adventurousness, defaultMinutes: minutes, style, onboarded: true };
            for (const d of domains) profile = bump(profile, d, [], 1.2, 0);
            return { profile };
          }),
        likeTopic: (t) =>
          set((s) => {
            const was = s.profile.topicSignals[t.id]?.liked;
            const sign = was ? -1 : 1;
            const profile = bump(s.profile, t.domain, t.tags, 0.4 * sign, 0.5 * sign);
            profile.topicSignals = { ...profile.topicSignals, [t.id]: { ...sigOf(profile, t.id), liked: !was } };
            return { profile };
          }),
        dismissTopic: (t) =>
          set((s) => {
            const profile = bump(s.profile, t.domain, t.tags, -0.15, -0.2);
            profile.topicSignals = {
              ...profile.topicSignals,
              [t.id]: { ...sigOf(profile, t.id), dismissedAt: new Date().toISOString() },
            };
            return { profile };
          }),
        toggleSaved: (t) =>
          set((s) => {
            const exists = s.savedTopics.some((x) => x.id === t.id);
            const profile = exists ? s.profile : bump(s.profile, t.domain, t.tags, 0.2, 0.25);
            return { profile, savedTopics: exists ? s.savedTopics.filter((x) => x.id !== t.id) : [t, ...s.savedTopics] };
          }),
        markShown: (ids) =>
          set((s) => {
            const topicSignals = { ...s.profile.topicSignals };
            for (const id of ids) topicSignals[id] = { ...topicSignals[id], shown: (topicSignals[id]?.shown ?? 0) + 1 };
            return { profile: { ...s.profile, topicSignals } };
          }),
        reshuffle: () => set((s) => ({ discoverSeed: s.discoverSeed + 7919 })),
        setAISuggestions: (items) => set({ aiSuggestions: { at: new Date().toISOString(), items } }),

        addHole: (h) =>
          set((s) => {
            let profile = bump(s.profile, h.domain, h.tags, 0.5, 0.4);
            const key = h.catalogId ?? h.id;
            profile = { ...profile, topicSignals: { ...profile.topicSignals, [key]: { ...sigOf(profile, key), startedAt: h.createdAt } } };
            // Up to MAX_ACTIVE holes run side by side; the new one becomes the one in focus.
            if (activeCount(s.holes) >= MAX_ACTIVE) return {};
            return { holes: [...s.holes, h], activeHoleId: h.id, profile, savedTopics: s.savedTopics.filter((t) => t.id !== h.catalogId) };
          }),
        updateHole: upd,
        setActive: (id) => set({ activeHoleId: id }),
        resumeHole: (id) => {
          const s = get();
          if (activeCount(s.holes) >= MAX_ACTIVE) return false;
          set({ holes: s.holes.map((h) => (h.id === id ? { ...h, status: 'active' } : h)), activeHoleId: id });
          return true;
        },
        patchTask: (holeId, taskId, patch) => upd(holeId, (h) => mapTasks(h, (t) => (t.id === taskId ? { ...t, ...patch } : t))),
        completeTask: (holeId, taskId, r) =>
          upd(holeId, (h) => {
            let target: Task | undefined;
            let targetDay = 0;
            let next = mapTasks(h, (t, di) => {
              if (t.id !== taskId) return t;
              target = { ...t, done: true, doneAt: new Date().toISOString(), skipped: false, ...r };
              targetDay = di;
              return target;
            });
            // Fuzzy understanding → schedule a spaced revisit tomorrow (if the week isn't over).
            const revisitTitle = target ? revisitTask(target).title : '';
            const already = next.days[targetDay + 1]?.tasks.some((t) => t.title === revisitTitle);
            if (target && r.understanding === 1 && targetDay < 6 && !already) {
              const rt = revisitTask(target);
              next = { ...next, days: next.days.map((d) => (d.index === targetDay + 1 ? { ...d, tasks: [...d.tasks, rt] } : d)) };
            }
            return next;
          }),
        uncompleteTask: (holeId, taskId) =>
          upd(holeId, (h) => mapTasks(h, (t) => (t.id === taskId ? { ...t, done: false, doneAt: undefined } : t))),
        addTask: (holeId, dayIndex, t) =>
          upd(holeId, (h) => ({ ...h, days: h.days.map((d) => (d.index === dayIndex ? { ...d, tasks: [...d.tasks, t] } : d)) })),
        removeTask: (holeId, taskId) =>
          upd(holeId, (h) => ({ ...h, days: h.days.map((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) })) })),
        addQuestion: (holeId, text, dayIndex) =>
          upd(holeId, (h) => ({
            ...h,
            questions: [...h.questions, { id: uid('q_'), text, dayIndex, createdAt: new Date().toISOString() }],
          })),
        patchQuestion: (holeId, qid, patch) =>
          upd(holeId, (h) => ({ ...h, questions: h.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) })),
        removeQuestion: (holeId, qid) => upd(holeId, (h) => ({ ...h, questions: h.questions.filter((q) => q.id !== qid) })),
        setConcept: (holeId, cid, patch) =>
          upd(holeId, (h) => ({
            ...h,
            brief: { ...h.brief, concepts: h.brief.concepts.map((c) => (c.id === cid ? { ...c, ...patch } : c)) },
          })),
        addQuiz: (holeId, q) => upd(holeId, (h) => ({ ...h, quizzes: [...h.quizzes.filter((x) => x.id !== q.id), q] })),
        addExplanation: (holeId, e) =>
          upd(holeId, (h) => ({ ...h, explanations: [...h.explanations.filter((x) => x.id !== e.id), e] })),
        setReflection: (holeId, dayIndex, text, mood) =>
          upd(holeId, (h) => ({
            ...h,
            days: h.days.map((d) => (d.index === dayIndex ? { ...d, reflection: text, mood: mood ?? d.mood } : d)),
          })),
        finishHole: (holeId, f) =>
          set((s) => {
            const h = s.holes.find((x) => x.id === holeId);
            if (!h) return {};
            const delta = (f.rating - 3) * 0.35 + (f.wantMore ? 0.3 : 0);
            let profile = bump(s.profile, h.domain, h.tags, delta, delta * 1.2);
            const key = h.catalogId ?? h.id;
            profile = { ...profile, topicSignals: { ...profile.topicSignals, [key]: { ...sigOf(profile, key), rating: f.rating } } };
            return {
              profile,
              holes: s.holes.map((x) =>
                x.id === holeId ? { ...x, status: 'completed', final: { ...f, completedAt: new Date().toISOString() } } : x,
              ),
            };
          }),
        abandonHole: (holeId) =>
          set((s) => ({
            holes: s.holes.map((h) => (h.id === holeId ? { ...h, status: 'abandoned' } : h)),
            activeHoleId: s.activeHoleId === holeId ? s.holes.find((h) => h.id !== holeId && h.status === 'active')?.id : s.activeHoleId,
          })),
        deleteHole: (holeId) =>
          set((s) => ({
            holes: s.holes.filter((h) => h.id !== holeId),
            activeHoleId: s.activeHoleId === holeId ? s.holes.find((h) => h.id !== holeId && h.status === 'active')?.id : s.activeHoleId,
          })),

        setAI: (a) => set((s) => ({ ai: { ...s.ai, ...a } })),
        setUI: (u) => set((s) => ({ ui: { ...s.ui, ...u } })),
        importData: (json) => {
          const data = JSON.parse(json);
          if (!data || !Array.isArray(data.holes) || !data.profile) throw new Error('Not a Rabbit Hole backup file.');
          set({
            profile: { ...defaultProfile, ...data.profile },
            holes: data.holes,
            activeHoleId: data.activeHoleId,
            savedTopics: data.savedTopics ?? [],
            ai: { ...get().ai, ...(data.ai ?? {}), anthropic: { ...get().ai.anthropic, ...(data.ai?.anthropic ?? {}) } },
          });
        },
        resetAll: () =>
          // Also disconnects sync on this device, so erasing here never erases your other devices.
          set({ profile: defaultProfile, holes: [], activeHoleId: undefined, savedTopics: [], aiSuggestions: null, ai: defaultAI, ui: defaultUI, sync: { version: 0, meta: emptyMeta() } }),
      };
    },
    {
      name: 'rabbit-hole',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ---------------- selectors ----------------

/** How many rabbit holes you can be in at once. */
export const MAX_ACTIVE = 3;
export const activeCount = (holes: Hole[]) => holes.filter((h) => h.status === 'active').length;
export const canStartHole = (holes: Hole[]) => activeCount(holes) < MAX_ACTIVE;

/** All holes you're currently in, oldest first. */
export const useActiveHoles = () => {
  const holes = useStore((s) => s.holes);
  return useMemo(() => holes.filter((h) => h.status === 'active'), [holes]);
};

/** The hole in focus: the one you last picked, or the first active one. */
export const useActiveHole = () =>
  useStore((s) => s.holes.find((h) => h.id === s.activeHoleId && h.status === 'active') ?? s.holes.find((h) => h.status === 'active'));

export const exportData = () => {
  const s = useStore.getState();
  // Never export API keys.
  const ai = { ...s.ai, anthropic: { ...s.ai.anthropic, apiKey: '' }, openai: { ...s.ai.openai, apiKey: '' } };
  return JSON.stringify(
    { app: 'rabbit-hole', exportedAt: new Date().toISOString(), profile: s.profile, holes: s.holes, activeHoleId: s.activeHoleId, savedTopics: s.savedTopics, ai },
    null,
    2,
  );
};

export function stats(holes: Hole[]) {
  const tasks = holes.flatMap((h) => h.days.flatMap((d) => d.tasks));
  const done = tasks.filter((t) => t.done);
  const minutes = done.reduce((s, t) => s + (t.spentMinutes ?? t.minutes), 0);
  const concepts = holes.flatMap((h) => h.brief.concepts);
  const clear = concepts.filter((c) => c.status === 'clear').length;
  const days = new Set(done.map((t) => (t.doneAt ? isoDate(new Date(t.doneAt)) : '')).filter(Boolean));
  // Streak = consecutive days up to today (or yesterday) with at least one finished task.
  let streak = 0;
  const d = new Date();
  if (!days.has(isoDate(d))) d.setDate(d.getDate() - 1);
  while (days.has(isoDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return {
    holesDone: holes.filter((h) => h.status === 'completed').length,
    tasksDone: done.length,
    minutes,
    conceptsClear: clear,
    questions: holes.reduce((s, h) => s + h.questions.length, 0),
    streak,
    activeDays: days.size,
  };
}
