// The "what next?" engine.
//
// Goal: help you find rabbit holes you would NOT have thought of yourself,
// while still respecting what you enjoy. It mixes three kinds of picks:
//
//  - Down your alley — high affinity with tags/domains you have liked.
//  - One hop over    — topics in domains you barely know that share tags with
//                      things you love (a "bridge" via tag co-occurrence).
//  - Wildcards       — far from your profile, chosen for novelty with a seeded
//                      bit of randomness, so you keep getting surprised.
//
// The adventurousness setting shifts the mix. Every like, dismissal, started
// hole, rating and "go deeper" updates the profile (see store.ts).

import { CATALOG, domainLabel } from './catalog';
import type { CatalogTopic, Domain, Hole, Profile, Suggestion } from './types';
import { clamp, mulberry32 } from './util';

// Tag co-occurrence similarity across the whole catalog (cosine on counts).
const tagFreq = new Map<string, number>();
const cooc = new Map<string, Map<string, number>>();
function indexTopics(topics: CatalogTopic[]) {
  tagFreq.clear();
  cooc.clear();
  for (const t of topics) {
    for (const a of t.tags) {
      tagFreq.set(a, (tagFreq.get(a) ?? 0) + 1);
      for (const b of t.tags) {
        if (a === b) continue;
        const row = cooc.get(a) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        cooc.set(a, row);
      }
    }
  }
}
indexTopics(CATALOG);

export function tagSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const c = cooc.get(a)?.get(b) ?? 0;
  if (!c) return 0;
  return c / Math.sqrt((tagFreq.get(a) ?? 1) * (tagFreq.get(b) ?? 1));
}

const squash = (x: number) => Math.tanh(x / 2); // keeps affinities in (-1, 1)

export function domainExposure(holes: Hole[]): Partial<Record<Domain, number>> {
  const out: Partial<Record<Domain, number>> = {};
  for (const h of holes) out[h.domain] = (out[h.domain] ?? 0) + 1;
  return out;
}

interface Scored {
  topic: CatalogTopic;
  fam: number;
  bridge: number;
  bridgeFrom?: string;
  bridgeTo?: string;
  novelty: number;
  likedTag?: string;
  rand: number;
}

function score(topic: CatalogTopic, p: Profile, exposure: Partial<Record<Domain, number>>, rand: number): Scored {
  const dAff = squash(p.domainAffinity[topic.domain] ?? 0);
  const tagAffs = topic.tags.map((t) => squash(p.tagAffinity[t] ?? 0));
  const tAff = tagAffs.reduce((s, x) => s + x, 0) / Math.max(1, tagAffs.length);
  const fam = 0.55 * dAff + 0.45 * tAff;

  let likedTag: string | undefined;
  let bestLiked = 0;
  topic.tags.forEach((t, i) => {
    if (tagAffs[i] > bestLiked) {
      bestLiked = tagAffs[i];
      likedTag = t;
    }
  });

  // Bridge: strongest link between one of this topic's tags and a tag you love.
  let bridge = 0;
  let bridgeFrom: string | undefined;
  let bridgeTo: string | undefined;
  const loved = Object.entries(p.tagAffinity)
    .filter(([, v]) => v > 0.2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  for (const tt of topic.tags) {
    for (const [lt, lv] of loved) {
      const s = tagSimilarity(tt, lt) * squash(lv);
      if (s > bridge) {
        bridge = s;
        bridgeFrom = lt;
        bridgeTo = tt;
      }
    }
  }
  // Bridges are most valuable into domains you know little about.
  bridge *= 1 - Math.max(0, dAff);

  const seen = p.topicSignals[topic.id]?.shown ?? 0;
  const novelty = (1 / (1 + (exposure[topic.domain] ?? 0))) * Math.pow(0.85, seen) * (1 - Math.max(0, dAff) * 0.6);

  return { topic, fam, bridge, bridgeFrom, bridgeTo, novelty, likedTag, rand };
}

export interface RecommendOptions {
  count?: number;
  seed?: number;
  pool?: CatalogTopic[];
}

const DISMISS_COOLDOWN_DAYS = 30;

export function recommend(profile: Profile, holes: Hole[], opts: RecommendOptions = {}): Suggestion[] {
  const count = opts.count ?? 9;
  const rnd = mulberry32(opts.seed ?? 1);
  const pool = opts.pool ?? CATALOG;
  const taken = new Set(holes.map((h) => h.catalogId).filter(Boolean));
  const now = Date.now();
  const candidates = pool.filter((t) => {
    if (taken.has(t.id)) return false;
    const sig = profile.topicSignals[t.id];
    if (sig?.dismissedAt && now - Date.parse(sig.dismissedAt) < DISMISS_COOLDOWN_DAYS * 86_400_000) return false;
    return true;
  });
  const exposure = domainExposure(holes);
  const scored = candidates.map((t) => score(t, profile, exposure, rnd()));

  const a = clamp(profile.adventurousness, 0, 1);
  const nWild = Math.max(1, Math.round(count * (0.15 + 0.3 * a)));
  const nAlley = Math.max(1, Math.round(count * (0.5 - 0.3 * a)));
  const nHop = Math.max(1, count - nWild - nAlley);

  const used = new Set<string>();
  const usedDomains = new Map<Domain, number>();
  const take = (list: Scored[], n: number, bucket: Suggestion['bucket'], val: (s: Scored) => number, reason: (s: Scored) => string) => {
    const out: Suggestion[] = [];
    const sorted = [...list].sort((x, y) => val(y) - val(x));
    for (const s of sorted) {
      if (out.length >= n) break;
      if (used.has(s.topic.id)) continue;
      // Diversity: at most two picks from the same domain per refresh.
      if ((usedDomains.get(s.topic.domain) ?? 0) >= 2) continue;
      used.add(s.topic.id);
      usedDomains.set(s.topic.domain, (usedDomains.get(s.topic.domain) ?? 0) + 1);
      out.push({ topic: s.topic, bucket, score: val(s), reason: reason(s) });
    }
    return out;
  };

  const alley = take(
    scored,
    nAlley,
    'alley',
    (s) => s.fam + 0.15 * s.rand,
    (s) =>
      s.likedTag
        ? `You keep gravitating to “${s.likedTag}” — this goes further.`
        : `Close to the ${domainLabel(s.topic.domain).toLowerCase()} topics you enjoy.`,
  );
  const hop = take(
    scored,
    nHop,
    'hop',
    (s) => s.bridge + 0.25 * s.novelty + 0.1 * s.rand,
    (s) =>
      s.bridgeFrom && s.bridgeTo
        ? `A bridge from “${s.bridgeFrom}” (which you like) into ${domainLabel(s.topic.domain)}.`
        : `One step outside your usual — into ${domainLabel(s.topic.domain)}.`,
  );
  const wild = take(
    scored,
    nWild,
    'wildcard',
    (s) => s.novelty * (1 - Math.max(0, s.fam)) + 0.6 * s.rand,
    (s) =>
      (exposure[s.topic.domain] ?? 0) === 0
        ? `Wildcard — you have never been down a ${domainLabel(s.topic.domain).toLowerCase()} hole.`
        : `Wildcard — nothing you have liked points here. That’s the point.`,
  );
  return [...alley, ...hop, ...wild];
}

/** Turn questions you parked during past holes into follow-up rabbit holes. */
export function threadSuggestions(holes: Hole[], limit = 6): Suggestion[] {
  const out: Suggestion[] = [];
  for (const h of [...holes].reverse()) {
    for (const q of h.questions) {
      if (q.resolved) continue;
      out.push({
        topic: {
          id: `thread-${q.id}`,
          title: q.text.length > 70 ? q.text.slice(0, 67) + '…' : q.text,
          hook: `A question you parked during “${h.title}”.`,
          domain: h.domain,
          tags: h.tags,
          concepts: [],
          questions: [q.text],
          starters: [q.text],
        },
        bucket: 'thread',
        score: 1,
        reason: `From your curiosity log in “${h.title}”.`,
      });
      if (out.length >= limit) return out;
    }
    for (const trail of h.final?.wantMore ? h.brief.rabbitTrails.slice(0, 2) : []) {
      out.push({
        topic: {
          id: `trail-${h.id}-${trail}`,
          title: trail,
          hook: `A side tunnel spotted while exploring “${h.title}”.`,
          domain: h.domain,
          tags: h.tags,
          concepts: [],
          questions: [],
          starters: [trail],
        },
        bucket: 'thread',
        score: 0.8,
        reason: `You said you wanted more after “${h.title}”.`,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** A compact description of the profile for the AI suggestion prompt. */
export function profileSummary(p: Profile, holes: Hole[]) {
  const topDomains = Object.entries(p.domainAffinity)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 4)
    .map(([d]) => d);
  const lowDomains = Object.entries(p.domainAffinity)
    .filter(([, v]) => (v ?? 0) <= 0)
    .map(([d]) => d);
  const topTags = Object.entries(p.tagAffinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
  const disliked = Object.entries(p.tagAffinity)
    .filter(([, v]) => v < -0.3)
    .map(([t]) => t);
  const done = holes.map((h) => `${h.title}${h.final ? ` (rated ${h.final.rating}/5)` : ''}`);
  return { topDomains, lowDomains, topTags, disliked, done };
}
