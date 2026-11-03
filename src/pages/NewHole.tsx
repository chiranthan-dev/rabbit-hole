import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight01Icon, ArrowLeft01Icon, Refresh01Icon, Rocket01Icon, Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Icon, Range, toast } from '../components/ui';
import { canStartHole, MAX_ACTIVE, useStore } from '../lib/store';
import { domainEmoji as emojiFor } from '../lib/catalog';
import { recommend } from '../lib/recommend';
import { domainEmoji, domainLabel } from '../lib/catalog';
import { createHole, type Step } from '../lib/create';
import { aiEnabled, isManual, providerLabel } from '../lib/ai/providers';
import { parseWeek, weekPrompt, type WeekArgs } from '../lib/manual';
import { ClaudeHandoff } from '../components/ClaudeHandoff';
import { KIND_META } from '../lib/planner';
import type { CatalogTopic, Depth, Hole, LearningStyle } from '../lib/types';
import { addDays, fmtMinutes, isoDate, parseDate, weekdayShort } from '../lib/util';
import LatticeLoader from '../bits/LatticeLoader';

const DEPTHS: { id: Depth; label: string; text: string }[] = [
  { id: 'curious', label: 'Curious', text: 'Light and intuitive. Enjoy the ride.' },
  { id: 'committed', label: 'Committed', text: 'Solid understanding with some rigour.' },
  { id: 'obsessed', label: 'Obsessed', text: 'Primary sources, harder material, go deep.' },
];
const STYLES: { id: LearningStyle; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'reading', label: 'Reading' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'hands-on', label: 'Hands-on' },
];
const PRESETS = [15, 30, 45, 60, 90, 120];

function nextMonday() {
  const d = new Date();
  const add = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return isoDate(d);
}

export default function NewHole() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { topic?: CatalogTopic; custom?: string } };
  const profile = useStore((s) => s.profile);
  const holes = useStore((s) => s.holes);
  const ai = useStore((s) => s.ai);
  const addHole = useStore((s) => s.addHole);

  // On phones, switching to the Claude app can reload this tab — keep the wizard as a draft.
  const [draft] = useState(() => {
    if (loc.state) {
      clearDraft(); // a fresh start from Discover/Today replaces any old draft
      return null;
    }
    return loadDraft();
  });
  const initialEntry = draft ? draft.entry : loc.state?.topic && !loc.state.topic.id.startsWith('thread-') && !loc.state.topic.id.startsWith('trail-') ? loc.state.topic : undefined;
  const initialText = draft ? draft.topic : loc.state?.custom ?? loc.state?.topic?.title ?? '';
  const [entry, setEntry] = useState<CatalogTopic | undefined>(initialEntry);
  const [topic, setTopic] = useState(initialText);
  const [step, setStep] = useState(draft ? 3 : initialText ? 1 : 0);
  const [angle, setAngle] = useState(draft ? draft.angle ?? '' : loc.state?.topic?.id.startsWith('thread-') ? loc.state.topic.questions[0] ?? '' : '');
  const [depth, setDepth] = useState<Depth>(draft?.depth ?? 'committed');
  const [style, setStyle] = useState<LearningStyle>(draft?.style ?? profile.style);
  const [startDate, setStartDate] = useState(draft?.startDate ?? isoDate());
  const [perDay, setPerDay] = useState(profile.defaultMinutes);
  const [budgets, setBudgets] = useState<number[]>(() => draft?.budgets ?? Array(7).fill(profile.defaultMinutes));
  const manual = isManual(ai);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<{ hole: Hole; warnings: string[] } | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const activeHoles = holes.filter((h) => h.status === 'active');
  const full = activeHoles.length >= MAX_ACTIVE;
  /** Minutes already planned on a date by the holes you're in (unfinished core tasks). */
  const otherLoad = (date: string) =>
    activeHoles.reduce((sum, h) => {
      const d = h.days.find((x) => x.date === date);
      return sum + (d ? d.tasks.filter((t) => !t.done && !t.optional && !t.skipped).reduce((s2, t) => s2 + t.minutes, 0) : 0);
    }, 0);

  const quick = useMemo(() => recommend(profile, holes, { seed: 42, count: 6 }), [profile, holes]);
  const total = budgets.reduce((s, b) => s + b, 0);

  const setAll = (m: number) => {
    setPerDay(m);
    setBudgets(Array(7).fill(m));
  };
  const weekendBoost = () =>
    setBudgets((b) =>
      b.map((m, i) => {
        const day = parseDate(addDays(startDate, i)).getDay();
        return day === 0 || day === 6 ? Math.min(240, m + 30) : m;
      }),
    );

  const interests = Object.entries(profile.tagAffinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t);
  const args: WeekArgs = { topic: topic.trim(), entry, angle: angle.trim() || undefined, depth, style, budgets, startDate, interests };

  const generate = async () => {
    setStep(3);
    setError('');
    setSteps([]);
    setResult(null);
    if (manual) {
      saveDraft(args);
      // Drop the navigation state so a reload (e.g. after switching to the Claude app) restores the draft.
      nav('/new', { replace: true, state: null });
      return;
    }
    abort.current = new AbortController();
    try {
      const r = await createHole(ai, args, setSteps, abort.current.signal);
      setResult(r);
      setStep(4);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setStep(2);
        return;
      }
      setError((e as Error).message);
    }
  };

  const begin = () => {
    if (!result) return;
    if (!canStartHole(useStore.getState().holes)) {
      toast(`You’re already in ${MAX_ACTIVE} rabbit holes — shelve or finish one first.`);
      return;
    }
    addHole(result.hole);
    clearDraft();
    toast('Down the rabbit hole you go 🕳️');
    nav('/');
  };

  return (
    <div className="stack xl" style={{ maxWidth: 820, margin: '0 auto' }}>
      {full && <LimitCard />}
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">New rabbit hole · step {Math.min(step, 4) + 1} of 5</div>
        <h1 className="display sm">{step === 0 ? 'What are you curious about?' : topic || 'New rabbit hole'}</h1>
        {entry && step > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag orange">
              {domainEmoji(entry.domain)} {domainLabel(entry.domain)}
            </span>
            {entry.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {step === 0 && (
        <div className="stack lg fade-in">
          <input
            className="input pillish"
            autoFocus
            placeholder="e.g. Why do cats purr? · The history of zero · How vaccines work"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setEntry(undefined);
            }}
            onKeyDown={(e) => e.key === 'Enter' && topic.trim() && setStep(1)}
          />
          <div className="stack" style={{ gap: 8 }}>
            <div className="small muted">Or pick one of these:</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {quick.map((s) => (
                <button
                  key={s.topic.id}
                  className="chip"
                  onClick={() => {
                    setEntry(s.topic);
                    setTopic(s.topic.title);
                    setStep(1);
                  }}
                >
                  {domainEmoji(s.topic.domain)} {s.topic.title}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={!topic.trim()} onClick={() => setStep(1)}>
              Continue <Icon icon={ArrowRight01Icon} size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack lg fade-in">
          {entry?.hook && <p className="grey">{entry.hook}</p>}
          <label className="field">
            Your angle (optional) — a question you want answered, or why this grabbed you
            <textarea className="textarea" value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="e.g. I want to understand it well enough to explain it to my friends." />
          </label>
          <div className="stack" style={{ gap: 8 }}>
            <div className="small muted">How deep?</div>
            <div className="grid three">
              {DEPTHS.map((d) => (
                <button key={d.id} className={`card tight stack${depth === d.id ? ' hot' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', gap: 4 }} onClick={() => setDepth(d.id)}>
                  <span className="h3">{d.label}</span>
                  <span className="small muted">{d.text}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="small muted">Learning style this week</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {STYLES.map((s) => (
                <button key={s.id} className={`chip${style === s.id ? ' on' : ''}`} onClick={() => setStyle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row between">
            <button className="btn" onClick={() => setStep(0)}>
              <Icon icon={ArrowLeft01Icon} size={14} /> Topic
            </button>
            <button className="btn primary" onClick={() => setStep(2)}>
              Continue <Icon icon={ArrowRight01Icon} size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack lg fade-in">
          <div className="card stack lg">
            <div className="stack" style={{ gap: 4 }}>
              <div className="h2">How much time do you have each day this week?</div>
              <div className="small muted">Be honest — the plan is built to fit. Set a day to 0 for a rest day.</div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="small muted">Start</span>
              {[
                { d: isoDate(), l: 'Today' },
                { d: addDays(isoDate(), 1), l: 'Tomorrow' },
                { d: nextMonday(), l: 'Next Monday' },
              ].map((o) => (
                <button key={o.l} className={`chip${startDate === o.d ? ' on' : ''}`} onClick={() => setStartDate(o.d)}>
                  {o.l}
                </button>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="small muted">Every day</span>
              {PRESETS.map((m) => (
                <button key={m} className={`chip${perDay === m && budgets.every((b) => b === m) ? ' on' : ''}`} onClick={() => setAll(m)}>
                  {fmtMinutes(m)}
                </button>
              ))}
              <button className="chip" onClick={weekendBoost}>
                +30 on weekends
              </button>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {budgets.map((b, i) => {
                const date = addDays(startDate, i);
                return (
                  <div key={i} className="row" style={{ gap: 14 }}>
                    <span className="small" style={{ width: 92 }}>
                      {weekdayShort(date)} <span className="faint">{parseDate(date).getDate()}</span>
                    </span>
                    <Range value={b} min={0} max={240} step={5} onChange={(v) => setBudgets((x) => x.map((y, j) => (j === i ? v : y)))} ariaLabel={`Minutes on ${weekdayShort(date)}`} />
                    <span className="small" style={{ width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {b === 0 ? 'rest' : fmtMinutes(b)}
                    </span>
                    {activeHoles.length > 0 && (
                      <span className="tiny faint hide-sm" style={{ width: 86, textAlign: 'right' }} title="Already planned that day in your other rabbit holes">
                        {otherLoad(date) ? `+${fmtMinutes(otherLoad(date))} other` : '—'}
                      </span>
                    )}
                  </div>
                );
              })}
              {activeHoles.length > 0 && (
                <div className="tiny faint">
                  “other” = time already planned that day in {activeHoles.map((h) => h.title).join(', ')}. Keep the total realistic.
                </div>
              )}
            </div>
            <div className="divider" />
            <div className="row between small">
              <span className="muted">Total this week</span>
              <b>{fmtMinutes(total)}</b>
            </div>
          </div>
          <div className="card flat small row wrap between">
            <span className="muted">
              Planner: <b className="grey">{providerLabel(ai)}</b>
              {manual && ' — you’ll paste a prompt into Claude, which researches the web and sends back your week.'}
              {!aiEnabled(ai) && !manual && ' — using templates from the offline library.'}
            </span>
            <button className="btn sm ghost" onClick={() => nav('/settings')}>
              Change
            </button>
          </div>
          <div className="row between">
            <button className="btn" onClick={() => setStep(1)}>
              <Icon icon={ArrowLeft01Icon} size={14} /> Back
            </button>
            <button className="btn primary lg" disabled={total === 0} onClick={generate}>
              {manual ? 'Get my week from Claude' : 'Research & plan my week'} <Icon icon={Rocket01Icon} size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && manual && (
        <div className="card stack lg fade-in">
          <div className="stack" style={{ gap: 4 }}>
            <div className="h2">Let Claude do the research</div>
            <div className="small muted">
              The prompt includes your topic, angle, depth and the exact minutes for each day. Claude searches the web and replies with your whole week as a file.
            </div>
          </div>
          <ClaudeHandoff
            prompt={weekPrompt(args)}
            submitLabel="Build my week"
            pastePlaceholder="Paste Claude’s reply here (the JSON) — or upload the file it gave you."
            onSubmit={(text) => {
              const r = parseWeek(text, args);
              setResult(r);
              setStep(4);
            }}
          />
          <div className="row between">
            <button
              className="btn"
              onClick={() => {
                clearDraft();
                setStep(2);
              }}
            >
              <Icon icon={ArrowLeft01Icon} size={14} /> Back
            </button>
            <span className="tiny faint">Your choices are saved, so it’s fine to switch apps.</span>
          </div>
        </div>
      )}

      {step === 3 && !manual && (
        <div className="card stack lg fade-in">
          <LatticeLoader
            label={error ? 'Something went wrong' : 'Digging the tunnel'}
            status={error ? 'error' : 'working'}
            color="#FF6D29"
            glow
            showTimer
          />
          <div className="stack" style={{ gap: 8 }}>
            {steps.map((s, i) => (
              <div key={i} className="row top small" style={{ gap: 10 }}>
                <span style={{ width: 18, display: 'inline-flex', color: s.state === 'done' ? '#8fd694' : s.state === 'error' ? '#ff9b9b' : '#FF6D29' }}>
                  {s.state === 'done' ? <Icon icon={Tick02Icon} size={16} /> : s.state === 'error' ? <Icon icon={Cancel01Icon} size={16} /> : '•'}
                </span>
                <span className="grow">
                  {s.label}
                  {s.detail && <span className="faint"> — {s.detail}</span>}
                </span>
              </div>
            ))}
          </div>
          {aiEnabled(ai) && !error && (
            <div className="tiny faint">Local models can take a minute or two for a full week — each day is planned separately so it fits your time.</div>
          )}
          {error && <div className="code">{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            {error ? (
              <>
                <button className="btn" onClick={() => setStep(2)}>
                  Back
                </button>
                <button className="btn primary" onClick={generate}>
                  Try again
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {step === 4 && result && <Review result={result} onBegin={begin} onRegenerate={generate} onBack={() => setStep(2)} />}
    </div>
  );
}

/** Shown when you're already in MAX_ACTIVE holes: shelve one in a tap, or keep planning and start later. */
function LimitCard() {
  const holes = useStore((s) => s.holes).filter((h) => h.status === 'active');
  const abandonHole = useStore((s) => s.abandonHole);
  const nav = useNavigate();
  return (
    <div className="card hot stack fade-in">
      <div className="stack" style={{ gap: 4 }}>
        <div className="h2">You’re in {MAX_ACTIVE} rabbit holes already</div>
        <div className="small muted">
          That’s the limit, so each one gets real attention. Shelve one (you can resume it any time from the Journal), or finish it first. You can still plan this one now.
        </div>
      </div>
      {holes.map((h) => (
        <div key={h.id} className="row between wrap" style={{ gap: 8 }}>
          <span className="row" style={{ gap: 8 }}>
            <span>{emojiFor(h.domain)}</span>
            <span>{h.title}</span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={() => nav(`/hole/${h.id}`)}>
              Open
            </button>
            <button
              className="btn sm"
              onClick={() => {
                abandonHole(h.id);
                toast(`Shelved “${h.title}”. Resume it any time from the Journal.`);
              }}
            >
              Shelve
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

const DRAFT_KEY = 'rabbit-hole-draft';
function saveDraft(a: WeekArgs) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...a, savedAt: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}
function loadDraft(): WeekArgs | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    // Drafts expire after a day.
    if (!d || Date.now() - d.savedAt > 86_400_000) return null;
    return d as WeekArgs;
  } catch {
    return null;
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function Review({ result, onBegin, onRegenerate, onBack }: { result: { hole: Hole; warnings: string[] }; onBegin: () => void; onRegenerate: () => void; onBack: () => void }) {
  const h = result.hole;
  return (
    <div className="stack lg fade-in">
      {result.warnings.length > 0 && (
        <div className="card flat small stack" style={{ gap: 4, borderColor: 'rgba(255,192,105,.4)' }}>
          {result.warnings.map((w, i) => (
            <span key={i} style={{ color: '#ffc069' }}>
              {w}
            </span>
          ))}
        </div>
      )}
      <div className="card hot stack">
        <div className="eyebrow">{h.tagline}</div>
        <p style={{ margin: 0 }}>{h.brief.summary}</p>
        {h.brief.whyFascinating && <p className="grey small" style={{ margin: 0 }}>✦ {h.brief.whyFascinating}</p>}
        <div className="row wrap" style={{ gap: 6 }}>
          {h.brief.concepts.map((c) => (
            <span key={c.id} className="tag">
              {c.term}
            </span>
          ))}
        </div>
      </div>
      <div className="stack">
        {h.days.map((d) => (
          <div key={d.index} className="card tight stack" style={{ gap: 8 }}>
            <div className="row between">
              <div className="row" style={{ gap: 10 }}>
                <span className="tag orange">Day {d.index + 1}</span>
                <span className="h3">{d.theme}</span>
              </div>
              <span className="small muted">{d.budget ? fmtMinutes(d.budget) : 'rest'}</span>
            </div>
            <div className="small muted">{d.goal}</div>
            {d.tasks.map((t) => (
              <div key={t.id} className="row small" style={{ gap: 8 }}>
                <span className="kind">{KIND_META[t.kind].label}</span>
                <span className="grow">{t.title}</span>
                <span className="faint">
                  {t.minutes}m{t.optional ? ' · bonus' : ''}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="row wrap between">
        <button className="btn" onClick={onBack}>
          <Icon icon={ArrowLeft01Icon} size={14} /> Adjust time
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={onRegenerate}>
            <Icon icon={Refresh01Icon} size={14} /> Regenerate
          </button>
          <button className="btn primary lg" onClick={onBegin}>
            Start the week <Icon icon={ArrowRight01Icon} size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
