// The phone view: today's checklist and nothing else.
// Swipe a task left to finish or skip it; tap it for the details.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Maximize01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Background } from '../components/Shell';
import { Icon, Modal, Ring, Toasts, toast } from '../components/ui';
import { useActiveHole, useStore } from '../lib/store';
import { dayProgress, todayIndex } from '../lib/planner';
import { clamp, fmtMinutes, prettyDate, isoDate } from '../lib/util';
import type { Task } from '../lib/types';
import SwipeRow from '../bits/SwipeRow';
import SpringCheck from '../bits/SpringCheck';
import { resourceLinks } from '../lib/extras';
import { SyncDot } from '../components/SyncPanel';
import { cycleHole, HoleSwitcher } from '../components/HoleSwitcher';

export default function Mobile() {
  const hole = useActiveHole();
  const completeTask = useStore((s) => s.completeTask);
  const uncompleteTask = useStore((s) => s.uncompleteTask);
  const patchTask = useStore((s) => s.patchTask);
  const motion = useStore((s) => s.ui.motion);
  const [detail, setDetail] = useState<Task | null>(null);
  const tap = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const multi = useStore((s) => s.holes.filter((h) => h.status === 'active').length > 1);

  if (!hole)
    return (
      <div className={motion === 'reduced' ? 'reduce-motion' : ''}>
        <Background />
        <div className="mobile">
          <div className="row between small">
            <span>Rabbit Hole</span>
            <span className="muted">{prettyDate(isoDate())}</span>
          </div>
          <div className="stack lg center" style={{ marginTop: '20vh' }}>
            <h1 className="display sm">No hole yet.</h1>
            <p className="grey small">Start a rabbit hole in the full app — today’s checklist will show up here.</p>
            <Link to="/" className="btn primary" style={{ alignSelf: 'center' }}>
              Open the full app
            </Link>
          </div>
        </div>
      </div>
    );

  const raw = todayIndex(hole);
  const ti = clamp(raw, 0, 6);
  const day = hole.days[ti];
  const p = dayProgress(day);
  const open = day.tasks.filter((t) => !t.done && !t.skipped);
  const finished = day.tasks.filter((t) => t.done || t.skipped);
  const left = open.filter((t) => !t.optional).reduce((s, t) => s + t.minutes, 0);

  return (
    <div className={motion === 'reduced' ? 'reduce-motion' : ''}>
      <Background />
      <div className="mobile">
        <div className="row between small">
          <span className="row" style={{ gap: 8 }}>
            <span className="brand-mark" style={{ width: 18, height: 18 }} /> Rabbit Hole
          </span>
          <span className="row" style={{ gap: 10 }}>
            <SyncDot />
            <Link to="/" className="btn icon sm ghost" aria-label="Open full app">
              <Icon icon={Maximize01Icon} size={16} />
            </Link>
          </span>
        </div>

        <HoleSwitcher compact />

        <div
          className="stack"
          style={{ gap: 4, touchAction: 'pan-y' }}
          // Swipe the title left/right to flip between your holes.
          onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const s0 = swipe.current;
            swipe.current = null;
            if (!s0) return;
            const dx = e.changedTouches[0].clientX - s0.x;
            const dy = e.changedTouches[0].clientY - s0.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cycleHole(dx < 0 ? 1 : -1);
          }}
        >
          <span className="eyebrow">
            {raw < 0 ? `Starts ${prettyDate(hole.startDate)}` : raw > 6 ? 'Week complete — wrap up in the full app' : `Day ${ti + 1} of 7 · ${prettyDate(day.date)}`}
          </span>
          <h1 className="h1" style={{ background: 'linear-gradient(90deg,#fff,#FF6D29)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            {hole.title}
          </h1>
          <span className="small grey">{day.theme}</span>
        </div>

        <div className="card tight row" style={{ gap: 14 }}>
          <Ring value={p.ratio} size={52} stroke={4}>
            <span className="small">{Math.round(p.ratio * 100)}%</span>
          </Ring>
          <div className="stack" style={{ gap: 0 }}>
            <span>
              {p.done} of {p.total} done
            </span>
            <span className="tiny muted">{left ? `${fmtMinutes(left)} left today` : day.tasks.length ? 'All done for today ✦' : 'Rest day'}</span>
          </div>
        </div>

        {open.length > 0 && (
          <div className="tiny faint">Swipe a task left to finish · tap for details{multi ? ' · swipe the title to switch holes' : ''}</div>
        )}
        <div className="stack" style={{ gap: 10 }}>
          {open.map((t) => (
            <div
              key={t.id}
              // The swipe row captures the pointer while dragging, so detect a plain tap here (works for mouse and touch).
              onPointerDownCapture={(e) => (tap.current = { x: e.clientX, y: e.clientY, t: Date.now() })}
              onPointerUpCapture={(e) => {
                const d = tap.current;
                // Touch taps already produce a click on the button; this path is for mouse/pen.
                if (e.pointerType !== 'touch' && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && Date.now() - d.t < 500) setDetail(t);
                tap.current = null;
              }}
            >
            <SwipeRow
              label={t.title}
              height={68}
              radius={18}
              rowColor="rgba(36, 26, 22, 0.92)"
              drawerColor="#453027"
              actionColor="#FF6D29"
              textColor="#ffffff"
              actions={[
                { id: 'done', label: 'Done', icon: <Icon icon={Tick02Icon} size={20} stroke={2} /> },
                { id: 'skip', label: 'Skip', color: '#5a4034', dismiss: true },
              ]}
              onCommit={(a) => {
                if (a.id === 'done') {
                  completeTask(hole.id, t.id, {});
                  toast('Nice. ✦');
                } else patchTask(hole.id, t.id, { skipped: true });
              }}
            >
              <button
                aria-label={`Details for ${t.title}`}
                onClick={() => setDetail(t)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDetail(t)}
                style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 12, width: '100%', height: '100%', padding: '0 16px', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                <span className="swatch" style={{ width: 10, height: 10, background: t.optional ? '#BABABA' : '#FF6D29', boxShadow: 'none' }} />
                <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}>
                  {t.title}
                </span>
                <span className="small muted">{t.minutes}m</span>
              </button>
            </SwipeRow>
            </div>
          ))}
        </div>

        {finished.length > 0 && (
          <div className="stack" style={{ gap: 2 }}>
            <div className="tiny faint">Finished</div>
            {finished.map((t) => (
              <SpringCheck
                key={t.id}
                checked={t.done}
                onChange={(v) => {
                  if (!v) {
                    if (t.skipped) patchTask(hole.id, t.id, { skipped: false });
                    else uncompleteTask(hole.id, t.id);
                  }
                }}
                label={t.skipped ? `${t.title} (skipped)` : t.title}
                fillColor="#FF6D29"
                checkColor="#161316"
                boxSize={20}
                boxRadius={6}
                fontSize={14}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="stack lg">
            <div className="stack" style={{ gap: 4 }}>
              <span className="tag orange" style={{ alignSelf: 'flex-start' }}>
                {detail.minutes} min
              </span>
              <div className="h2">{detail.title}</div>
            </div>
            {detail.description && <div>{detail.description}</div>}
            {detail.why && <div className="small muted">{detail.why}</div>}
            {detail.resource && (
              <div className="row wrap small" style={{ gap: 8 }}>
                <span className="grey">{detail.resource.title}</span>
                {resourceLinks(detail.resource).map((l) => (
                  <a key={l.label} className="link" href={l.href} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                ))}
              </div>
            )}
            {detail.checkpoint && (
              <div className="checkpoint small">
                <div className="tiny faint">Checkpoint</div>
                {detail.checkpoint}
              </div>
            )}
            <button
              className="btn primary lg"
              onClick={() => {
                completeTask(hole.id, detail.id, {});
                setDetail(null);
                toast('Nice. ✦');
              }}
            >
              Mark done
            </button>
          </div>
        )}
      </Modal>
      <Toasts />
    </div>
  );
}
