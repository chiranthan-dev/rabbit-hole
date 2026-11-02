import { describe, expect, it } from 'vitest';
import { ideasPrompt, parseIdeas, parseWeek, weekPrompt, type WeekArgs } from '../manual';
import { offlineQuiz, resourceLinks } from '../extras';
import { isoDate } from '../util';

const args: WeekArgs = {
  topic: 'How bridges stay up',
  depth: 'committed',
  style: 'mixed',
  budgets: [30, 30, 0, 45, 30, 60, 30],
  startDate: isoDate(),
  interests: ['systems'],
};

const day = (n: number, minutes: number[]) => ({
  day: n,
  theme: `Theme ${n}`,
  goal: `Goal ${n}`,
  tasks: minutes.map((m, i) => ({
    title: `Task ${n}.${i}`,
    kind: i === 0 ? 'watch' : i === 1 ? 'explain' : 'teleport',
    minutes: m,
    description: 'Do it',
    why: 'Because',
    checkpoint: 'Can you?',
    resource: i === 0 ? { title: 'Practical Engineering', url: 'https://www.youtube.com/@PracticalEngineeringChannel' } : { title: '', url: 'javascript:alert(1)' },
    optional: false,
  })),
});

const reply = `Here's your week! I searched a few sources first.

\`\`\`json
${JSON.stringify({
  rabbitHole: 'week-plan',
  title: 'Why Bridges Stand',
  tagline: 'Forces, shapes and the art of not falling down.',
  domain: 'design',
  tags: ['Engineering', 'materials', 'systems'],
  summary: 'Bridges are arguments with gravity.',
  whyFascinating: 'Every shape is a different answer to the same question.',
  concepts: [{ term: 'Tension', explanation: 'Pulling force.' }, { term: 'Compression', explanation: 'Pushing force.' }],
  guidingQuestions: ['Why do arches work?'],
  misconceptions: ['Heavier is always stronger'],
  resources: [{ title: 'To Engineer Is Human', url: 'https://example.com/book', type: 'book', why: 'Classic' }],
  days: [day(1, [20, 10]), day(2, [60, 60, 30]), { day: 3, theme: 'Rest', goal: 'Rest', tasks: [] }, day(4, [20, 20]), day(5, [15, 15]), day(6, [30, 30]), day(7, [15, 15])],
  quiz: [
    { prompt: 'Which force does an arch mostly carry?', kind: 'mcq', options: ['Tension', 'Compression', 'Shear', 'Torsion'], answerIndex: 1, modelAnswer: 'Compression', concept: 'Compression' },
    { prompt: 'Explain why suspension cables are curved.', kind: 'open', options: [], answerIndex: -1, modelAnswer: 'Catenary shape…' },
    { prompt: 'Broken mcq', kind: 'mcq', options: ['a'], answerIndex: 5, modelAnswer: 'x' },
  ],
  rabbitTrails: ['Tacoma Narrows'],
}, null, 2)}
\`\`\`

Enjoy!`;

describe('copy-paste Claude flow', () => {
  it('prompt carries topic, per-day minutes and rest days', () => {
    const p = weekPrompt(args);
    expect(p).toContain('How bridges stay up');
    expect(p).toContain('30 minutes');
    expect(p).toContain('REST DAY');
    expect(p).toContain('"days"');
  });

  it('parses a real-looking reply into a week that fits the budget', () => {
    const { hole, warnings } = parseWeek(reply, args);
    expect(hole.title).toBe('Why Bridges Stand');
    expect(hole.domain).toBe('design');
    expect(hole.tags).toContain('engineering');
    expect(hole.days).toHaveLength(7);
    expect(hole.days[2].tasks).toHaveLength(0); // rest day
    hole.days.forEach((d) => {
      const core = d.tasks.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0);
      expect(core).toBeLessThanOrEqual(Math.ceil(d.budget * 1.15));
    });
    expect(warnings.some((w) => w.includes('Day 2'))).toBe(true);
    expect(hole.days[1].tasks[2].kind).toBe('read'); // unknown kind falls back
    expect(hole.days[0].tasks[0].resource?.url).toContain('youtube.com');
    expect(hole.days[0].tasks[1].resource).toBeUndefined(); // unsafe URL dropped
    expect(hole.quizBank).toHaveLength(3);
    expect(hole.quizBank![2].kind).toBe('open'); // broken mcq downgraded
    expect(hole.brief.resources[0].url).toBe('https://example.com/book');
  });

  it('real links come first, searches stay as backup', () => {
    const links = resourceLinks({ title: 'X', query: 'X', url: 'https://www.example.com/a' });
    expect(links[0].label).toBe('Open · example.com');
    expect(links.length).toBeGreaterThan(1);
  });

  it('quizzes draw from the bank', () => {
    const { hole } = parseWeek(reply, args);
    expect(offlineQuiz(hole).map((q) => q.prompt)).toContain('Which force does an arch mostly carry?');
  });

  it('gives a helpful error for junk', () => {
    expect(() => parseWeek('', args)).toThrow(/Paste/);
    expect(() => parseWeek('Sorry, I cannot help', args)).toThrow(/JSON/);
    expect(() => parseWeek('{"title":"x"}', args)).toThrow(/days/);
  });

  it('parses topic ideas', () => {
    expect(ideasPrompt({ topDomains: [], lowDomains: [], topTags: [], disliked: [], done: [] }, 0.5)).toContain('topic-ideas');
    const ideas = parseIdeas('```json\n{"topics":[{"title":"Why bells ring","hook":"h","domain":"music","tags":["Physics"],"concepts":["a"],"questions":["q"],"why":"w"}]}\n```');
    expect(ideas[0].title).toBe('Why bells ring');
    expect(ideas[0].tags).toEqual(['physics']);
  });
});
