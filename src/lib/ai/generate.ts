// All the things the AI writes for Rabbit Hole: research briefs, daily
// plans, quizzes, explanation feedback, answers to parked questions,
// recaps and topic suggestions. Each call has a strict JSON schema so
// even small local models produce something the app can use.

import { DOMAINS } from '../catalog';
import { ARC, KIND_META, TASK_KINDS, normalizeTasks } from '../planner';
import type {
  AISettings,
  Brief,
  CatalogTopic,
  Depth,
  Domain,
  Explanation,
  Hole,
  LearningStyle,
  QuizQuestion,
  Task,
} from '../types';
import { uid } from '../util';
import { chatJSON } from './providers';

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: 'string' };
const num = { type: 'number' };
const strArr = { type: 'array', items: str };
const DOMAIN_IDS = DOMAINS.map((d) => d.id);

const SYSTEM = `You are Rabbit Hole — a learning designer who turns a curious person's chosen topic into a one-week deep dive.
Principles:
- The goal is understanding, not ticking boxes. Every task must earn its place.
- Tasks must be realistic for the stated minutes. Never overload a day.
- Mix input (read/watch/listen) with active work (explain, draw, try, quiz, reflect).
- Prefer concrete, well-known, freely available sources. Describe what to search for; NEVER invent URLs.
- Write warmly and concisely, like a smart friend, not a textbook.`;

const depthText: Record<Depth, string> = {
  curious: 'Curious: approachable and light, intuition over rigour.',
  committed: 'Committed: solid understanding with some rigour.',
  obsessed: 'Obsessed: go deep, include primary sources and harder material.',
};

// ------------------------------------------------------------------ brief

const briefSchema = obj({
  title: str,
  tagline: str,
  domain: { type: 'string', enum: DOMAIN_IDS },
  tags: strArr,
  summary: str,
  whyFascinating: str,
  concepts: { type: 'array', items: obj({ term: str, explanation: str }) },
  guidingQuestions: strArr,
  misconceptions: strArr,
  resources: {
    type: 'array',
    items: obj({
      title: str,
      query: str,
      type: { type: 'string', enum: ['article', 'video', 'book', 'paper', 'podcast', 'tool', 'course', 'other'] },
    }),
  },
  arc: { type: 'array', items: obj({ theme: str, goal: str }) },
  rabbitTrails: strArr,
});

export interface BriefResult extends Brief {
  title: string;
  tagline: string;
  domain: Domain;
  tags: string[];
}

export async function researchBrief(
  s: AISettings,
  args: { topic: string; angle?: string; depth: Depth; style: LearningStyle; interests: string[] },
  signal?: AbortSignal,
): Promise<BriefResult> {
  const user = `Topic: ${args.topic}
${args.angle ? `My personal angle / question: ${args.angle}\n` : ''}Depth: ${depthText[args.depth]}
Preferred learning style: ${args.style}
Other things I'm into (use for analogies, don't change the topic): ${args.interests.join(', ') || 'unknown'}

Research this topic and write a brief for my week:
- title: a short evocative title (max 6 words); tagline: one hooky sentence.
- domain: the best-fitting domain; tags: 3-5 lowercase single-word or hyphenated themes (e.g. "systems", "perception").
- summary (3-4 sentences) and whyFascinating (1-2 sentences).
- concepts: the 6-8 key ideas to understand, each with a plain-language explanation (1-2 sentences).
- guidingQuestions: 3-5 questions that will drive the week.
- misconceptions: 2-4 common misunderstandings.
- resources: 5-8 well-known resources; give the exact title and a search query to find it. No URLs.
- arc: exactly 7 days. Follow this learning arc, but make each theme specific to the topic:
${ARC.map((a, i) => `  Day ${i + 1}: ${a.theme} — ${a.goal}`).join('\n')}
- rabbitTrails: 3-5 tangents worth exploring after this week.`;

  const r = await chatJSON<BriefResult>(
    s,
    { system: SYSTEM, user, schema: briefSchema, maxTokens: 4096, research: true, signal },
    1,
  );
  const arc = Array.from({ length: 7 }, (_, i) => ({
    theme: r.arc?.[i]?.theme || ARC[i].theme,
    goal: r.arc?.[i]?.goal || ARC[i].goal,
  }));
  return {
    title: r.title || args.topic,
    tagline: r.tagline || '',
    domain: (DOMAIN_IDS.includes(r.domain) ? r.domain : 'science') as Domain,
    tags: (r.tags ?? []).map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 6),
    summary: r.summary ?? '',
    whyFascinating: r.whyFascinating ?? '',
    concepts: (r.concepts ?? []).slice(0, 10).map((c) => ({
      id: uid('c_'),
      term: (c as unknown as { term: string }).term,
      explanation: (c as unknown as { explanation: string }).explanation ?? '',
      status: 'new' as const,
    })),
    guidingQuestions: r.guidingQuestions ?? [],
    misconceptions: r.misconceptions ?? [],
    resources: (r.resources ?? []).filter((x) => x?.title).slice(0, 10),
    arc,
    rabbitTrails: r.rabbitTrails ?? [],
  };
}

// ------------------------------------------------------------------ day plan

const daySchema = obj({
  tasks: {
    type: 'array',
    items: obj({
      title: str,
      kind: { type: 'string', enum: TASK_KINDS.filter((k) => k !== 'revisit') },
      minutes: num,
      description: str,
      why: str,
      checkpoint: str,
      resourceTitle: str,
      resourceQuery: str,
      optional: { type: 'boolean' },
    }),
  },
});

interface RawTask {
  title: string;
  kind: string;
  minutes: number;
  description: string;
  why: string;
  checkpoint: string;
  resourceTitle: string;
  resourceQuery: string;
  optional: boolean;
}

export async function planDay(
  s: AISettings,
  args: {
    topic: string;
    brief: Brief;
    dayIndex: number;
    budget: number;
    depth: Depth;
    style: LearningStyle;
    earlier: string[];
  },
  signal?: AbortSignal,
): Promise<Task[]> {
  if (args.budget <= 0) return [];
  const day = args.brief.arc[args.dayIndex];
  const user = `Topic: ${args.topic}
Week summary: ${args.brief.summary}
Key concepts: ${args.brief.concepts.map((c) => c.term).join('; ')}
Guiding questions: ${args.brief.guidingQuestions.join(' | ')}
Known resources: ${args.brief.resources.map((r) => r.title).join('; ')}
Depth: ${depthText[args.depth]}  Learning style: ${args.style}

Plan DAY ${args.dayIndex + 1} of 7 — "${day.theme}": ${day.goal}
Time available today: ${args.budget} minutes. The non-optional tasks MUST add up to ${args.budget} minutes or less.
${args.earlier.length ? `Already planned on earlier days (don't repeat): ${args.earlier.join('; ')}` : ''}

Write 2-4 tasks (1-2 if under 20 minutes). For each:
- title: short and specific; kind: one of ${TASK_KINDS.filter((k) => k !== 'revisit')
    .map((k) => `${k} (${KIND_META[k].label})`)
    .join(', ')}
- minutes: realistic whole number
- description: exactly what to do, 1-3 sentences
- why: how it builds understanding, 1 sentence
- checkpoint: a question I should be able to answer afterwards
- resourceTitle/resourceQuery: a specific source and what to search to find it ("" if none needed)
- optional: true only for a bonus task beyond the time budget
Include at least one active task (explain, do, build, reflect or quiz).`;

  const r = await chatJSON<{ tasks: RawTask[] }>(s, { system: SYSTEM, user, schema: daySchema, maxTokens: 2048, signal }, 1);
  const raw: Partial<Task>[] = (r.tasks ?? []).map((t) => ({
    title: t.title,
    kind: t.kind as Task['kind'],
    minutes: t.minutes,
    description: t.description,
    why: t.why,
    checkpoint: t.checkpoint,
    optional: t.optional,
    resource: t.resourceQuery ? { title: t.resourceTitle || t.resourceQuery, query: t.resourceQuery } : undefined,
  }));
  return normalizeTasks(raw, args.budget);
}

// ------------------------------------------------------------------ quiz

const quizSchema = obj({
  questions: {
    type: 'array',
    items: obj({
      prompt: str,
      kind: { type: 'string', enum: ['mcq', 'open'] },
      options: strArr,
      answerIndex: num,
      modelAnswer: str,
      concept: str,
    }),
  },
});

export async function makeQuiz(s: AISettings, hole: Hole, upToDay: number, signal?: AbortSignal): Promise<QuizQuestion[]> {
  const studied = hole.days
    .slice(0, upToDay + 1)
    .flatMap((d) => d.tasks.filter((t) => t.done).map((t) => t.title));
  const user = `Topic: ${hole.title}
Concepts: ${hole.brief.concepts.map((c) => `${c.term}: ${c.explanation}`).join('\n')}
Misconceptions to probe: ${hole.brief.misconceptions.join('; ')}
Work completed so far: ${studied.join('; ') || 'early days'}

Write 6 questions that test UNDERSTANDING (application, explanation, spotting misconceptions), not trivia.
Mix 4 multiple-choice (kind "mcq", 4 options, answerIndex 0-3) and 2 open questions (kind "open", options [] and answerIndex -1).
modelAnswer: a short ideal answer with the reasoning. concept: which concept it tests.`;
  const r = await chatJSON<{ questions: QuizQuestion[] }>(s, { system: SYSTEM, user, schema: quizSchema, maxTokens: 3000, signal });
  return (r.questions ?? [])
    .filter((q) => q?.prompt)
    .map((q) => ({
      ...q,
      id: uid('q_'),
      kind: q.kind === 'mcq' && (q.options?.length ?? 0) >= 2 ? 'mcq' : 'open',
      answerIndex: typeof q.answerIndex === 'number' ? q.answerIndex : -1,
    }));
}

// ------------------------------------------------------------------ explanation feedback

const feedbackSchema = obj({ clarity: num, strengths: strArr, gaps: strArr, followUp: str });

export async function explainFeedback(
  s: AISettings,
  hole: Hole,
  concept: string,
  text: string,
  signal?: AbortSignal,
): Promise<NonNullable<Explanation['feedback']>> {
  const user = `I'm learning about ${hole.title}. Here is my explanation of "${concept}" written as if to a curious 12-year-old:
"""${text}"""
Reference notes: ${hole.brief.concepts.map((c) => `${c.term}: ${c.explanation}`).join(' | ')}

Act as a kind but honest tutor using the Feynman technique.
clarity: 1-5. strengths: 1-3 things I got right. gaps: 1-3 specific errors, vague spots or jargon I hid behind.
followUp: one probing question that would reveal whether I really understand.`;
  const r = await chatJSON<NonNullable<Explanation['feedback']>>(s, { system: SYSTEM, user, schema: feedbackSchema, maxTokens: 1200, signal });
  return { clarity: Math.min(5, Math.max(1, Math.round(r.clarity || 3))), strengths: r.strengths ?? [], gaps: r.gaps ?? [], followUp: r.followUp ?? '' };
}

// ------------------------------------------------------------------ parked questions

const answerSchema = obj({ answer: str, digDeeper: strArr });

export async function answerQuestion(s: AISettings, hole: Hole, question: string, signal?: AbortSignal) {
  const user = `Context: I'm on a one-week deep dive into "${hole.title}" (${hole.brief.summary}).
My question: ${question}
Give a clear, honest answer in 4-8 sentences, flag uncertainty where it exists, then 2-3 search queries ("digDeeper") to explore further.`;
  return chatJSON<{ answer: string; digDeeper: string[] }>(s, { system: SYSTEM, user, schema: answerSchema, maxTokens: 1500, signal });
}

// ------------------------------------------------------------------ recap

const recapSchema = obj({ recap: str, nextHoles: strArr });

export async function weekRecap(s: AISettings, hole: Hole, signal?: AbortSignal) {
  const notes = hole.days
    .flatMap((d) => [
      ...d.tasks.filter((t) => t.note).map((t) => `${t.title}: ${t.note}`),
      ...(d.reflection ? [`Day ${d.index + 1} reflection: ${d.reflection}`] : []),
    ])
    .join('\n');
  const user = `Write a warm, specific recap of my week exploring "${hole.title}" in second person ("You…"), 120-200 words.
Concepts and how well I know them: ${hole.brief.concepts.map((c) => `${c.term} (${c.status})`).join(', ')}
My notes:\n${notes || '(no notes)'}
Parked questions: ${hole.questions.map((q) => q.text).join(' | ') || 'none'}
${hole.final ? `My wrap-up: ${hole.final.summary}. Surprise: ${hole.final.surprise}. Still confused about: ${hole.final.stillConfused}` : ''}
Celebrate real progress, name what is still fuzzy, and suggest 3 next rabbit holes (nextHoles) that branch off in unexpected directions.`;
  return chatJSON<{ recap: string; nextHoles: string[] }>(s, { system: SYSTEM, user, schema: recapSchema, maxTokens: 1500, signal });
}

// ------------------------------------------------------------------ topic suggestions

const suggestSchema = obj({
  topics: {
    type: 'array',
    items: obj({
      title: str,
      hook: str,
      domain: { type: 'string', enum: DOMAIN_IDS },
      tags: strArr,
      concepts: strArr,
      questions: strArr,
      why: str,
    }),
  },
});

export async function suggestTopics(
  s: AISettings,
  summary: { topDomains: string[]; lowDomains: string[]; topTags: string[]; disliked: string[]; done: string[] },
  adventurousness: number,
  signal?: AbortSignal,
): Promise<(CatalogTopic & { why: string })[]> {
  const user = `Suggest 6 one-week rabbit-hole topics for me.
I enjoy: domains ${summary.topDomains.join(', ') || 'unknown'}; themes ${summary.topTags.join(', ') || 'unknown'}.
I've already explored: ${summary.done.join('; ') || 'nothing yet'}.
I tend to avoid: ${summary.disliked.join(', ') || 'nothing in particular'}.
Domains I have barely explored: ${summary.lowDomains.join(', ') || 'most of them'}.
Adventurousness ${Math.round(adventurousness * 100)}% (100% = surprise me completely).

Rules: specific and intriguing (not "Physics" but "Why glass is transparent"); deep enough for a week but approachable.
Make at least 3 of them things I would never think to search for — unexpected bridges between what I like and fields I haven't explored.
For each: title (max 7 words), hook (one tantalising sentence), domain, 3-4 lowercase tags, 4-5 key concepts, 2 questions, why (why it fits ME).`;
  const r = await chatJSON<{ topics: (CatalogTopic & { why: string })[] }>(s, { system: SYSTEM, user, schema: suggestSchema, maxTokens: 3000, signal });
  return (r.topics ?? [])
    .filter((t) => t?.title)
    .map((t) => ({
      ...t,
      id: `ai-${uid()}`,
      domain: (DOMAIN_IDS.includes(t.domain) ? t.domain : 'science') as Domain,
      tags: (t.tags ?? []).map((x) => x.toLowerCase()),
      starters: [`${t.title} explained`],
    }));
}
