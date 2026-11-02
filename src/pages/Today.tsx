import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight01Icon, ArrowDownRight01Icon, QuestionIcon, SmartPhone01Icon, Refresh01Icon, Add01Icon } from '@hugeicons/core-free-icons';
import { Icon, Bar, toast } from '../components/ui';
import { TaskItem } from '../components/TaskItem';
import { DepthMeter, WeekStrip, TopicCard } from '../components/Widgets';
import { useActiveHole, useStore } from '../lib/store';
import { dayProgress, holeProgress, rebalance, todayIndex } from '../lib/planner';
import { recommend } from '../lib/recommend';
import { clamp, fmtMinutes, greeting, isoDate, prettyDate } from '../lib/util';
import type { Hole } from '../lib/types';
import ShinyText from '../bits/ShinyText';

export default function Today() {
  const hole = useActiveHole();
  return hole ? <ActiveToday hole={hole} /> : <NoHole />;
}

function NoHole() {
  const nav = useNavigate();
  const profile = useStore((s) => s.profile);
  const holes = useStore((s) => s.holes);
  const recs = useMemo(() => recommend(profile, holes, { seed: Number(isoDate().replace(/-/g, '')), count: 3 }), [profile, holes]);
  const last = [...holes].reverse().find((h) => h.status !== 'active');
  return (
    <div className="stack xl">
      <section className="stack lg center" style={{ paddingTop: '6vh' }}>
        <div className="eyebrow">
          {greeting()}
          {profile.name ? `, ${profile.name}` : ''}
        </div>
        <h1 className="display">Pick a hole.</h1>
        <div className="trio">
          <span>Research</span>
          <span>Plan</span>
          <span>Understand</span>
        </div>
        <p className="grey" style={{ maxWidth: 520, margin: '0 auto' }}>
          {last ? `Last time you explored “${last.title}”. ` : ''}Choose a topic for the week and we’ll build a plan that fits your time.
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn primary lg" onClick={() => nav('/new')}>
            Start a rabbit hole <Icon icon={ArrowDownRight01Icon} size={16} />
          </button>
          <button className="btn lg" onClick={() => nav('/discover')}>
            Browse ideas
          </button>
        </div>
      </section>
      <section className="stack lg">
        <h2 className="h2">Today’s picks</h2>
        <div className="grid three">
          {recs.map((s) => (
            <TopicCard key={s.topic.id} s={s} onStart={(x) => nav('/new', { state: { topic: x.topic } })} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ActiveToday({ hole }: { hole: Hole }) {
  const nav = useNavigate();
  const profile = useStore((s) => s.profile);
  const updateHole = useStore((s) => s.updateHole);
  const addQuestion = useStore((s) => s.addQuestion);
  const setReflection = useStore((s) => s.setReflection);
  const rawIdx = todayIndex(hole);
  const ti = clamp(rawIdx, 0, 6);
  const [sel, setSel] = useState(ti);
  const [q, setQ] = useState('');
  const day = hole.days[sel];
  const [refl, setRefl] = useState(day.reflection ?? '');
  const p = dayProgress(day);
  const hp = holeProgress(hole);
  const notStarted = rawIdx < 0;
  const over = rawIdx > 6;
  const behind = hole.days.slice(0, ti).some((d) => d.tasks.some((t) => !t.done && !t.skipped && !t.optional));
  const doneMin = day.tasks.filter((t) => t.done).reduce((s, t) => s + t.minutes, 0);
  const planned = day.tasks.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0);

  const park = () => {
    if (!q.trim()) return;
    addQuestion(hole.id, q.trim(), sel);
    setQ('');
    toast('Parked. Find it under Questions — or as a future rabbit hole.');
  };

  const doRebalance = () => {
    const r = rebalance(hole);
    updateHole(hole.id, () => r.hole);
    toast(r.moved || r.trimmed ? `Moved ${r.moved} task${r.moved === 1 ? '' : 's'} forward${r.trimmed ? `, ${r.trimmed} became bonus` : ''}.` : 'Nothing to move.');
  };

  return (
    <div className="stack xl">
      <section className="stack" style={{ gap: 10 }}>
        <div className="eyebrow">
          {greeting()}
          {profile.name ? `, ${profile.name}` : ''} · {prettyDate(isoDate())}
        </div>
        <Link to={`/hole/${hole.id}`} style={{ textDecoration: 'none' }}>
          <h1 className="display sm">{hole.title}</h1>
        </Link>
        {hole.tagline && <div className="grey">{hole.tagline}</div>}
      </section>

      {over && (
        <div className="card hot row wrap between">
          <div className="stack" style={{ gap: 4 }}>
            <div className="h2">Your week is up.</div>
            <div className="small muted">Wrap it up: reflect, take the final quiz and see what you now understand.</div>
          </div>
          <button className="btn primary" onClick={() => nav(`/hole/${hole.id}?tab=finish`)}>
            Wrap up <Icon icon={ArrowRight01Icon} size={14} />
          </button>
        </div>
      )}

      <div className="split">
        <div className="stack lg">
          <div className="card stack lg">
            <div className="row between top">
              <div className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="tag orange">Day {sel + 1}</span>
                  {sel === ti && !notStarted && !over && <ShinyText text="today" color="#ffd9c7" shineColor="#FF6D29" speed={2.5} className="small" />}
                  {notStarted && sel === 0 && <span className="small muted">starts {prettyDate(hole.startDate)}</span>}
                </div>
                <div className="h2">{day.theme}</div>
                <div className="small muted">{day.goal}</div>
              </div>
              <div className="stack" style={{ gap: 2, textAlign: 'right', flex: 'none' }}>
                <span className="h3">
                  {p.done}/{p.total}
                </span>
                <span className="tiny muted">
                  {fmtMinutes(doneMin)} / {fmtMinutes(planned)}
                </span>
              </div>
            </div>
            <Bar value={p.ratio} />
            <div className="stack" style={{ gap: 8 }}>
              {day.tasks.length === 0 && <div className="empty small">Rest day. Let it marinate. 🌙</div>}
              {day.tasks.map((t) => (
                <TaskItem key={t.id} holeId={hole.id} task={t} />
              ))}
            </div>
            {p.ratio >= 1 && day.tasks.length > 0 && (
              <div className="small" style={{ color: '#8fd694' }}>
                Day complete. Anything extra is a bonus — or wander off into a tangent.
              </div>
            )}
          </div>

          <div className="card stack">
            <div className="row" style={{ gap: 8 }}>
              <Icon icon={QuestionIcon} size={18} color="#FF6D29" />
              <span className="h3">Park a question</span>
            </div>
            <div className="small muted">Something you want to know but shouldn’t chase right now? Park it. Questions shape your future rabbit holes.</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="input pillish" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && park()} placeholder="Wait, but why does…" />
              <button className="btn icon" onClick={park} aria-label="Park question">
                <Icon icon={Add01Icon} size={18} />
              </button>
            </div>
          </div>

          <div className="card stack">
            <span className="h3">End-of-day note</span>
            <div className="small muted">What clicked today? What’s still fuzzy? Two sentences is plenty.</div>
            <textarea
              key={sel}
              className="textarea"
              defaultValue={day.reflection ?? ''}
              onChange={(e) => setRefl(e.target.value)}
              onBlur={() => refl !== (day.reflection ?? '') && setReflection(hole.id, sel, refl)}
              placeholder="Today I realised…"
            />
          </div>
        </div>

        <div className="stack lg">
          <div className="card stack lg">
            <DepthMeter days={hole.days} current={ti} />
            <WeekStrip
              days={hole.days}
              selected={sel}
              onSelect={(i) => {
                setSel(i);
                setRefl(hole.days[i].reflection ?? '');
              }}
            />
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between small">
                <span className="muted">Week progress</span>
                <span>
                  {hp.done}/{hp.total} · {fmtMinutes(hp.minutes)}
                </span>
              </div>
              <Bar value={hp.ratio} />
            </div>
            {behind && (
              <button className="btn sm" onClick={doRebalance}>
                <Icon icon={Refresh01Icon} size={14} /> Fell behind? Rebalance the rest of the week
              </button>
            )}
          </div>
          <div className="card stack" style={{ gap: 8 }}>
            {[
              { to: `/hole/${hole.id}?tab=brief`, label: 'Brief & key ideas' },
              { to: `/hole/${hole.id}?tab=practice`, label: 'Practice — quiz & explain' },
              { to: `/hole/${hole.id}?tab=questions`, label: `Curiosity log (${hole.questions.length})` },
              { to: `/hole/${hole.id}?tab=week`, label: 'Whole week & time budget' },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="row between" style={{ textDecoration: 'none', padding: '6px 2px' }}>
                <span>{l.label}</span>
                <Icon icon={ArrowRight01Icon} size={14} />
              </Link>
            ))}
          </div>
          <Link to="/m" className="card flat row" style={{ textDecoration: 'none', gap: 12 }}>
            <Icon icon={SmartPhone01Icon} size={20} />
            <span className="stack" style={{ gap: 0 }}>
              <span className="small">Phone view</span>
              <span className="tiny muted">Just today’s checklist — add it to your home screen.</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
