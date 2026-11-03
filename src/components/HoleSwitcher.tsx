import type React from 'react';
import { Link } from 'react-router-dom';
import { Add01Icon } from '@hugeicons/core-free-icons';
import { Icon, Ring } from './ui';
import { PastHolesButton } from './PastHoles';
import { MAX_ACTIVE, useActiveHole, useActiveHoles, useStore } from '../lib/store';
import { dayProgress, todayIndex } from '../lib/planner';
import { domainEmoji } from '../lib/catalog';
import { clamp, fmtMinutes } from '../lib/util';
import type { Hole } from '../lib/types';

/** Today's state for one hole: progress ring value + minutes still to do. */
export function todayFor(h: Hole) {
  const raw = todayIndex(h);
  const day = h.days[clamp(raw, 0, 6)];
  const p = dayProgress(day);
  const left = day.tasks.filter((t) => !t.done && !t.skipped && !t.optional).reduce((s, t) => s + t.minutes, 0);
  return { raw, day, p, left };
}

/** Move focus to the next/previous active hole (used by swipe gestures). */
export function cycleHole(dir: 1 | -1) {
  const s = useStore.getState();
  const holes = s.holes.filter((h) => h.status === 'active');
  if (holes.length < 2) return;
  const i = Math.max(0, holes.findIndex((h) => h.id === s.activeHoleId));
  s.setActive(holes[(i + dir + holes.length) % holes.length].id);
}

/**
 * Switch between the rabbit holes you're in (up to MAX_ACTIVE).
 * Shown on Today (laptop) and the phone checklist.
 */
export function HoleSwitcher({ compact = false, newHref = '/new' }: { compact?: boolean; newHref?: string }) {
  const holes = useActiveHoles();
  const current = useActiveHole();
  const setActive = useStore((s) => s.setActive);
  if (!holes.length) return null;
  const totalLeft = holes.reduce((s, h) => s + todayFor(h).left, 0);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between tiny muted" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          <span>
            Your holes · {holes.length}/{MAX_ACTIVE}
          </span>
          <PastHolesButton label="Past" />
        </span>
        {holes.length > 1 && <span>{totalLeft ? `${fmtMinutes(totalLeft)} left today across all` : 'All done today ✦'}</span>}
      </div>
      <div
        className={`switcher${compact ? ' compact' : ''}`}
        role="tablist"
        aria-label="Your rabbit holes"
        style={{ '--n': holes.length } as React.CSSProperties}
      >
        {holes.map((h) => {
          const t = todayFor(h);
          const on = h.id === current?.id;
          return (
            <button key={h.id} role="tab" aria-selected={on} className={`switch-pill${on ? ' on' : ''}`} onClick={() => setActive(h.id)} title={h.title}>
              <Ring value={t.p.ratio} size={compact ? 26 : 30} stroke={3}>
                <span style={{ fontSize: compact ? 11 : 12 }}>{domainEmoji(h.domain)}</span>
              </Ring>
              <span className="stack" style={{ gap: 0, minWidth: 0, textAlign: 'left' }}>
                <span className="switch-title">{h.title}</span>
                <span className="tiny muted">
                  {!compact && <>{t.raw < 0 ? 'starts soon' : t.raw > 6 ? 'wrap up' : `Day ${t.raw + 1}`} · </>}
                  {t.left ? `${t.left}m left` : t.day.tasks.length ? 'done ✦' : 'rest'}
                </span>
              </span>
            </button>
          );
        })}
        {holes.length < MAX_ACTIVE && (
          <Link to={newHref} className="switch-pill new" aria-label="Start another rabbit hole">
            <Icon icon={Add01Icon} size={16} />
            {!compact && <span className="small">New hole</span>}
          </Link>
        )}
      </div>
    </div>
  );
}
