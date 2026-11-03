import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Add01Icon,
  ArrowRight01Icon,
  Download01Icon,
  Refresh01Icon,
  SparklesIcon,
  Tick02Icon,
  Cancel01Icon,
  Clock01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons';
import { Bar, Icon, Modal, Range, Tabs, toast } from '../components/ui';
import { TaskItem } from '../components/TaskItem';
import { DepthMeter } from '../components/Widgets';
import { MAX_ACTIVE, useStore } from '../lib/store';
import { dayProgress, holeProgress, KIND_META, rebalance, rebudget, TASK_KINDS, todayIndex } from '../lib/planner';
import { domainEmoji, domainLabel } from '../lib/catalog';
import { holeMarkdown, offlineQuiz, resourceLinks } from '../lib/extras';
import { aiEnabled, isManual } from '../lib/ai/providers';
import { explainPrompt, questionPrompt, recapPrompt } from '../lib/manual';
import { ClaudeHandoff } from '../components/ClaudeHandoff';
import { answerQuestion, explainFeedback, makeQuiz, planDay, weekRecap } from '../lib/ai/generate';
import type { Concept, Hole, QuizAttempt, TaskKind } from '../lib/types';
import { clamp, downloadText, fmtMinutes, prettyDate, slug, uid, weekdayShort } from '../lib/util';
import HoldButton from '../bits/HoldButton';
import ThoughtLine from '../bits/ThoughtLine';
import CountUp from '../bits/CountUp';

type Tab = 'week' | 'brief' | 'questions' | 'practice' | 'journal' | 'finish';

export default function HolePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const hole = useStore((s) => s.holes.find((h) => h.id === id));
  const nav = useNavigate();
  const abandonHole = useStore((s) => s.abandonHole);
  const deleteHole = useStore((s) => s.deleteHole);
  const updateHole = useStore((s) => s.updateHole);
  const setActive = useStore((s) => s.setActive);
  const tab = (params.get('tab') as Tab) || 'week';
  const isActive = hole?.status === 'active';
  useEffect(() => {
    if (isActive && useStore.getState().activeHoleId !== id) setActive(id);
  }, [id, isActive, setActive]);
  if (!hole) return <div className="empty">That rabbit hole doesn’t exist (any more).</div>;
  const hp = holeProgress(hole);
  const ti = clamp(todayIndex(hole), 0, 6);

  const resume = () => {
    if (!useStore.getState().resumeHole(hole.id)) {
      toast(`You’re already in ${MAX_ACTIVE} rabbit holes — shelve or finish one first.`);
      return;
    }
    toast('Back in the hole.');
  };

  return (
    <div className="stack xl">
      <section className="split" style={{ alignItems: 'end' }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag orange">
              {domainEmoji(hole.domain)} {domainLabel(hole.domain)}
            </span>
            <span className={`tag${hole.status === 'completed' ? ' good' : hole.status === 'abandoned' ? ' warn' : ''}`}>{hole.status === 'abandoned' ? 'shelved' : hole.status}</span>
            <span className="tag">{hole.depth}</span>
            <span className="tag">{hole.source === 'ai' ? hole.model : 'offline plan'}</span>
          </div>
          <h1 className="display sm">{hole.title}</h1>
          {hole.tagline && <div className="grey">{hole.tagline}</div>}
          <div className="small muted">
            {prettyDate(hole.startDate)} → {prettyDate(hole.days[6].date)} · {hp.done}/{hp.total} tasks · {fmtMinutes(hp.minutes)}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => downloadText(`${slug(hole.title)}.md`, holeMarkdown(hole), 'text/markdown')}>
              <Icon icon={Download01Icon} size={14} /> Export notes
            </button>
            {hole.status === 'abandoned' && (
              <button className="btn sm primary" onClick={resume}>
                Resume this hole
              </button>
            )}
            {hole.status === 'active' && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  if (confirm('Shelve this rabbit hole? You can resume it later from the Journal.')) {
                    abandonHole(hole.id);
                    nav('/');
                  }
                }}
              >
                Shelve
              </button>
            )}
            <button
              className="btn sm ghost danger"
              onClick={() => {
                if (confirm('Delete this rabbit hole and all its notes permanently?')) {
                  deleteHole(hole.id);
                  nav('/history');
                }
              }}
            >
              <Icon icon={Delete02Icon} size={14} /> Delete
            </button>
          </div>
        </div>
        <div className="hide-sm" style={{ maxWidth: 200, justifySelf: 'end', width: '100%' }}>
          <DepthMeter days={hole.days} current={hole.status === 'completed' ? 6 : ti} label={hole.status === 'completed' ? 'all the way down' : undefined} />
        </div>
      </section>

      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[
          { id: 'week', label: 'Week' },
          { id: 'brief', label: 'Brief' },
          { id: 'questions', label: `Questions${hole.questions.length ? ` · ${hole.questions.length}` : ''}` },
          { id: 'practice', label: 'Practice' },
          { id: 'journal', label: 'Journal' },
          { id: 'finish', label: hole.status === 'completed' ? 'Recap' : 'Wrap up' },
        ]}
      />

      {tab === 'week' && <WeekTab hole={hole} onUpdate={(fn) => updateHole(hole.id, fn)} />}
      {tab === 'brief' && <BriefTab hole={hole} />}
      {tab === 'questions' && <QuestionsTab hole={hole} />}
      {tab === 'practice' && <PracticeTab hole={hole} />}
      {tab === 'journal' && <JournalTab hole={hole} />}
      {tab === 'finish' && <FinishTab hole={hole} />}
    </div>
  );
}

// ---------------------------------------------------------------- Week

function WeekTab({ hole, onUpdate }: { hole: Hole; onUpdate: (fn: (h: Hole) => Hole) => void }) {
  const ai = useStore((s) => s.ai);
  const addTask = useStore((s) => s.addTask);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [addFor, setAddFor] = useState<number | null>(null);
  const [replanning, setReplanning] = useState<number | null>(null);
  const ti = clamp(todayIndex(hole), 0, 6);

  const replan = async (i: number) => {
    setReplanning(i);
    try {
      const d = hole.days[i];
      const done = d.tasks.filter((t) => t.done);
      const left = Math.max(5, d.budget - done.reduce((s, t) => s + t.minutes, 0));
      const tasks = await planDay(ai, {
        topic: hole.title,
        brief: hole.brief,
        dayIndex: i,
        budget: left,
        depth: hole.depth,
        style: hole.style,
        earlier: hole.days.filter((x) => x.index !== i).flatMap((x) => x.tasks.map((t) => t.title)),
      });
      onUpdate((h) => ({ ...h, days: h.days.map((x) => (x.index === i ? { ...x, tasks: [...done, ...tasks] } : x)) }));
      toast(`Day ${i + 1} replanned.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setReplanning(null);
    }
  };

  return (
    <div className="stack lg">
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm" onClick={() => setBudgetOpen(true)}>
          <Icon icon={Clock01Icon} size={14} /> Change my time
        </button>
        <button
          className="btn sm"
          onClick={() => {
            const r = rebalance(hole);
            onUpdate(() => r.hole);
            toast(r.moved || r.trimmed ? `Moved ${r.moved} unfinished task(s) forward.` : 'Nothing to rebalance — you’re on track.');
          }}
        >
          <Icon icon={Refresh01Icon} size={14} /> Rebalance unfinished
        </button>
      </div>
      {hole.days.map((d) => {
        const p = dayProgress(d);
        return (
          <div key={d.index} className={`card stack${d.index === ti && hole.status === 'active' ? ' hot' : ''}`}>
            <div className="row between top wrap">
              <div className="stack" style={{ gap: 2 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="tag orange">Day {d.index + 1}</span>
                  <span className="small muted">
                    {weekdayShort(d.date)} · {d.budget ? fmtMinutes(d.budget) : 'rest day'}
                  </span>
                </div>
                <div className="h2">{d.theme}</div>
                <div className="small muted">{d.goal}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {aiEnabled(ai) && d.budget > 0 && (
                  <button className="btn sm ghost" disabled={replanning !== null} onClick={() => replan(d.index)} title="Ask the AI for a fresh set of tasks for this day">
                    <Icon icon={SparklesIcon} size={14} /> {replanning === d.index ? 'Replanning…' : 'Replan'}
                  </button>
                )}
                <button className="btn sm ghost" onClick={() => setAddFor(d.index)}>
                  <Icon icon={Add01Icon} size={14} /> Task
                </button>
              </div>
            </div>
            {d.tasks.length > 0 && <Bar value={p.ratio} />}
            <div className="stack" style={{ gap: 8 }}>
              {d.tasks.map((t) => (
                <TaskItem key={t.id} holeId={hole.id} task={t} />
              ))}
            </div>
          </div>
        );
      })}
      <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} hole={hole} from={ti} onSave={(b) => onUpdate((h) => rebudget(h, b, ti))} />
      <AddTaskModal
        open={addFor !== null}
        onClose={() => setAddFor(null)}
        onAdd={(title, minutes, kind) => {
          if (addFor === null) return;
          addTask(hole.id, addFor, { id: uid('t_'), title, minutes, kind, description: '', why: '', checkpoint: '', done: false });
          setAddFor(null);
        }}
      />
    </div>
  );
}

function BudgetModal({ open, onClose, hole, from, onSave }: { open: boolean; onClose: () => void; hole: Hole; from: number; onSave: (b: number[]) => void }) {
  const [b, setB] = useState(hole.days.map((d) => d.budget));
  return (
    <Modal open={open} onClose={onClose}>
      <div className="stack lg">
        <div className="stack" style={{ gap: 4 }}>
          <div className="h2">Change my time</div>
          <div className="small muted">Life happens. Adjust the days ahead and unfinished tasks are resized to fit (extras become bonus).</div>
        </div>
        {hole.days.map((d, i) => (
          <div key={i} className="row" style={{ gap: 12, opacity: i < from ? 0.4 : 1 }}>
            <span className="small" style={{ width: 70 }}>
              {weekdayShort(d.date)}
            </span>
            <Range value={b[i]} min={0} max={240} step={5} onChange={(v) => i >= from && setB((x) => x.map((y, j) => (j === i ? v : y)))} />
            <span className="small" style={{ width: 60, textAlign: 'right' }}>
              {b[i] ? fmtMinutes(b[i]) : 'rest'}
            </span>
          </div>
        ))}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onSave(b);
              onClose();
              toast('Week resized.');
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddTaskModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (title: string, minutes: number, kind: TaskKind) => void }) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [kind, setKind] = useState<TaskKind>('explore');
  return (
    <Modal open={open} onClose={onClose}>
      <div className="stack lg">
        <div className="h2">Add your own task</div>
        <input className="input" autoFocus placeholder="What do you want to do?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="row wrap" style={{ gap: 6 }}>
          {TASK_KINDS.filter((k) => k !== 'revisit').map((k) => (
            <button key={k} className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
              {KIND_META[k].label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Range value={minutes} min={5} max={120} step={5} onChange={setMinutes} />
          <span className="small" style={{ width: 60, textAlign: 'right' }}>
            {minutes} min
          </span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!title.trim()}
            onClick={() => {
              onAdd(title.trim(), minutes, kind);
              setTitle('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Brief

const STATUS_NEXT: Record<Concept['status'], Concept['status']> = { new: 'fuzzy', fuzzy: 'clear', clear: 'new' };

function BriefTab({ hole }: { hole: Hole }) {
  const setConcept = useStore((s) => s.setConcept);
  const toggleSaved = useStore((s) => s.toggleSaved);
  const b = hole.brief;
  const clear = b.concepts.filter((c) => c.status === 'clear').length;
  return (
    <div className="split">
      <div className="stack lg">
        <div className="card stack">
          <div className="h2">The big picture</div>
          <p style={{ margin: 0 }}>{b.summary}</p>
          {b.whyFascinating && <p className="grey" style={{ margin: 0 }}>✦ {b.whyFascinating}</p>}
          {hole.angle && (
            <div className="checkpoint small">
              <div className="tiny faint">Your angle</div>
              {hole.angle}
            </div>
          )}
        </div>
        <div className="card stack">
          <div className="row between">
            <div className="h2">Key ideas</div>
            <span className="small muted">
              {clear}/{b.concepts.length} clear
            </span>
          </div>
          <div className="small muted">Tap the status as your understanding grows: new → fuzzy → clear.</div>
          {b.concepts.map((c) => (
            <div key={c.id} className="row top" style={{ gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <button
                className={`tag${c.status === 'clear' ? ' good' : c.status === 'fuzzy' ? ' warn' : ''}`}
                style={{ border: 0, cursor: 'pointer', flex: 'none', minWidth: 54, justifyContent: 'center' }}
                onClick={() => setConcept(hole.id, c.id, { status: STATUS_NEXT[c.status] })}
              >
                {c.status}
              </button>
              <div className="stack grow" style={{ gap: 2 }}>
                <span className="h3">{c.term}</span>
                {c.explanation && <span className="small grey">{c.explanation}</span>}
              </div>
            </div>
          ))}
        </div>
        {b.misconceptions.length > 0 && (
          <div className="card stack">
            <div className="h2">Common misconceptions</div>
            {b.misconceptions.map((m, i) => (
              <div key={i} className="small grey">
                ✕ {m}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="stack lg">
        <div className="card stack">
          <div className="h3">Guiding questions</div>
          {b.guidingQuestions.map((q, i) => (
            <div key={i} className="small">
              <span className="orange">{i + 1}.</span> {q}
            </div>
          ))}
        </div>
        <div className="card stack">
          <div className="h3">Resources</div>
          <div className="tiny faint">Links are searches — we never trust a model to invent URLs.</div>
          {b.resources.map((r, i) => (
            <div key={i} className="stack" style={{ gap: 2 }}>
              <span className="small">
                {r.title} {r.type && <span className="tag">{r.type}</span>}
              </span>
              <span className="row wrap tiny" style={{ gap: 8 }}>
                {resourceLinks(r).map((l) => (
                  <a key={l.label} className="link" href={l.href} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                ))}
              </span>
            </div>
          ))}
        </div>
        {b.rabbitTrails.length > 0 && (
          <div className="card stack">
            <div className="h3">Side tunnels for later</div>
            {b.rabbitTrails.map((t, i) => (
              <div key={i} className="row between small">
                <span>{t}</span>
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    toggleSaved({ id: `trail-${slug(t)}`, title: t, hook: `A side tunnel from “${hole.title}”.`, domain: hole.domain, tags: hole.tags, concepts: [], questions: [], starters: [t] });
                    toast('Saved to Discover → Saved for later.');
                  }}
                >
                  Save
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Questions

function QuestionsTab({ hole }: { hole: Hole }) {
  const ai = useStore((s) => s.ai);
  const addQuestion = useStore((s) => s.addQuestion);
  const patchQuestion = useStore((s) => s.patchQuestion);
  const removeQuestion = useStore((s) => s.removeQuestion);
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [claudeFor, setClaudeFor] = useState<string | null>(null);
  const ti = clamp(todayIndex(hole), 0, 6);

  const ask = async (qid: string, q: string) => {
    setBusy(qid);
    try {
      const r = await answerQuestion(ai, hole, q);
      patchQuestion(hole.id, qid, { answer: `${r.answer}${r.digDeeper?.length ? `\n\nDig deeper: ${r.digDeeper.join(' · ')}` : ''}` });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack lg">
      <div className="card stack">
        <div className="h3">Curiosity log</div>
        <div className="small muted">Questions are the most valuable thing a rabbit hole produces. Unresolved ones become suggestions for future weeks.</div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input pillish"
            value={text}
            placeholder="I wonder…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                addQuestion(hole.id, text.trim(), ti);
                setText('');
              }
            }}
          />
          <button
            className="btn icon"
            aria-label="Add question"
            onClick={() => {
              if (text.trim()) {
                addQuestion(hole.id, text.trim(), ti);
                setText('');
              }
            }}
          >
            <Icon icon={Add01Icon} size={18} />
          </button>
        </div>
      </div>
      {hole.questions.length === 0 && <div className="empty small">No questions yet. They’ll come.</div>}
      {[...hole.questions].reverse().map((q) => (
        <div key={q.id} className="card stack" style={{ opacity: q.resolved ? 0.6 : 1 }}>
          <div className="row between top">
            <div className="stack" style={{ gap: 2 }}>
              <span className="h3">{q.text}</span>
              <span className="tiny faint">Day {q.dayIndex + 1}</span>
            </div>
            <button className="btn icon sm ghost" aria-label="Delete question" onClick={() => removeQuestion(hole.id, q.id)}>
              <Icon icon={Cancel01Icon} size={14} />
            </button>
          </div>
          {busy === q.id && <ThoughtLine label="Thinking" working color="#ffd9c7" glyphColor="#FF6D29" />}
          {q.answer && <div className="small grey" style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</div>}
          <div className="row wrap" style={{ gap: 6 }}>
            {aiEnabled(ai) && (
              <button className="btn sm" disabled={busy !== null} onClick={() => ask(q.id, q.text)}>
                <Icon icon={SparklesIcon} size={14} /> {q.answer ? 'Ask again' : 'Ask the AI'}
              </button>
            )}
            {isManual(ai) && (
              <button className="btn sm" onClick={() => setClaudeFor(claudeFor === q.id ? null : q.id)}>
                <Icon icon={SparklesIcon} size={14} /> {q.answer ? 'Ask Claude again' : 'Ask Claude'}
              </button>
            )}
            <button className="btn sm" onClick={() => patchQuestion(hole.id, q.id, { resolved: !q.resolved })}>
              <Icon icon={Tick02Icon} size={14} /> {q.resolved ? 'Reopen' : 'Answered it myself'}
            </button>
            <button className="btn sm ghost" onClick={() => nav('/new', { state: { custom: q.text } })}>
              Make it a rabbit hole <Icon icon={ArrowRight01Icon} size={14} />
            </button>
          </div>
          {claudeFor === q.id && (
            <div className="card flat fade-in">
              <ClaudeHandoff
                compact
                steps={false}
                prompt={questionPrompt(hole, q.text)}
                submitLabel="Save answer"
                pastePlaceholder="Optional: paste Claude’s answer here to keep it with your notes."
                onSubmit={(text) => {
                  patchQuestion(hole.id, q.id, { answer: text.trim() });
                  setClaudeFor(null);
                  toast('Answer saved.');
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Practice

function PracticeTab({ hole }: { hole: Hole }) {
  const [mode, setMode] = useState<'quiz' | 'explain'>('quiz');
  return (
    <div className="stack lg">
      <Tabs
        value={mode}
        onChange={setMode}
        options={[
          { id: 'quiz', label: 'Quiz yourself' },
          { id: 'explain', label: 'Explain it (Feynman)' },
        ]}
      />
      {mode === 'quiz' ? <Quiz hole={hole} /> : <Explain hole={hole} />}
    </div>
  );
}

function Quiz({ hole }: { hole: Hole }) {
  const ai = useStore((s) => s.ai);
  const addQuiz = useStore((s) => s.addQuiz);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const ti = clamp(todayIndex(hole), 0, 6);

  const start = async () => {
    setLoading(true);
    try {
      let questions = aiEnabled(ai) ? await makeQuiz(ai, hole, ti).catch((e) => {
        toast(`${(e as Error).message} — using flashcards instead.`);
        return offlineQuiz(hole);
      }) : offlineQuiz(hole);
      if (!questions.length) questions = offlineQuiz(hole);
      setAttempt({ id: uid('qa_'), createdAt: new Date().toISOString(), questions, responses: questions.map(() => null), selfMarks: questions.map(() => null) });
      setRevealed(questions.map(() => false));
    } finally {
      setLoading(false);
    }
  };

  const save = (a: QuizAttempt) => {
    const marks = a.questions.map((q, i) => (q.kind === 'mcq' ? a.responses[i] === q.answerIndex : a.selfMarks[i]));
    const answered = marks.filter((m) => m !== null && m !== undefined);
    const score = answered.length ? answered.filter(Boolean).length / answered.length : 0;
    const done = { ...a, score };
    addQuiz(hole.id, done);
    setAttempt(done);
    return score;
  };

  if (!attempt)
    return (
      <div className="stack lg">
        <div className="card stack">
          <div className="h2">Test yourself</div>
          <div className="small muted">
            Retrieval practice — pulling knowledge out of your head — is one of the most effective ways to learn. {aiEnabled(ai)
              ? 'The AI writes questions that test understanding, not trivia.'
              : hole.quizBank?.length
                ? `Claude wrote ${hole.quizBank.length} questions for this week — each quiz draws 6 of them.`
                : 'Recall cards from your key ideas; you mark yourself.'}
          </div>
          {loading ? (
            <ThoughtLine label="Writing your quiz" working steps={['Reading key ideas', 'Finding misconceptions', 'Writing questions']} color="#ffd9c7" glyphColor="#FF6D29" />
          ) : (
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={start}>
              Start a quiz
            </button>
          )}
        </div>
        {hole.quizzes.length > 0 && (
          <div className="card stack">
            <div className="h3">Past attempts</div>
            {[...hole.quizzes].reverse().map((q) => (
              <div key={q.id} className="row between small">
                <span className="muted">{new Date(q.createdAt).toLocaleString()}</span>
                <span>{q.score !== undefined ? `${Math.round(q.score * 100)}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );

  return (
    <div className="stack lg">
      {attempt.questions.map((q, i) => (
        <div key={q.id} className="card stack">
          <div className="row between top">
            <span className="h3">
              <span className="orange">{i + 1}.</span> {q.prompt}
            </span>
            {q.concept && <span className="tag hide-sm">{q.concept}</span>}
          </div>
          {q.kind === 'mcq' && q.options ? (
            <div className="stack" style={{ gap: 6 }}>
              {q.options.map((o, k) => {
                const chosen = attempt.responses[i] === k;
                const show = revealed[i];
                const correct = k === q.answerIndex;
                return (
                  <button
                    key={k}
                    className="chip"
                    style={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      borderRadius: 14,
                      borderColor: show && correct ? '#8fd694' : show && chosen ? '#ff9b9b' : chosen ? 'var(--orange-line)' : undefined,
                      background: chosen ? 'var(--orange-soft)' : undefined,
                    }}
                    disabled={show}
                    onClick={() => {
                      setAttempt({ ...attempt, responses: attempt.responses.map((r, j) => (j === i ? k : r)) });
                      setRevealed((r) => r.map((x, j) => (j === i ? true : x)));
                    }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              placeholder="Answer from memory first…"
              value={(attempt.responses[i] as string) ?? ''}
              onChange={(e) => setAttempt({ ...attempt, responses: attempt.responses.map((r, j) => (j === i ? e.target.value : r)) })}
            />
          )}
          {q.kind === 'open' && !revealed[i] && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRevealed((r) => r.map((x, j) => (j === i ? true : x)))}>
              Reveal answer
            </button>
          )}
          {revealed[i] && (
            <div className="checkpoint small">
              <div className="tiny faint">Model answer</div>
              {q.modelAnswer}
            </div>
          )}
          {revealed[i] && q.kind === 'open' && (
            <div className="row" style={{ gap: 6 }}>
              <span className="small muted">Did you get it?</span>
              {[true, false].map((v) => (
                <button key={String(v)} className={`chip${attempt.selfMarks[i] === v ? ' on' : ''}`} onClick={() => setAttempt({ ...attempt, selfMarks: attempt.selfMarks.map((m, j) => (j === i ? v : m)) })}>
                  {v ? 'Yes' : 'Not quite'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="row between">
        <button className="btn" onClick={() => setAttempt(null)}>
          Discard
        </button>
        <button
          className="btn primary"
          onClick={() => {
            const s = save(attempt);
            toast(`Saved — ${Math.round(s * 100)}%. ${s < 0.6 ? 'Mark the shaky ideas as fuzzy in the Brief.' : 'Solid.'}`);
            setAttempt(null);
          }}
        >
          Finish quiz
        </button>
      </div>
    </div>
  );
}

const RUBRIC = ['I used no jargon (or explained every term)', 'I gave a concrete example', 'I explained WHY, not just WHAT', 'A 12-year-old could follow it', 'I know where my explanation is weakest'];

function Explain({ hole }: { hole: Hole }) {
  const ai = useStore((s) => s.ai);
  const addExplanation = useStore((s) => s.addExplanation);
  const setConcept = useStore((s) => s.setConcept);
  const [cid, setCid] = useState(hole.brief.concepts[0]?.id ?? 'whole');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<boolean[]>(RUBRIC.map(() => false));
  const [lastId, setLastId] = useState<string | null>(null);
  const concept = hole.brief.concepts.find((c) => c.id === cid);
  const conceptName = concept?.term ?? hole.title;
  const last = hole.explanations.find((e) => e.id === lastId);

  const submit = async () => {
    const id = uid('x_');
    const base = { id, createdAt: new Date().toISOString(), concept: conceptName, text };
    setLoading(true);
    try {
      if (aiEnabled(ai)) {
        const feedback = await explainFeedback(ai, hole, conceptName, text);
        addExplanation(hole.id, { ...base, feedback });
        if (concept) setConcept(hole.id, concept.id, { status: feedback.clarity >= 4 ? 'clear' : 'fuzzy' });
      } else {
        const score = checks.filter(Boolean).length;
        addExplanation(hole.id, {
          ...base,
          feedback: {
            clarity: Math.max(1, score),
            strengths: RUBRIC.filter((_, i) => checks[i]),
            gaps: RUBRIC.filter((_, i) => !checks[i]),
            followUp: 'Explain it again tomorrow without notes — what changed?',
          },
        });
        if (concept) setConcept(hole.id, concept.id, { status: score >= 4 ? 'clear' : 'fuzzy' });
      }
      setLastId(id);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="split">
      <div className="card stack lg">
        <div className="stack" style={{ gap: 4 }}>
          <div className="h2">Explain it like I’m 12</div>
          <div className="small muted">If you can’t explain it simply, you don’t understand it well enough. Write without looking at your notes.</div>
        </div>
        <select className="select" value={cid} onChange={(e) => setCid(e.target.value)}>
          {hole.brief.concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.term}
            </option>
          ))}
          <option value="whole">The whole topic: {hole.title}</option>
        </select>
        <textarea className="textarea" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={`So, ${conceptName} is basically…`} />
        {!aiEnabled(ai) && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="small muted">Self-check</div>
            {RUBRIC.map((r, i) => (
              <label key={r} className="row small" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={checks[i]} onChange={(e) => setChecks((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />
                {r}
              </label>
            ))}
          </div>
        )}
        {loading ? (
          <ThoughtLine label="Reading your explanation" working color="#ffd9c7" glyphColor="#FF6D29" />
        ) : (
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={text.trim().length < 20} onClick={submit}>
            {aiEnabled(ai) ? 'Get feedback' : 'Save explanation'}
          </button>
        )}
        {isManual(ai) && text.trim().length >= 20 && (
          <div className="card flat stack">
            <div className="small">Want a tutor’s eye on it? Send your explanation to Claude for honest feedback.</div>
            <ClaudeHandoff compact steps={false} prompt={explainPrompt(hole, conceptName, text)} />
          </div>
        )}
      </div>
      <div className="stack lg">
        {last?.feedback && (
          <div className="card hot stack fade-in">
            <div className="row between">
              <span className="h3">Feedback</span>
              <span className="tag orange">clarity {last.feedback.clarity}/5</span>
            </div>
            {last.feedback.strengths.map((s, i) => (
              <div key={i} className="small" style={{ color: '#8fd694' }}>
                ✓ {s}
              </div>
            ))}
            {last.feedback.gaps.map((s, i) => (
              <div key={i} className="small" style={{ color: '#ffc069' }}>
                △ {s}
              </div>
            ))}
            {last.feedback.followUp && (
              <div className="checkpoint small">
                <div className="tiny faint">Try this next</div>
                {last.feedback.followUp}
              </div>
            )}
          </div>
        )}
        {hole.explanations.length > 0 && (
          <div className="card stack">
            <div className="h3">Your explanations</div>
            {[...hole.explanations].reverse().map((e) => (
              <details key={e.id}>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  {e.concept} <span className="faint">· {e.feedback ? `${e.feedback.clarity}/5` : ''} · {new Date(e.createdAt).toLocaleDateString()}</span>
                </summary>
                <div className="small grey" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
                  {e.text}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Journal

function JournalTab({ hole }: { hole: Hole }) {
  const entries = hole.days.filter((d) => d.reflection || d.tasks.some((t) => t.note));
  if (!entries.length) return <div className="empty small">Your notes and end-of-day reflections will collect here.</div>;
  return (
    <div className="stack lg">
      {entries.map((d) => (
        <div key={d.index} className="card stack">
          <div className="row" style={{ gap: 8 }}>
            <span className="tag orange">Day {d.index + 1}</span>
            <span className="h3">{d.theme}</span>
            <span className="small faint">{prettyDate(d.date)}</span>
          </div>
          {d.reflection && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.reflection}</p>}
          {d.tasks
            .filter((t) => t.note)
            .map((t) => (
              <div key={t.id} className="small">
                <span className="muted">{t.title} — </span>
                <span className="grey" style={{ whiteSpace: 'pre-wrap' }}>
                  {t.note}
                </span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Finish

function FinishTab({ hole }: { hole: Hole }) {
  const ai = useStore((s) => s.ai);
  const finishHole = useStore((s) => s.finishHole);
  const updateHole = useStore((s) => s.updateHole);
  const nav = useNavigate();
  const [summary, setSummary] = useState(hole.final?.summary ?? '');
  const [surprise, setSurprise] = useState(hole.final?.surprise ?? '');
  const [still, setStill] = useState(hole.final?.stillConfused ?? '');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(hole.final?.rating ?? 4);
  const [wantMore, setWantMore] = useState(hole.final?.wantMore ?? false);
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState<string[]>([]);
  const hp = holeProgress(hole);
  const clear = hole.brief.concepts.filter((c) => c.status === 'clear').length;
  const firstNote = hole.days[0].tasks.find((t) => t.note)?.note;

  const recap = async () => {
    setLoading(true);
    try {
      const r = await weekRecap(ai, hole);
      updateHole(hole.id, (h) => ({ ...h, recap: r.recap }));
      setNext(r.nextHoles ?? []);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack lg">
      <div className="grid four">
        <div className="card tight stack" style={{ gap: 4 }}>
          <span className="statnum">
            <CountUp to={hp.done} />
          </span>
          <span className="tiny muted">tasks done</span>
        </div>
        <div className="card tight stack" style={{ gap: 4 }}>
          <span className="statnum">
            <CountUp to={Math.round(hp.minutes)} />
          </span>
          <span className="tiny muted">minutes spent</span>
        </div>
        <div className="card tight stack" style={{ gap: 4 }}>
          <span className="statnum">
            <CountUp to={clear} />/{hole.brief.concepts.length}
          </span>
          <span className="tiny muted">ideas clear</span>
        </div>
        <div className="card tight stack" style={{ gap: 4 }}>
          <span className="statnum">
            <CountUp to={hole.questions.length} />
          </span>
          <span className="tiny muted">questions raised</span>
        </div>
      </div>

      {firstNote && (
        <div className="card flat stack">
          <div className="tiny faint">On day 1 you wrote:</div>
          <div className="grey small" style={{ whiteSpace: 'pre-wrap' }}>
            “{firstNote}”
          </div>
        </div>
      )}

      <div className="card stack lg">
        <div className="h2">{hole.status === 'completed' ? 'Your wrap-up' : 'Close the loop'}</div>
        <label className="field">
          In a few sentences, what do you now understand that you didn’t a week ago?
          <textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="field">
          What surprised you most?
          <input className="input" value={surprise} onChange={(e) => setSurprise(e.target.value)} />
        </label>
        <label className="field">
          What’s still fuzzy?
          <input className="input" value={still} onChange={(e) => setStill(e.target.value)} />
        </label>
        <div className="row wrap between">
          <div className="row" style={{ gap: 6 }}>
            <span className="small muted">How good was this hole?</span>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button key={n} className="btn icon sm ghost" aria-label={`${n} stars`} onClick={() => setRating(n)} style={{ color: n <= rating ? '#FF6D29' : 'rgba(255,255,255,.3)', fontSize: 18 }}>
                ★
              </button>
            ))}
          </div>
          <button className={`chip${wantMore ? ' on' : ''}`} onClick={() => setWantMore((w) => !w)}>
            {wantMore ? '✓ ' : ''}I want to go deeper on this
          </button>
        </div>
        {hole.status === 'completed' ? (
          <button
            className="btn primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              updateHole(hole.id, (h) => ({ ...h, final: { ...h.final!, summary, surprise, stillConfused: still, rating, wantMore } }));
              toast('Updated.');
            }}
          >
            Save changes
          </button>
        ) : (
          <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
            <HoldButton
              backgroundColor="rgba(255,255,255,.08)"
              fillColor="#FF6D29"
              textColor="#ffffff"
              fillTextColor="#161316"
              holdTime={1200}
              doneLabel="Hole complete"
              disabled={summary.trim().length < 10}
              onHold={() => {
                finishHole(hole.id, { summary, surprise, stillConfused: still, rating, wantMore });
                toast('Rabbit hole complete. Your interests just got updated.');
              }}
            >
              Hold to close this rabbit hole
            </HoldButton>
            <span className="tiny faint">{summary.trim().length < 10 ? 'Write your summary first.' : 'Your rating and “go deeper” tune future suggestions.'}</span>
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="row between">
          <div className="h2">Recap</div>
          {aiEnabled(ai) && (
            <button className="btn sm" disabled={loading} onClick={recap}>
              <Icon icon={SparklesIcon} size={14} /> {hole.recap ? 'Rewrite' : 'Write my recap'}
            </button>
          )}
        </div>
        {loading && <ThoughtLine label="Reading your week" working color="#ffd9c7" glyphColor="#FF6D29" />}
        {hole.recap ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{hole.recap}</p>
        ) : (
          <div className="small muted">
            {aiEnabled(ai)
              ? 'Let the AI read your notes and write a recap of your week.'
              : isManual(ai)
                ? 'Send your notes to Claude for a recap of your week, then paste it here to keep it.'
                : 'Turn on an AI engine in Settings for an automatic recap. Your notes are always exportable.'}
          </div>
        )}
        {isManual(ai) && (
          <ClaudeHandoff
            compact
            steps={false}
            prompt={recapPrompt(hole)}
            submitLabel="Save recap"
            pastePlaceholder="Paste Claude’s recap here."
            onSubmit={(text) => {
              updateHole(hole.id, (h) => ({ ...h, recap: text.trim() }));
              toast('Recap saved.');
            }}
          />
        )}
        {next.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="small muted">Where this could lead next:</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {next.map((n) => (
                <button key={n} className="chip" onClick={() => nav('/new', { state: { custom: n } })}>
                  {n} →
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {hole.status === 'completed' && (
        <Link to="/discover" className="btn primary lg" style={{ alignSelf: 'center' }}>
          Find the next rabbit hole <Icon icon={ArrowRight01Icon} size={16} />
        </Link>
      )}
    </div>
  );
}
