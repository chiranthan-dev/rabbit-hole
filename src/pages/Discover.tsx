import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShuffleIcon, SparklesIcon, Search01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Icon, Range, toast } from '../components/ui';
import { TopicCard } from '../components/Widgets';
import { useStore } from '../lib/store';
import { profileSummary, recommend, threadSuggestions } from '../lib/recommend';
import { CATALOG, DOMAINS } from '../lib/catalog';
import { aiEnabled, isManual } from '../lib/ai/providers';
import { ideasPrompt, parseIdeas } from '../lib/manual';
import { ClaudeHandoff } from '../components/ClaudeHandoff';
import { suggestTopics } from '../lib/ai/generate';
import type { CatalogTopic, Domain, Suggestion } from '../lib/types';
import ThoughtLine from '../bits/ThoughtLine';

export default function Discover() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome');
  const profile = useStore((s) => s.profile);
  const holes = useStore((s) => s.holes);
  const seed = useStore((s) => s.discoverSeed);
  const reshuffle = useStore((s) => s.reshuffle);
  const markShown = useStore((s) => s.markShown);
  const setProfile = useStore((s) => s.setProfile);
  const saved = useStore((s) => s.savedTopics);
  const ai = useStore((s) => s.ai);
  const aiSug = useStore((s) => s.aiSuggestions);
  const setAISuggestions = useStore((s) => s.setAISuggestions);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<Domain | 'all'>('all');
  const [loadingAI, setLoadingAI] = useState(false);
  const [handoff, setHandoff] = useState(false);

  // Freeze picks until the next shuffle so cards don't jump around as you like them.
  const recs = useMemo(
    () => recommend(profile, holes, { seed, count: 9 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, holes.length, profile.adventurousness],
  );
  useEffect(() => {
    markShown(recs.map((r) => r.topic.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const dismissed = (id: string) => !!profile.topicSignals[id]?.dismissedAt;
  const visible = recs.filter((r) => !dismissed(r.topic.id));
  const threads = threadSuggestions(holes);
  const active = holes.find((h) => h.status === 'active');

  const start = (s: Suggestion | { topic: CatalogTopic }) => nav('/new', { state: { topic: s.topic } });
  const startCustom = () => query.trim() && nav('/new', { state: { custom: query.trim() } });

  const askAI = async () => {
    setLoadingAI(true);
    try {
      const items = await suggestTopics(ai, profileSummary(profile, holes), profile.adventurousness);
      setAISuggestions(items);
      if (!items.length) toast('The model came back empty — try again.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoadingAI(false);
    }
  };

  const library = CATALOG.filter((c) => domain === 'all' || c.domain === domain);

  return (
    <div className="stack xl">
      <section className="stack lg">
        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow">{welcome ? `Welcome${profile.name ? `, ${profile.name}` : ''}. Pick your first one.` : 'Discover'}</div>
          <h1 className="display sm">Where to next?</h1>
          <p className="grey" style={{ maxWidth: 620 }}>
            A mix of things close to your interests, bridges into fields you’ve never explored, and pure wildcards. Heart what intrigues you, ✕ what
            doesn’t — every signal tunes the next shuffle.
          </p>
        </div>
        {active && (
          <div className="card flat small row wrap between">
            <span>
              You’re currently in <b>{active.title}</b>. Starting a new one will shelve it.
            </span>
            <button className="btn sm" onClick={() => nav('/')}>
              Back to it
            </button>
          </div>
        )}
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="row grow" style={{ minWidth: 260, position: 'relative' }}>
            <input
              className="input pillish"
              placeholder="Or type anything you’re curious about…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startCustom()}
              style={{ paddingLeft: 44 }}
            />
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex' }} className="muted">
              <Icon icon={Search01Icon} size={16} />
            </span>
          </div>
          <button className="btn primary" disabled={!query.trim()} onClick={startCustom}>
            Dive into this <Icon icon={ArrowRight01Icon} size={14} />
          </button>
        </div>
      </section>

      <section className="stack lg">
        <div className="row wrap between">
          <h2 className="h2">Picked for you</h2>
          <div className="row wrap" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 10, minWidth: 220 }}>
              <span className="tiny muted">Familiar</span>
              <Range value={profile.adventurousness} min={0} max={1} step={0.05} onChange={(v) => setProfile({ adventurousness: v })} ariaLabel="Adventurousness" />
              <span className="tiny muted">Wild</span>
            </div>
            <button className="btn sm" onClick={reshuffle}>
              <Icon icon={ShuffleIcon} size={14} /> Shuffle
            </button>
          </div>
        </div>
        <div className="grid three">
          {visible.map((s) => (
            <TopicCard key={s.topic.id} s={s} onStart={start} />
          ))}
        </div>
        {visible.length === 0 && <div className="empty">You’ve dismissed everything here. Shuffle for more.</div>}
      </section>

      {(aiEnabled(ai) || isManual(ai)) && (
        <section className="stack lg">
          <div className="row wrap between">
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="h2">Things you’d never search for</h2>
              <span className="small muted">{isManual(ai) ? 'Claude' : 'The AI'} reads your interest profile and invents unexpected bridges beyond the built-in library.</span>
            </div>
            <button className="btn sm" onClick={isManual(ai) ? () => setHandoff((h) => !h) : askAI} disabled={loadingAI}>
              <Icon icon={SparklesIcon} size={14} /> {isManual(ai) ? 'Ask Claude for ideas' : aiSug ? 'Generate new ones' : 'Generate'}
            </button>
          </div>
          {isManual(ai) && handoff && (
            <div className="card fade-in">
              <ClaudeHandoff
                prompt={ideasPrompt(profileSummary(profile, holes), profile.adventurousness)}
                submitLabel="Add these ideas"
                onSubmit={(text) => {
                  const items = parseIdeas(text);
                  setAISuggestions(items);
                  setHandoff(false);
                  toast(`${items.length} new ideas from Claude.`);
                }}
              />
            </div>
          )}
          {loadingAI && <ThoughtLine label="Dreaming up rabbit holes" working steps={['Reading your interests', 'Looking for strange bridges', 'Writing hooks']} color="#ffd9c7" glyphColor="#FF6D29" />}
          {aiSug && !loadingAI && (
            <div className="grid three">
              {aiSug.items
                .filter((t) => !dismissed(t.id))
                .map((t) => (
                  <TopicCard key={t.id} s={{ topic: t, bucket: 'ai', score: 1, reason: t.why }} onStart={start} />
                ))}
            </div>
          )}
        </section>
      )}

      {threads.length > 0 && (
        <section className="stack lg">
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="h2">Threads you left dangling</h2>
            <span className="small muted">Questions you parked during past holes — each one could be a whole week.</span>
          </div>
          <div className="grid three">
            {threads.map((s) => (
              <TopicCard key={s.topic.id} s={s} onStart={start} />
            ))}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section className="stack lg">
          <h2 className="h2">Saved for later</h2>
          <div className="grid three">
            {saved.map((t) => (
              <TopicCard key={t.id} s={{ topic: t, bucket: 'alley', score: 1, reason: 'You saved this.' }} onStart={start} />
            ))}
          </div>
        </section>
      )}

      <section className="stack lg">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">The library</h2>
          <span className="small muted">{CATALOG.length} hand-picked holes across {DOMAINS.length} domains.</span>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`chip${domain === 'all' ? ' on' : ''}`} onClick={() => setDomain('all')}>
            All
          </button>
          {DOMAINS.map((d) => (
            <button key={d.id} className={`chip${domain === d.id ? ' on' : ''}`} onClick={() => setDomain(d.id)}>
              {d.emoji} {d.label}
            </button>
          ))}
        </div>
        <div className="grid two">
          {library.map((t) => {
            const done = holes.some((h) => h.catalogId === t.id);
            return (
              <button key={t.id} className="card tight row top" style={{ textAlign: 'left', cursor: 'pointer', gap: 14 }} onClick={() => start({ topic: t })}>
                <span className="swatch" style={{ display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)' }}>
                  {DOMAINS.find((d) => d.id === t.domain)?.emoji}
                </span>
                <span className="stack grow" style={{ gap: 2 }}>
                  <span className="h3">
                    {t.title} {done && <span className="tag good">explored</span>}
                  </span>
                  <span className="small muted">{t.hook}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
