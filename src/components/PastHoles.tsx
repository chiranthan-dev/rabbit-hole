import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive01Icon } from '@hugeicons/core-free-icons';
import { Bar, Icon, Modal, toast } from './ui';
import { canStartHole, MAX_ACTIVE, useStore } from '../lib/store';
import { holeProgress } from '../lib/planner';
import { domainEmoji } from '../lib/catalog';
import { prettyDate } from '../lib/util';
import type { Hole } from '../lib/types';

/** Shelved holes first (you can pick them back up), then finished ones, newest first. */
export const usePastHoles = () => {
  const holes = useStore((s) => s.holes);
  const past = holes.filter((h) => h.status !== 'active');
  const newest = (a: Hole, b: Hole) => (b.final?.completedAt ?? b.createdAt).localeCompare(a.final?.completedAt ?? a.createdAt);
  return [...past.filter((h) => h.status === 'abandoned').sort(newest), ...past.filter((h) => h.status === 'completed').sort(newest)];
};

/** List of shelved + finished holes with Resume / Open. */
export function PastHolesList({ onNavigate, limit }: { onNavigate?: () => void; limit?: number }) {
  const past = usePastHoles();
  const holes = useStore((s) => s.holes);
  const resumeHole = useStore((s) => s.resumeHole);
  const nav = useNavigate();
  const room = canStartHole(holes);
  const shown = limit ? past.slice(0, limit) : past;

  if (!past.length) return <div className="small muted">No shelved or finished holes yet.</div>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {!room && past.some((h) => h.status === 'abandoned') && (
        <div className="tiny" style={{ color: '#ffc069' }}>
          You’re in {MAX_ACTIVE} holes, the most at once. Finish or shelve one to resume another.
        </div>
      )}
      {shown.map((h) => {
        const p = holeProgress(h);
        const shelved = h.status === 'abandoned';
        return (
          <div key={h.id} className="card tight stack" style={{ gap: 8 }}>
            <div className="row between top" style={{ gap: 10 }}>
              <div className="row top grow" style={{ gap: 10 }}>
                <span style={{ fontSize: 18, lineHeight: '22px' }}>{domainEmoji(h.domain)}</span>
                <div className="stack grow" style={{ gap: 2 }}>
                  <span className="h3">{h.title}</span>
                  <span className="tiny muted">
                    {shelved ? 'Shelved' : `Finished${h.final ? ` · ${'★'.repeat(h.final.rating)}` : ''}`} · started {prettyDate(h.startDate)} · {p.done}/{p.total} tasks
                  </span>
                </div>
              </div>
              <span className={`tag${shelved ? ' warn' : ' good'}`}>{shelved ? 'shelved' : 'done'}</span>
            </div>
            <Bar value={p.ratio} />
            <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <button
                className="btn sm ghost"
                onClick={() => {
                  onNavigate?.();
                  nav(`/hole/${h.id}${shelved ? '' : '?tab=finish'}`);
                }}
              >
                {shelved ? 'Open' : 'Open recap'}
              </button>
              {shelved && (
                <button
                  className="btn sm primary"
                  disabled={!room}
                  title={room ? 'Pick up where you left off' : `You’re already in ${MAX_ACTIVE} holes`}
                  onClick={() => {
                    if (!resumeHole(h.id)) return toast(`You’re already in ${MAX_ACTIVE} holes — shelve or finish one first.`);
                    toast(`Back in “${h.title}”. Unfinished days now start today.`);
                    onNavigate?.();
                  }}
                >
                  Resume
                </button>
              )}
            </div>
          </div>
        );
      })}
      {limit && past.length > limit && (
        <Link to="/history" className="small link" style={{ alignSelf: 'flex-start' }} onClick={onNavigate}>
          See all {past.length} in the Journal
        </Link>
      )}
    </div>
  );
}

/** Small button that opens the past holes in a sheet. Hidden when there are none. */
export function PastHolesButton({ label = 'Past holes' }: { label?: string }) {
  const past = usePastHoles();
  const [open, setOpen] = useState(false);
  if (!past.length) return null;
  const shelved = past.filter((h) => h.status === 'abandoned').length;
  return (
    <>
      <button className="past-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon icon={Archive01Icon} size={13} />
        {label} · {past.length}
        {shelved > 0 && <span className="past-dot" title={`${shelved} shelved`} />}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="stack lg">
          <div className="row between">
            <div className="stack" style={{ gap: 2 }}>
              <div className="h2">Your past holes</div>
              <div className="small muted">Resume a shelved one, or open any of them to see your notes and recap.</div>
            </div>
            <button className="btn sm ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <PastHolesList onNavigate={() => setOpen(false)} />
        </div>
      </Modal>
    </>
  );
}
