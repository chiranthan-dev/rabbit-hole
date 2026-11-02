// Orchestrates turning a topic into a full week: research → arc → daily
// tasks. Uses the AI when it is configured and quietly falls back to the
// offline planner for any step that fails, so you always get a usable week.

import { aiEnabled, providerLabel } from './ai/providers';
import { planDay, researchBrief } from './ai/generate';
import { buildDays, fitSeeds, offlineBrief, offlineDaySeeds } from './planner';
import type { AISettings, CatalogTopic, Depth, Domain, Hole, LearningStyle } from './types';
import { slug, uid } from './util';

export interface CreateArgs {
  topic: string;
  entry?: CatalogTopic;
  angle?: string;
  depth: Depth;
  style: LearningStyle;
  budgets: number[];
  startDate: string;
  interests: string[];
}

export type Step = { label: string; state: 'working' | 'done' | 'error'; detail?: string };

export async function createHole(
  ai: AISettings,
  args: CreateArgs,
  onStep: (steps: Step[]) => void,
  signal?: AbortSignal,
): Promise<{ hole: Hole; warnings: string[] }> {
  const steps: Step[] = [];
  const warnings: string[] = [];
  const push = (s: Step) => {
    steps.push(s);
    onStep([...steps]);
  };
  const finish = (state: Step['state'], detail?: string) => {
    steps[steps.length - 1] = { ...steps[steps.length - 1], state, detail };
    onStep([...steps]);
  };

  const useAI = aiEnabled(ai);
  let title = args.entry?.title ?? args.topic;
  let tagline = args.entry?.hook ?? '';
  let domain: Domain = args.entry?.domain ?? 'science';
  let tags = args.entry?.tags ?? [];
  let brief = offlineBrief(args.topic, args.entry, args.angle);
  let source: Hole['source'] = 'offline';

  if (useAI) {
    push({ label: `Researching “${args.topic}”`, state: 'working', detail: providerLabel(ai) });
    try {
      const r = await researchBrief(
        ai,
        { topic: args.topic, angle: args.angle, depth: args.depth, style: args.style, interests: args.interests },
        signal,
      );
      title = args.entry?.title ?? r.title;
      tagline = r.tagline || tagline;
      domain = args.entry?.domain ?? r.domain;
      tags = args.entry?.tags ?? (r.tags.length ? r.tags : tags);
      // Keep any curated concepts if the model returned too few.
      brief = { ...r, concepts: r.concepts.length >= 3 ? r.concepts : brief.concepts, arc: r.arc };
      source = 'ai';
      finish('done', `${r.concepts.length} key ideas · ${r.resources.length} sources`);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      finish('error', (e as Error).message);
      warnings.push(`Research step failed (${(e as Error).message}) — used the built-in planner instead.`);
    }
  } else {
    push({ label: 'Mapping the week from the offline library', state: 'done' });
  }

  push({ label: 'Shaping a 7-day learning arc', state: 'done', detail: brief.arc.map((a) => a.theme).join(' → ') });

  const days = buildDays(args.startDate, args.budgets, brief.arc);
  const earlier: string[] = [];
  for (const d of days) {
    if (d.budget <= 0) {
      push({ label: `Day ${d.index + 1}: rest day`, state: 'done' });
      continue;
    }
    push({ label: `Day ${d.index + 1}: ${d.theme}`, state: 'working', detail: `${d.budget} min` });
    let ok = false;
    if (useAI && source === 'ai') {
      try {
        d.tasks = await planDay(
          ai,
          { topic: title, brief, dayIndex: d.index, budget: d.budget, depth: args.depth, style: args.style, earlier },
          signal,
        );
        ok = d.tasks.length > 0;
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        warnings.push(`Day ${d.index + 1}: AI planning failed, used a template.`);
      }
    }
    if (!ok) d.tasks = fitSeeds(offlineDaySeeds(title, brief, d.index, args.style, args.depth), d.budget);
    earlier.push(...d.tasks.map((t) => t.title));
    finish('done', `${d.tasks.length} tasks · ${d.tasks.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0)} min`);
  }

  const hole: Hole = {
    id: uid('h_') + '-' + slug(title).slice(0, 20),
    topic: args.topic,
    title,
    tagline,
    domain,
    tags,
    catalogId: args.entry?.id,
    createdAt: new Date().toISOString(),
    startDate: args.startDate,
    status: 'active',
    depth: args.depth,
    style: args.style,
    angle: args.angle,
    brief,
    days,
    questions: [],
    quizzes: [],
    explanations: [],
    source,
    model: source === 'ai' ? providerLabel(ai) : undefined,
  };
  return { hole, warnings };
}
