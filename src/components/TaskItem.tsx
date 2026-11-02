import { useEffect, useRef, useState } from 'react';
import { ArrowDown01Icon, Delete02Icon, PlayIcon, PauseIcon, Link01Icon } from '@hugeicons/core-free-icons';
import SpringCheck from '../bits/SpringCheck';
import { Icon, toast } from './ui';
import { useStore } from '../lib/store';
import { KIND_META } from '../lib/planner';
import { resourceLinks } from '../lib/extras';
import type { Task, Understanding } from '../lib/types';

const U_LABELS: { v: Understanding; label: string; hint: string }[] = [
  { v: 1, label: 'Fuzzy', hint: 'adds a revisit tomorrow' },
  { v: 2, label: 'Getting it', hint: '' },
  { v: 3, label: 'Clicked', hint: '' },
];

export function TaskItem({ holeId, task, compact = false, defaultOpen = false }: { holeId: string; task: Task; compact?: boolean; defaultOpen?: boolean }) {
  const completeTask = useStore((s) => s.completeTask);
  const uncompleteTask = useStore((s) => s.uncompleteTask);
  const patchTask = useStore((s) => s.patchTask);
  const removeTask = useStore((s) => s.removeTask);
  const [open, setOpen] = useState(defaultOpen);
  const [justDone, setJustDone] = useState(false);
  const [note, setNote] = useState(task.note ?? '');

  useEffect(() => setNote(task.note ?? ''), [task.note]);

  const onCheck = (v: boolean) => {
    if (v) {
      completeTask(holeId, task.id, {});
      setJustDone(true);
      setOpen(true);
    } else {
      uncompleteTask(holeId, task.id);
      setJustDone(false);
    }
  };

  const rate = (u: Understanding) => {
    completeTask(holeId, task.id, { understanding: u, note: note || task.note, spentMinutes: task.spentMinutes });
    if (u === 1) toast('No stress — a 10-minute revisit is waiting tomorrow.');
    else if (u === 3) toast('Nice. That one’s yours now.');
    setJustDone(false);
  };

  return (
    <div className={`task${task.done ? ' done' : ''}`}>
      <div className="task-head">
        <SpringCheck
          checked={task.done}
          onChange={onCheck}
          label={<span className="task-title">{task.title}</span>}
          ariaLabel={task.title}
          boxSize={22}
          boxRadius={7}
          fontSize={15}
          fillColor="#FF6D29"
          checkColor="#161316"
          className="grow"
        />
        <div className="row" style={{ gap: 6, flex: 'none' }}>
          {!compact && <span className="kind hide-sm">{KIND_META[task.kind].label}</span>}
          {task.optional && <span className="tag">bonus</span>}
          <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {task.minutes}m
          </span>
          <button className="btn icon sm ghost" aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen((o) => !o)}>
            <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <Icon icon={ArrowDown01Icon} size={16} />
            </span>
          </button>
        </div>
      </div>
      {open && (
        <div className="task-body fade-in">
          {task.description && <div>{task.description}</div>}
          {task.why && (
            <div className="small muted">
              <span className="orange">Why · </span>
              {task.why}
            </div>
          )}
          {task.resource && (
            <div className="row wrap small" style={{ gap: 6 }}>
              <Icon icon={Link01Icon} size={14} />
              <span className="grey">{task.resource.title}</span>
              {resourceLinks(task.resource).map((l) => (
                <a key={l.label} className="link" href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
            </div>
          )}
          {task.checkpoint && (
            <div className="checkpoint small">
              <div className="tiny faint">Checkpoint — can you answer this?</div>
              {task.checkpoint}
            </div>
          )}
          {!task.done && <FocusTimer holeId={holeId} task={task} />}
          {(task.done || justDone) && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="small muted">How well did it click?</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {U_LABELS.map((u) => (
                  <button key={u.v} className={`chip${task.understanding === u.v ? ' on' : ''}`} onClick={() => rate(u.v)} title={u.hint}>
                    {u.label}
                  </button>
                ))}
              </div>
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                placeholder="Answer the checkpoint in a sentence or two — or jot what you learned."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (task.note ?? '') && patchTask(holeId, task.id, { note })}
              />
            </div>
          )}
          {!compact && (
            <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              {!task.done && (
                <button className="btn sm ghost" onClick={() => patchTask(holeId, task.id, { skipped: !task.skipped })}>
                  {task.skipped ? 'Unskip' : 'Skip'}
                </button>
              )}
              <button
                className="btn sm ghost danger"
                onClick={() => {
                  if (confirm('Remove this task?')) removeTask(holeId, task.id);
                }}
              >
                <Icon icon={Delete02Icon} size={14} /> Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch {
    /* audio unavailable */
  }
}

function FocusTimer({ holeId, task }: { holeId: string; task: Task }) {
  const patchTask = useStore((s) => s.patchTask);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(task.minutes * 60);
  const started = useRef<number>(0);
  const spentBase = useRef(task.spentMinutes ?? 0);

  useEffect(() => {
    if (!running) return;
    started.current = Date.now();
    const startLeft = left;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started.current) / 1000);
      const l = Math.max(0, startLeft - elapsed);
      setLeft(l);
      if (l === 0) {
        setRunning(false);
        toast(`Time’s up for “${task.title}”. Wrap up and check it off when ready.`);
        chime();
      }
    }, 500);
    return () => {
      clearInterval(id);
      const mins = Math.round((Date.now() - started.current) / 60000);
      if (mins > 0) {
        spentBase.current += mins;
        patchTask(holeId, task.id, { spentMinutes: spentBase.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn sm" onClick={() => setRunning((r) => !r)}>
        <Icon icon={running ? PauseIcon : PlayIcon} size={14} />
        {running ? 'Pause' : left < task.minutes * 60 ? 'Resume' : 'Focus timer'}
      </button>
      {(running || left < task.minutes * 60) && (
        <span className="timer">
          {mm}:{ss}
        </span>
      )}
      {(task.spentMinutes ?? 0) > 0 && <span className="tiny faint">{task.spentMinutes} min logged</span>}
    </div>
  );
}
