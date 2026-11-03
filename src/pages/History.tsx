import { Link, useNavigate } from 'react-router-dom';
import { Bar, Empty } from '../components/ui';
import { useStore } from '../lib/store';
import { holeProgress } from '../lib/planner';
import { domainEmoji, domainLabel } from '../lib/catalog';
import { fmtMinutes, prettyDate } from '../lib/util';

export default function History() {
  const holes = useStore((s) => s.holes);
  const nav = useNavigate();
  const sorted = [...holes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="stack xl">
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">Journal</div>
        <h1 className="display sm">Every hole so far</h1>
        <p className="grey">Your past weeks, notes, recaps and the questions they left behind.</p>
      </div>
      {sorted.length === 0 && (
        <Empty title="Nothing here yet">
          <button className="btn primary" style={{ alignSelf: 'center' }} onClick={() => nav('/new')}>
            Start your first rabbit hole
          </button>
        </Empty>
      )}
      <div className="grid two">
        {sorted.map((h) => {
          const p = holeProgress(h);
          return (
            <Link key={h.id} to={`/hole/${h.id}`} className="card stack" style={{ textDecoration: 'none' }}>
              <div className="row between">
                <span className="tag orange">
                  {domainEmoji(h.domain)} {domainLabel(h.domain)}
                </span>
                <span className={`tag${h.status === 'completed' ? ' good' : h.status === 'abandoned' ? ' warn' : ''}`}>{h.status === 'abandoned' ? 'shelved' : h.status}</span>
              </div>
              <div className="h2">{h.title}</div>
              <div className="small muted">{h.final?.summary || h.tagline || h.brief.summary}</div>
              <Bar value={p.ratio} />
              <div className="row between tiny faint">
                <span>{prettyDate(h.startDate)}</span>
                <span>
                  {p.done}/{p.total} tasks · {fmtMinutes(p.minutes)}
                  {h.final ? ` · ${'★'.repeat(h.final.rating)}` : ''}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
