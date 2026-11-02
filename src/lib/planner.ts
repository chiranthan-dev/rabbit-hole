// Deterministic planning: the learning arc, fitting tasks into a time
// budget, the offline plan builder, rebalancing and revisits.
// The AI path reuses the arc + fitting so plans stay achievable whichever
// engine wrote them.

import type {
  Brief,
  CatalogTopic,
  Day,
  Depth,
  Hole,
  LearningStyle,
  ResourceHint,
  Task,
  TaskKind,
} from './types';
import { addDays, clamp, isoDate, uid, daysBetween } from './util';

export const ARC: { theme: string; goal: string }[] = [
  { theme: 'Lay of the land', goal: 'Build a rough mental map and notice what you already believe.' },
  { theme: 'Foundations', goal: 'Get the core vocabulary and the first big ideas solid.' },
  { theme: 'How it works', goal: 'Understand the mechanism — the why, not just the what.' },
  { theme: 'Hands on', goal: 'Touch the idea: try, build, observe or calculate something.' },
  { theme: 'Stories & arguments', goal: 'Meet the people, history, debates and misconceptions.' },
  { theme: 'Your own tunnel', goal: 'Chase the question that grabbed you and connect it to other fields.' },
  { theme: 'Teach it back', goal: 'Prove to yourself you understand it by explaining it simply.' },
];

export const KIND_META: Record<TaskKind, { label: string; verb: string }> = {
  read: { label: 'Read', verb: 'Read' },
  watch: { label: 'Watch', verb: 'Watch' },
  listen: { label: 'Listen', verb: 'Listen' },
  do: { label: 'Do', verb: 'Try' },
  build: { label: 'Build', verb: 'Make' },
  reflect: { label: 'Reflect', verb: 'Reflect' },
  explain: { label: 'Explain', verb: 'Explain' },
  quiz: { label: 'Quiz', verb: 'Test' },
  explore: { label: 'Explore', verb: 'Wander' },
  revisit: { label: 'Revisit', verb: 'Revisit' },
};

export const TASK_KINDS = Object.keys(KIND_META) as TaskKind[];

// --------------------------------------------------------------------
// Fitting tasks into a budget

interface Seed {
  kind: TaskKind;
  title: string;
  description: string;
  why: string;
  checkpoint: string;
  ideal: number;
  min: number;
  priority: number; // higher = more essential
  resource?: ResourceHint;
}

/**
 * Choose and size tasks so the day fits the budget. Essential tasks are
 * kept first at their minimum length, then time is spread back toward the
 * ideal lengths. Leftover time becomes an optional wander task.
 */
export function fitSeeds(seeds: Seed[], budget: number): Task[] {
  const b = Math.max(5, budget);
  const sorted = [...seeds].sort((a, z) => z.priority - a.priority);
  const chosen: { seed: Seed; minutes: number }[] = [];
  let used = 0;
  for (const s of sorted) {
    const m = Math.min(s.min, b);
    if (used + m <= b || chosen.length === 0) {
      chosen.push({ seed: s, minutes: m });
      used += m;
    }
  }
  // Grow toward ideal, round-robin by priority.
  let grew = true;
  while (used < b && grew) {
    grew = false;
    for (const c of chosen) {
      if (used >= b) break;
      if (c.minutes < c.seed.ideal) {
        const step = Math.min(5, c.seed.ideal - c.minutes, b - used);
        c.minutes += step;
        used += step;
        grew = true;
      }
    }
  }
  // Restore the arc order (seeds were authored in a sensible order).
  chosen.sort((a, z) => seeds.indexOf(a.seed) - seeds.indexOf(z.seed));
  const tasks = chosen.map(({ seed, minutes }) => mkTask(seed, minutes));
  const left = b - used;
  if (left >= 10) {
    tasks.push(
      mkTask(
        {
          kind: 'explore',
          title: 'Free wander',
          description:
            'Follow any link, footnote or tangent that caught your eye today. No goal — just notice what pulls you.',
          why: 'Curiosity-led wandering is where unexpected connections come from.',
          checkpoint: 'What was the most surprising thing you stumbled on?',
          ideal: left,
          min: left,
          priority: 0,
        },
        Math.min(left, 30),
        true,
      ),
    );
  }
  return tasks;
}

const mkTask = (s: Seed, minutes: number, optional = false): Task => ({
  id: uid('t_'),
  title: s.title,
  kind: s.kind,
  minutes: Math.round(minutes),
  description: s.description,
  why: s.why,
  checkpoint: s.checkpoint,
  resource: s.resource,
  optional,
  done: false,
});

/** Bring model-written tasks into line with the day's budget. */
export function normalizeTasks(raw: Partial<Task>[], budget: number): Task[] {
  let tasks: Task[] = raw
    .filter((t) => t && t.title)
    .map((t) => ({
      id: uid('t_'),
      title: String(t.title).slice(0, 140),
      kind: (TASK_KINDS.includes(t.kind as TaskKind) ? t.kind : 'read') as TaskKind,
      minutes: clamp(Math.round(Number(t.minutes) || 15), 5, 180),
      description: String(t.description ?? ''),
      why: String(t.why ?? ''),
      checkpoint: String(t.checkpoint ?? ''),
      resource: t.resource?.query ? t.resource : undefined,
      optional: Boolean(t.optional),
      done: false,
    }));
  if (!tasks.length) return tasks;

  const total = () => tasks.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0);
  // Drop optional extras first if hopelessly over, then scale.
  if (total() > budget * 1.1) {
    const factor = budget / total();
    tasks = tasks.map((t) =>
      t.optional ? t : { ...t, minutes: Math.max(5, Math.round((t.minutes * factor) / 5) * 5) },
    );
  }
  // Still over (many 5-min floors)? Mark the tail as optional.
  let running = 0;
  tasks = tasks.map((t) => {
    if (t.optional) return t;
    running += t.minutes;
    return running > budget * 1.15 ? { ...t, optional: true } : t;
  });
  return tasks;
}

// --------------------------------------------------------------------
// Offline plan builder

const pick = <T,>(arr: T[], i: number, fallback: T): T => (arr.length ? arr[i % arr.length] : fallback);

function primaryInput(style: LearningStyle, i: number): TaskKind {
  switch (style) {
    case 'reading':
      return 'read';
    case 'video':
      return 'watch';
    case 'audio':
      return 'listen';
    case 'hands-on':
      return i % 2 ? 'read' : 'watch';
    default:
      return (['read', 'watch', 'read', 'listen'] as TaskKind[])[i % 4];
  }
}

const inputVerb = (k: TaskKind) =>
  k === 'watch' ? 'Watch a good explainer on' : k === 'listen' ? 'Listen to a podcast or talk on' : 'Read about';

const resTypeFor = (k: TaskKind): ResourceHint['type'] =>
  k === 'watch' ? 'video' : k === 'listen' ? 'podcast' : 'article';

export function offlineBrief(topic: string, entry?: CatalogTopic, angle?: string): Brief {
  const concepts = (entry?.concepts ?? [
    `The core definition of ${topic}`,
    `The key mechanism behind ${topic}`,
    `The main debate within ${topic}`,
    `A classic example of ${topic}`,
    `How ${topic} connects to everyday life`,
  ]).map((term) => ({ id: uid('c_'), term, explanation: '', status: 'new' as const }));

  const questions = [
    ...(angle ? [angle] : []),
    ...(entry?.questions ?? [
      `What problem does ${topic} solve or explain?`,
      `What do most people get wrong about ${topic}?`,
    ]),
    `If you had to explain ${topic} to a 12-year-old, what would you say?`,
  ];

  const starters = entry?.starters ?? [`${topic} explained`, `${topic} introduction`];
  return {
    summary: entry
      ? `${entry.hook} This week you will move from a rough map of ${entry.title.toLowerCase()} to being able to explain its core ideas in your own words.`
      : `A one-week deep dive into ${topic}: from a rough map, to the mechanics, to explaining it in your own words.`,
    whyFascinating: entry?.hook ?? `Because ${topic} is probably more connected to everything else than it looks.`,
    concepts,
    guidingQuestions: questions,
    misconceptions: [],
    resources: [
      ...starters.map((q) => ({ title: q, query: q, type: 'article' as const })),
      { title: `${topic} — Wikipedia`, query: `${topic}`, type: 'article' as const },
      { title: `${topic} lecture or documentary`, query: `${topic} lecture documentary`, type: 'video' as const },
    ],
    arc: ARC,
    rabbitTrails: entry?.tags.map((t) => `${topic} × ${t}`) ?? [],
  };
}

export function offlineDaySeeds(
  topic: string,
  brief: Brief,
  dayIndex: number,
  style: LearningStyle,
  depth: Depth,
): Seed[] {
  const c = brief.concepts.map((x) => x.term);
  const q = brief.guidingQuestions;
  const starters = brief.resources.map((r) => r.query);
  const input = primaryInput(style, dayIndex);
  const res = (query: string, k: TaskKind): ResourceHint => ({ title: query, query, type: resTypeFor(k) });
  const deep = depth === 'obsessed' ? 1.3 : depth === 'curious' ? 0.8 : 1;
  const m = (n: number) => Math.round((n * deep) / 5) * 5;

  switch (dayIndex) {
    case 0:
      return [
        {
          kind: 'reflect',
          title: 'Brain dump: what do I already think?',
          description: `Before reading anything, write 5 lines on what you believe about ${topic}, plus 3 questions you hope to answer this week.`,
          why: 'Surfacing your prior beliefs makes it obvious later what actually changed.',
          checkpoint: 'Which of your beliefs are you least sure about?',
          ideal: 10, min: 5, priority: 9,
        },
        {
          kind: input,
          title: `${inputVerb(input)} the big picture`,
          description: `Find one approachable overview of ${topic}. Skim for structure: what are the main parts and who cares about it?`,
          why: 'A rough map first makes every later detail easier to place.',
          checkpoint: `In two sentences: what is ${topic} about?`,
          ideal: m(25), min: 10, priority: 10,
          resource: res(pick(starters, 0, `${topic} explained`), input),
        },
        {
          kind: 'build',
          title: 'Sketch your first map',
          description: `Draw a quick concept map with ${topic} in the middle and everything you met today around it. Mark the bits that feel fuzzy.`,
          why: 'Drawing relationships exposes gaps that reading hides.',
          checkpoint: 'Which connection on your map are you least sure about?',
          ideal: m(15), min: 5, priority: 6,
        },
      ];
    case 1:
      return [
        {
          kind: input,
          title: `Learn: ${pick(c, 0, 'the first key idea')}`,
          description: `Go deep on "${pick(c, 0, topic)}". Look for a definition, an example and a non-example.`,
          why: 'Concepts stick when you can tell what they are and what they are not.',
          checkpoint: `Explain "${pick(c, 0, topic)}" with an example of your own.`,
          ideal: m(25), min: 10, priority: 10,
          resource: res(`${pick(c, 0, topic)} ${topic}`, input),
        },
        {
          kind: 'read',
          title: `Learn: ${pick(c, 1, 'the second key idea')}`,
          description: `Now "${pick(c, 1, topic)}". How does it relate to what you learned just before?`,
          why: 'Linking new ideas to old ones builds a network, not a list.',
          checkpoint: `How does "${pick(c, 1, topic)}" connect to "${pick(c, 0, topic)}"?`,
          ideal: m(20), min: 10, priority: 8,
          resource: res(`${pick(c, 1, topic)} explained`, 'read'),
        },
        {
          kind: 'explain',
          title: 'Explain it to a friend (in writing)',
          description: 'Write a 5-sentence explanation of today’s ideas without looking at your notes. Then check what you missed.',
          why: 'Retrieval — pulling it out of your head — is the strongest way to remember.',
          checkpoint: 'What did you forget or get wrong?',
          ideal: 10, min: 5, priority: 9,
        },
      ];
    case 2:
      return [
        {
          kind: input,
          title: `How does it actually work?`,
          description: `Find a source that explains the mechanism behind ${pick(c, 2, topic)} step by step. Pause after each step and predict the next.`,
          why: 'Predicting before reading turns passive input into active thinking.',
          checkpoint: 'Describe the mechanism as a chain of cause → effect.',
          ideal: m(30), min: 15, priority: 10,
          resource: res(`how does ${pick(c, 2, topic)} work`, input),
        },
        {
          kind: 'build',
          title: 'Draw the mechanism',
          description: 'Make a diagram, flow chart or comic strip of the mechanism. Rough is fine.',
          why: 'If you cannot draw it, you probably do not understand it yet.',
          checkpoint: 'Where is the weakest arrow in your diagram?',
          ideal: m(15), min: 10, priority: 8,
        },
        {
          kind: 'quiz',
          title: 'Self-quiz: days 1–3',
          description: 'Use the flashcards in Practice to test yourself on the concepts so far.',
          why: 'Testing yourself is learning, not just measuring.',
          checkpoint: 'Which concept would you fail on an exam tomorrow?',
          ideal: 10, min: 5, priority: 6,
        },
      ];
    case 3:
      return [
        {
          kind: 'do',
          title: `Get your hands dirty with ${topic}`,
          description: `Find something you can try: an experiment, a simulation, a calculation, a small project or a real-world observation related to ${pick(c, 3, topic)}.`,
          why: 'Doing reveals what reading hides — and makes it memorable.',
          checkpoint: 'What happened that you did not expect?',
          ideal: m(40), min: 15, priority: 10,
          resource: res(`${topic} interactive simulation experiment`, 'do'),
        },
        {
          kind: 'reflect',
          title: 'Lab notes',
          description: 'Write what you tried, what happened and why you think it happened.',
          why: 'Explaining results forces you to use the theory.',
          checkpoint: 'Which concept explains your result?',
          ideal: 10, min: 5, priority: 8,
        },
      ];
    case 4:
      return [
        {
          kind: input,
          title: 'The people & the story',
          description: `Who figured out ${topic}? What did they get wrong first? Find the human story behind it.`,
          why: 'Knowing how an idea was discovered shows why it is shaped the way it is.',
          checkpoint: 'What problem were they originally trying to solve?',
          ideal: m(25), min: 10, priority: 9,
          resource: res(`history of ${topic}`, input),
        },
        {
          kind: 'read',
          title: 'Find the argument',
          description: `Look for a live debate, controversy or common misconception about ${topic}. Write both sides in one line each.`,
          why: 'Understanding the strongest disagreement tests your grasp of the details.',
          checkpoint: 'Which side do you find more convincing, and why?',
          ideal: m(20), min: 10, priority: 8,
          resource: res(`${topic} debate controversy misconception`, 'read'),
        },
      ];
    case 5:
      return [
        {
          kind: 'explore',
          title: `Chase your question`,
          description: `Pick the question that has been nagging you (maybe: "${pick(q, 0, `what else is ${topic} connected to?`)}") and hunt for an answer.`,
          why: 'Following your own curiosity is the point — this is where the rabbit hole gets personal.',
          checkpoint: 'What is your best current answer?',
          ideal: m(35), min: 15, priority: 10,
        },
        {
          kind: 'reflect',
          title: 'Connect it to another field',
          description: `Where else does an idea from ${topic} show up — in your work, hobbies, or another subject?`,
          why: 'Transfer to new contexts is the real test of understanding.',
          checkpoint: 'Name one surprising connection.',
          ideal: 10, min: 5, priority: 7,
        },
      ];
    default:
      return [
        {
          kind: 'explain',
          title: 'The Feynman test',
          description: `Explain ${topic} from scratch as if to a curious 12-year-old, using the Explain tool in Practice. Then fix the gaps.`,
          why: 'Simple explanations are only possible when you truly understand.',
          checkpoint: 'Where did you have to reach for jargon?',
          ideal: m(25), min: 10, priority: 10,
        },
        {
          kind: 'quiz',
          title: 'Final quiz',
          description: 'Take a final quiz across everything.',
          why: 'A last retrieval round locks it in.',
          checkpoint: 'What score did you get, and which question surprised you?',
          ideal: 10, min: 5, priority: 8,
        },
        {
          kind: 'reflect',
          title: 'Close the loop',
          description: 'Re-read your day-1 brain dump. What changed? Write your wrap-up and decide whether to go deeper.',
          why: 'Seeing your own progress is what makes the next rabbit hole tempting.',
          checkpoint: 'What is one thing you now see differently?',
          ideal: 15, min: 5, priority: 9,
        },
      ];
  }
}

export function buildDays(startDate: string, budgets: number[], arc = ARC): Day[] {
  return Array.from({ length: 7 }, (_, i) => ({
    index: i,
    date: addDays(startDate, i),
    theme: arc[i]?.theme ?? ARC[i].theme,
    goal: arc[i]?.goal ?? ARC[i].goal,
    budget: budgets[i] ?? 30,
    tasks: [],
  }));
}

export function offlinePlan(
  topic: string,
  brief: Brief,
  startDate: string,
  budgets: number[],
  style: LearningStyle,
  depth: Depth,
): Day[] {
  return buildDays(startDate, budgets, brief.arc).map((d) => ({
    ...d,
    tasks: d.budget > 0 ? fitSeeds(offlineDaySeeds(topic, brief, d.index, style, depth), d.budget) : [],
  }));
}

// --------------------------------------------------------------------
// Progress helpers

export const todayIndex = (hole: Hole, today = isoDate()) => daysBetween(hole.startDate, today);

export const dayProgress = (d: Day) => {
  const core = d.tasks.filter((t) => !t.optional);
  const list = core.length ? core : d.tasks;
  const done = list.filter((t) => t.done).length;
  return { done, total: list.length, ratio: list.length ? done / list.length : 0 };
};

export const holeProgress = (h: Hole) => {
  const all = h.days.flatMap((d) => d.tasks.filter((t) => !t.optional));
  const done = all.filter((t) => t.done).length;
  const minutes = h.days
    .flatMap((d) => d.tasks)
    .filter((t) => t.done)
    .reduce((s, t) => s + (t.spentMinutes ?? t.minutes), 0);
  return { done, total: all.length, ratio: all.length ? done / all.length : 0, minutes };
};

// --------------------------------------------------------------------
// Rebalancing: move unfinished work from past days into the days ahead.

export function rebalance(hole: Hole, today = isoDate()): { hole: Hole; moved: number; trimmed: number } {
  const ti = clamp(todayIndex(hole, today), 0, 6);
  const days = hole.days.map((d) => ({ ...d, tasks: [...d.tasks] }));
  const carry: Task[] = [];
  for (let i = 0; i < ti; i++) {
    const keep: Task[] = [];
    for (const t of days[i].tasks) {
      if (!t.done && !t.skipped && !t.optional) carry.push({ ...t });
      else keep.push(t);
    }
    days[i].tasks = keep;
  }
  let moved = 0;
  let trimmed = 0;
  const load = (d: Day) => d.tasks.filter((t) => !t.done && !t.optional).reduce((s, t) => s + t.minutes, 0);
  for (const t of carry) {
    // Put each task on the future day with the most spare room.
    let best = -1;
    let bestRoom = -Infinity;
    for (let i = ti; i < 7; i++) {
      const room = days[i].budget - load(days[i]);
      if (room > bestRoom) {
        bestRoom = room;
        best = i;
      }
    }
    if (best === -1) break;
    if (bestRoom >= Math.min(t.minutes, 10)) {
      const minutes = Math.min(t.minutes, Math.max(5, bestRoom));
      days[best].tasks.push({ ...t, minutes, title: t.title });
      moved++;
    } else {
      // No room left: keep it as optional so nothing is lost, but the day stays achievable.
      days[best].tasks.push({ ...t, optional: true });
      trimmed++;
    }
  }
  return { hole: { ...hole, days }, moved, trimmed };
}

/** Change remaining days' budgets and re-fit their unfinished tasks. */
export function rebudget(hole: Hole, budgets: number[], fromIndex: number): Hole {
  const days = hole.days.map((d, i) => {
    if (i < fromIndex) return d;
    const budget = budgets[i] ?? d.budget;
    const done = d.tasks.filter((t) => t.done);
    const open = d.tasks.filter((t) => !t.done);
    const fitted = normalizeTasks(open, Math.max(5, budget - done.reduce((s, t) => s + t.minutes, 0)));
    // Keep original ids so notes etc. stay attached.
    return {
      ...d,
      budget,
      tasks: [...done, ...fitted.map((t, k) => ({ ...open[k], minutes: t.minutes, optional: t.optional }))],
    };
  });
  return { ...hole, days };
}

export function revisitTask(t: Task): Task {
  return {
    id: uid('t_'),
    title: `Revisit: ${t.title.replace(/^Revisit: /, '')}`,
    kind: 'revisit',
    minutes: 10,
    description:
      'You marked this as fuzzy. Come back with fresh eyes: re-skim your notes or the source, then try the checkpoint again from memory.',
    why: 'Spacing a second attempt a day later is one of the most reliable ways to make something stick.',
    checkpoint: t.checkpoint,
    resource: t.resource,
    done: false,
  };
}

export const defaultBudgets = (perDay: number, weekendBoost = 0) => {
  const start = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return Math.max(0, perDay + (weekend ? weekendBoost : 0));
  });
};
