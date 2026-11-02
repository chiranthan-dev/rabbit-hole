// "Bring your own Claude": instead of calling a model, Rabbit Hole writes a
// prompt you paste into Claude (which can search the web), and Claude hands
// back a JSON file you paste or upload here. The app then validates it,
// fits it to your time budget and turns it into a week.

import { extractJSON } from './ai/providers';
import { DOMAINS } from './catalog';
import { ARC, buildDays, normalizeTasks, TASK_KINDS } from './planner';
import type { CatalogTopic, Depth, Domain, Hole, LearningStyle, QuizQuestion, ResourceHint, Task, TaskKind } from './types';
import { addDays, slug, uid, weekdayShort } from './util';

const DOMAIN_IDS = DOMAINS.map((d) => d.id);
const KINDS: TaskKind[] = TASK_KINDS.filter((k) => k !== 'revisit');

export const CLAUDE_URL = 'https://claude.ai/new';

/** Copy text and open Claude in a new tab, pre-filling the prompt when it is short enough for a URL. */
export async function handOffToClaude(prompt: string) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch {
    /* clipboard blocked — the UI also shows the prompt to copy by hand */
  }
  const url = prompt.length < 6000 ? `${CLAUDE_URL}?q=${encodeURIComponent(prompt)}` : CLAUDE_URL;
  window.open(url, '_blank', 'noopener');
  return copied;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ week plan

export interface WeekArgs {
  topic: string;
  entry?: CatalogTopic;
  angle?: string;
  depth: Depth;
  style: LearningStyle;
  budgets: number[];
  startDate: string;
  interests: string[];
}

const depthText: Record<Depth, string> = {
  curious: 'Curious — approachable and light, intuition over rigour.',
  committed: 'Committed — solid understanding with some rigour.',
  obsessed: 'Obsessed — go deep, include primary sources and harder material.',
};

export function weekPrompt(a: WeekArgs): string {
  const days = a.budgets
    .map((m, i) => `  Day ${i + 1} (${weekdayShort(addDays(a.startDate, i))}): ${m === 0 ? 'REST DAY — no tasks' : `${m} minutes`}`)
    .join('\n');
  const file = `rabbit-hole-${slug(a.topic) || 'week'}.json`;
  return `You are designing a one-week "rabbit hole" for me: a deep dive into one topic where the goal is real UNDERSTANDING, not ticking boxes. Please research the topic on the web first, then build the week.

TOPIC: ${a.topic}
${a.entry?.hook ? `HOOK: ${a.entry.hook}\n` : ''}${a.angle ? `MY ANGLE / QUESTION: ${a.angle}\n` : ''}DEPTH: ${depthText[a.depth]}
LEARNING STYLE: ${a.style}
THINGS I'M INTO (use for analogies only): ${a.interests.join(', ') || '—'}

TIME I HAVE EACH DAY (hard limit — the non-optional tasks of a day must add up to this or less):
${days}

THE WEEK FOLLOWS THIS ARC (make each theme specific to the topic):
${ARC.map((d, i) => `  Day ${i + 1}: ${d.theme} — ${d.goal}`).join('\n')}

RULES
- Research first. Prefer excellent, free, beginner-friendly sources (articles, videos, interactive explainers, papers, podcasts). Only give URLs you actually found and checked; never invent links.
- 2–4 tasks per day (1–2 if under 20 minutes). Mix input (read/watch/listen) with active work (explain, draw, try, quiz, reflect). Every day needs at least one active task.
- Each task needs: what to do, why it builds understanding, and a "checkpoint" question I should be able to answer afterwards.
- You may add ONE optional bonus task per day beyond the time limit (set "optional": true).
- Write warmly and concisely, like a smart friend.
- Also write 10 quiz questions that test understanding (application, explanation, misconceptions — not trivia): about 6 multiple-choice and 4 open.

OUTPUT
Reply with a single JSON object (no extra commentary), as a downloadable file named ${file} if you can, otherwise in one \`\`\`json code block. Use exactly this shape:

{
  "rabbitHole": "week-plan",
  "title": "short evocative title, max 6 words",
  "tagline": "one hooky sentence",
  "domain": "one of: ${DOMAIN_IDS.join(', ')}",
  "tags": ["3-5 lowercase themes, e.g. systems, perception"],
  "summary": "3-4 sentences",
  "whyFascinating": "1-2 sentences",
  "concepts": [{ "term": "key idea", "explanation": "1-2 plain sentences" }],
  "guidingQuestions": ["3-5 questions that drive the week"],
  "misconceptions": ["2-4 common misunderstandings"],
  "resources": [{ "title": "exact title", "url": "https://… (real)", "type": "article|video|book|paper|podcast|tool|course|other", "why": "what it's good for" }],
  "days": [
    {
      "day": 1,
      "theme": "topic-specific theme",
      "goal": "one sentence",
      "tasks": [
        {
          "title": "short, specific",
          "kind": "one of: ${KINDS.join(', ')}",
          "minutes": 20,
          "description": "exactly what to do, 1-3 sentences",
          "why": "how it builds understanding",
          "checkpoint": "a question I should be able to answer afterwards",
          "resource": { "title": "source title", "url": "https://… or empty string" },
          "optional": false
        }
      ]
    }
  ],
  "quiz": [{ "prompt": "question", "kind": "mcq", "options": ["a", "b", "c", "d"], "answerIndex": 1, "modelAnswer": "short ideal answer with reasoning", "concept": "which key idea" }],
  "rabbitTrails": ["3-5 tangents worth exploring after this week"]
}

Include all 7 days in "days" (rest days with an empty "tasks" array). For open quiz questions use "kind": "open", "options": [] and "answerIndex": -1.`;
}

interface RawWeek {
  rabbitHole?: string;
  title?: string;
  tagline?: string;
  domain?: string;
  tags?: string[];
  summary?: string;
  whyFascinating?: string;
  concepts?: { term?: string; explanation?: string }[];
  guidingQuestions?: string[];
  misconceptions?: string[];
  resources?: { title?: string; url?: string; type?: string; why?: string }[];
  days?: {
    day?: number;
    theme?: string;
    goal?: string;
    tasks?: {
      title?: string;
      kind?: string;
      minutes?: number;
      description?: string;
      why?: string;
      checkpoint?: string;
      resource?: { title?: string; url?: string } | string;
      optional?: boolean;
    }[];
  }[];
  quiz?: { prompt?: string; kind?: string; options?: string[]; answerIndex?: number; modelAnswer?: string; concept?: string }[];
  rabbitTrails?: string[];
}

const safeUrl = (u?: string) => {
  if (!u) return undefined;
  try {
    const url = new URL(u.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, n = 12) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, n) : []);

/** Turn Claude's reply into a Hole. Throws a friendly error if it can't. */
export function parseWeek(text: string, a: WeekArgs): { hole: Hole; warnings: string[] } {
  if (!text.trim()) throw new Error('Paste Claude’s reply (or upload the file it gave you) first.');
  let raw: RawWeek;
  try {
    raw = extractJSON(text) as RawWeek;
  } catch {
    throw new Error('Couldn’t find valid JSON in that. Ask Claude: “Please send the complete JSON only, in one code block.”');
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days) || raw.days.length === 0)
    throw new Error('That JSON has no "days" in it. Make sure you copied Claude’s whole answer.');

  const warnings: string[] = [];
  const concepts = (raw.concepts ?? [])
    .filter((c) => c && str(c.term))
    .slice(0, 12)
    .map((c) => ({ id: uid('c_'), term: str(c.term, 120), explanation: str(c.explanation), status: 'new' as const }));

  const resources: ResourceHint[] = (raw.resources ?? [])
    .filter((r) => r && str(r.title))
    .slice(0, 14)
    .map((r) => ({
      title: str(r.title, 200),
      query: str(r.title, 200),
      url: safeUrl(r.url),
      type: (['article', 'video', 'book', 'paper', 'podcast', 'tool', 'course', 'other'].includes(String(r.type)) ? r.type : 'other') as ResourceHint['type'],
    }));

  const arc = Array.from({ length: 7 }, (_, i) => {
    const d = raw.days!.find((x) => Number(x?.day) === i + 1) ?? raw.days![i];
    return { theme: str(d?.theme, 80) || ARC[i].theme, goal: str(d?.goal, 200) || ARC[i].goal };
  });

  const days = buildDays(a.startDate, a.budgets, arc).map((day) => {
    const src = raw.days!.find((x) => Number(x?.day) === day.index + 1) ?? raw.days![day.index];
    if (day.budget <= 0) return day;
    const rawTasks: Partial<Task>[] = (src?.tasks ?? []).map((t) => {
      const res = typeof t?.resource === 'string' ? { title: t.resource, url: t.resource } : t?.resource;
      const url = safeUrl(res?.url);
      const title = str(res?.title, 200) || (url ? new URL(url).hostname : '');
      return {
        title: str(t?.title, 140),
        kind: (KINDS.includes(t?.kind as Task['kind']) ? t?.kind : 'read') as Task['kind'],
        minutes: Number(t?.minutes) || 15,
        description: str(t?.description),
        why: str(t?.why),
        checkpoint: str(t?.checkpoint),
        optional: Boolean(t?.optional),
        resource: title ? { title, query: title, url } : undefined,
      };
    });
    const tasks = normalizeTasks(rawTasks, day.budget);
    if (!tasks.length) warnings.push(`Day ${day.index + 1} had no tasks — add some yourself or ask Claude again.`);
    const before = rawTasks.filter((t) => !t.optional).reduce((s, t) => s + (t.minutes ?? 0), 0);
    if (before > day.budget * 1.15) warnings.push(`Day ${day.index + 1} was longer than your ${day.budget} min, so it was trimmed to fit.`);
    return { ...day, tasks };
  });

  const quizBank: QuizQuestion[] = (raw.quiz ?? [])
    .filter((q) => q && str(q.prompt))
    .slice(0, 20)
    .map((q) => {
      const options = strs(q.options, 6);
      const mcq = q.kind === 'mcq' && options.length >= 2 && Number(q.answerIndex) >= 0 && Number(q.answerIndex) < options.length;
      return {
        id: uid('q_'),
        prompt: str(q.prompt, 400),
        kind: mcq ? 'mcq' : 'open',
        options: mcq ? options : undefined,
        answerIndex: mcq ? Number(q.answerIndex) : -1,
        modelAnswer: str(q.modelAnswer, 800),
        concept: str(q.concept, 120) || undefined,
      };
    });

  const title = a.entry?.title ?? (str(raw.title, 80) || a.topic);
  const domain = (a.entry?.domain ?? (DOMAIN_IDS.includes(raw.domain as Domain) ? raw.domain : 'science')) as Domain;
  const tags = a.entry?.tags ?? strs(raw.tags, 6).map((t) => t.toLowerCase());

  const hole: Hole = {
    id: uid('h_') + '-' + slug(title).slice(0, 20),
    topic: a.topic,
    title,
    tagline: str(raw.tagline, 200) || a.entry?.hook || '',
    domain,
    tags,
    catalogId: a.entry?.id,
    createdAt: new Date().toISOString(),
    startDate: a.startDate,
    status: 'active',
    depth: a.depth,
    style: a.style,
    angle: a.angle,
    brief: {
      summary: str(raw.summary, 1200),
      whyFascinating: str(raw.whyFascinating, 400),
      concepts,
      guidingQuestions: strs(raw.guidingQuestions, 8),
      misconceptions: strs(raw.misconceptions, 8),
      resources,
      arc,
      rabbitTrails: strs(raw.rabbitTrails, 8),
    },
    days,
    questions: [],
    quizzes: [],
    explanations: [],
    quizBank,
    source: 'ai',
    model: 'Claude (pasted)',
  };
  if (!concepts.length) warnings.push('No key ideas came through — the Brief tab will be thin.');
  return { hole, warnings };
}

// ------------------------------------------------------------------ topic ideas

export function ideasPrompt(summary: { topDomains: string[]; lowDomains: string[]; topTags: string[]; disliked: string[]; done: string[] }, adventurousness: number) {
  return `Suggest 8 one-week "rabbit hole" topics for me — things to deep-dive into for a week to genuinely understand them.

What I enjoy: domains ${summary.topDomains.join(', ') || 'not sure yet'}; themes ${summary.topTags.join(', ') || 'not sure yet'}.
Already explored: ${summary.done.join('; ') || 'nothing yet'}.
I tend to avoid: ${summary.disliked.join(', ') || 'nothing in particular'}.
Domains I've barely touched: ${summary.lowDomains.join(', ') || 'most of them'}.
Adventurousness: ${Math.round(adventurousness * 100)}% (100% = surprise me completely).

Rules: be specific and intriguing (not "Physics" but "Why glass is transparent"); deep enough for a week but approachable. At least half should be things I'd never think to search for — unexpected bridges between what I like and fields I haven't explored. Feel free to use web search for fresh, surprising angles.

Reply with ONLY one JSON code block in this shape:
{
  "rabbitHole": "topic-ideas",
  "topics": [
    { "title": "max 7 words", "hook": "one tantalising sentence", "domain": "one of: ${DOMAIN_IDS.join(', ')}", "tags": ["3-4 lowercase themes"], "concepts": ["4-5 key ideas"], "questions": ["2 questions"], "why": "why this fits ME" }
  ]
}`;
}

export function parseIdeas(text: string): (CatalogTopic & { why: string })[] {
  let raw: { topics?: { title?: string; hook?: string; domain?: string; tags?: string[]; concepts?: string[]; questions?: string[]; why?: string }[] };
  try {
    raw = extractJSON(text) as typeof raw;
  } catch {
    throw new Error('Couldn’t find valid JSON in that. Ask Claude to “send the JSON only”.');
  }
  const topics = (raw?.topics ?? []).filter((t) => t && str(t.title));
  if (!topics.length) throw new Error('No topics found in that reply.');
  return topics.slice(0, 12).map((t) => ({
    id: `ai-${uid()}`,
    title: str(t.title, 90),
    hook: str(t.hook, 240),
    domain: (DOMAIN_IDS.includes(t.domain as Domain) ? t.domain : 'science') as Domain,
    tags: strs(t.tags, 5).map((x) => x.toLowerCase()),
    concepts: strs(t.concepts, 6),
    questions: strs(t.questions, 3),
    starters: [`${str(t.title, 90)} explained`],
    why: str(t.why, 240) || 'Suggested by Claude from your interest profile.',
  }));
}

// ------------------------------------------------------------------ copy-only helpers

const context = (h: Hole) =>
  `I'm on a one-week deep dive into "${h.title}". ${h.brief.summary}\nKey ideas: ${h.brief.concepts.map((c) => c.term).join(', ')}.`;

export const questionPrompt = (h: Hole, q: string) =>
  `${context(h)}\n\nMy question: ${q}\n\nGive me a clear, honest answer in plain language (flag where experts disagree or where evidence is thin), then 2–3 good sources to dig deeper, with real links.`;

export const explainPrompt = (h: Hole, concept: string, text: string) =>
  `${context(h)}\n\nUsing the Feynman technique, here is my explanation of "${concept}", written as if for a curious 12-year-old:\n"""\n${text}\n"""\n\nAct as a kind but honest tutor:\n1. Rate clarity 1–5.\n2. What I got right (1–3 points).\n3. Specific errors, vague spots or jargon I hid behind (1–3 points).\n4. One probing follow-up question that would reveal whether I really understand.`;

export const recapPrompt = (h: Hole) => {
  const notes = h.days
    .flatMap((d) => [
      ...d.tasks.filter((t) => t.note).map((t) => `- ${t.title}: ${t.note}`),
      ...(d.reflection ? [`- Day ${d.index + 1} reflection: ${d.reflection}`] : []),
    ])
    .join('\n');
  return `${context(h)}\n\nHere are my notes from the week:\n${notes || '(none)'}\n\nHow well I know each key idea: ${h.brief.concepts.map((c) => `${c.term} (${c.status})`).join(', ')}\nQuestions I parked: ${h.questions.map((q) => q.text).join(' | ') || 'none'}\n${h.final ? `My wrap-up: ${h.final.summary}\nBiggest surprise: ${h.final.surprise}\nStill fuzzy: ${h.final.stillConfused}\n` : ''}\nWrite a warm, specific recap of my week in second person ("You…"), 120–200 words: celebrate real progress, name what is still fuzzy, and end with 3 next rabbit holes that branch off in unexpected directions. Plain text, no headings.`;
};
