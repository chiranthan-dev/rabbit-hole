import type { Hole, QuizQuestion, ResourceHint } from './types';
import { uid, prettyDate, fmtMinutes } from './util';
import { holeProgress } from './planner';

/** Search links built from a query — we never trust model-invented URLs. */
export function resourceLinks(r: ResourceHint) {
  const q = encodeURIComponent(r.query || r.title);
  const links = [
    { label: 'Search', href: `https://www.google.com/search?q=${q}` },
    { label: 'YouTube', href: `https://www.youtube.com/results?search_query=${q}` },
    { label: 'Wikipedia', href: `https://en.wikipedia.org/w/index.php?search=${q}` },
  ];
  if (r.type === 'paper') links.push({ label: 'Scholar', href: `https://scholar.google.com/scholar?q=${q}` });
  if (r.type === 'book') links.push({ label: 'Open Library', href: `https://openlibrary.org/search?q=${q}` });
  if (r.type === 'podcast') links.push({ label: 'Podcasts', href: `https://podcasts.apple.com/search?term=${q}` });
  // Put the most relevant first.
  if (r.type === 'video') links.unshift(links.splice(1, 1)[0]);
  // A real link (from Claude's web research) goes first; searches stay as backup.
  if (r.url) {
    let host = 'link';
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      /* keep generic label */
    }
    links.unshift({ label: `Open · ${host}`, href: r.url });
    return links.slice(0, 3);
  }
  return links;
}

/** Offline practice: self-graded recall cards from the brief. */
export function offlineQuiz(hole: Hole): QuizQuestion[] {
  if (hole.quizBank?.length) {
    // Fresh ids and a fresh order each attempt.
    return [...hole.quizBank]
      .sort(() => Math.random() - 0.5)
      .slice(0, 6)
      .map((q) => ({ ...q, id: uid('q_') }));
  }
  const cards: QuizQuestion[] = hole.brief.concepts.map((c) => ({
    id: uid('q_'),
    prompt: `Explain “${c.term}” in your own words, with an example.`,
    kind: 'open',
    modelAnswer: c.explanation || 'Compare against your notes and sources from this week.',
    concept: c.term,
  }));
  for (const q of hole.brief.guidingQuestions.slice(0, 3)) {
    cards.push({ id: uid('q_'), prompt: q, kind: 'open', modelAnswer: 'Check against what you found this week — can you back your answer with a source?' });
  }
  for (const m of hole.brief.misconceptions.slice(0, 2)) {
    cards.push({ id: uid('q_'), prompt: `True or false — and why: “${m}”`, kind: 'open', modelAnswer: 'This is a common misconception. Explain what is actually true.' });
  }
  return cards.sort(() => Math.random() - 0.5).slice(0, 8);
}

export function holeMarkdown(h: Hole): string {
  const p = holeProgress(h);
  const lines: string[] = [];
  lines.push(`# ${h.title}`, '', `_${h.tagline}_`, '');
  lines.push(`- Started: ${prettyDate(h.startDate)}`, `- Progress: ${p.done}/${p.total} tasks · ${fmtMinutes(p.minutes)}`, `- Depth: ${h.depth}`, '');
  lines.push('## Summary', h.brief.summary, '');
  lines.push('## Key ideas');
  for (const c of h.brief.concepts) lines.push(`- **${c.term}** (${c.status})${c.explanation ? ` — ${c.explanation}` : ''}`);
  lines.push('');
  if (h.final) {
    lines.push('## Wrap-up', h.final.summary, '', `**Biggest surprise:** ${h.final.surprise}`, `**Still fuzzy:** ${h.final.stillConfused}`, `**Rating:** ${'★'.repeat(h.final.rating)}`, '');
  }
  if (h.recap) lines.push('## Recap', h.recap, '');
  lines.push('## The week');
  for (const d of h.days) {
    lines.push(`### Day ${d.index + 1} — ${d.theme}`, `_${d.goal}_`);
    for (const t of d.tasks) {
      lines.push(`- [${t.done ? 'x' : ' '}] ${t.title} (${t.minutes} min)${t.note ? `\n  - Note: ${t.note}` : ''}`);
    }
    if (d.reflection) lines.push('', `> ${d.reflection}`);
    lines.push('');
  }
  if (h.questions.length) {
    lines.push('## Curiosity log');
    for (const q of h.questions) lines.push(`- ${q.text}${q.answer ? `\n  - ${q.answer}` : ''}`);
    lines.push('');
  }
  if (h.explanations.length) {
    lines.push('## My explanations');
    for (const e of h.explanations) lines.push(`### ${e.concept}`, e.text, '');
  }
  return lines.join('\n');
}
