import { Link } from 'react-router-dom';
import { Cancel01Icon, FavouriteIcon, Bookmark01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Icon, Ring } from './ui';
import { dayProgress } from '../lib/planner';
import { domainEmoji, domainLabel } from '../lib/catalog';
import { useStore } from '../lib/store';
import type { Day, Suggestion } from '../lib/types';
import { isoDate, weekdayShort, parseDate } from '../lib/util';
import SpotlightCard from '../bits/SpotlightCard';

/** Concentric rings — one per day — that light up as you go deeper. */
export function DepthMeter({ days, current, label }: { days: Day[]; current: number; label?: string }) {
  return (
    <div className="depth" aria-label={`Day ${current + 1} of 7`}>
      {days.map((d, i) => {
        const inset = i * 7.2;
        const p = dayProgress(d);
        const lit = p.ratio >= 0.999 && p.total > 0;
        return (
          <div
            key={i}
            className={`ring${lit ? ' lit' : ''}`}
            style={{
              inset: `${inset}%`,
              borderStyle: i <= current || lit ? 'solid' : 'dashed',
              borderColor: lit ? undefined : i === current ? 'rgba(255,255,255,.6)' : i < current ? 'rgba(255,180,143,.45)' : 'rgba(255,255,255,.22)',
              background: i === current ? 'radial-gradient(circle, rgba(255,109,41,.10), transparent 70%)' : undefined,
            }}
          />
        );
      })}
      <div className="core">
        <div className="statnum">{current + 1}</div>
        <div className="tiny muted">{label ?? 'of 7 days deep'}</div>
      </div>
    </div>
  );
}

export function WeekStrip({ days, selected, onSelect }: { days: Day[]; selected: number; onSelect: (i: number) => void }) {
  const today = isoDate();
  return (
    <div className="week">
      {days.map((d) => {
        const p = dayProgress(d);
        const cls = ['daypill', d.date === today ? 'today' : '', d.index === selected ? 'sel' : '', d.date < today ? 'past' : ''].join(' ');
        return (
          <button key={d.index} className={cls} onClick={() => onSelect(d.index)} aria-pressed={d.index === selected}>
            <span>{weekdayShort(d.date)}</span>
            <b>{parseDate(d.date).getDate()}</b>
            <Ring value={p.ratio} size={20} stroke={2.5} />
          </button>
        );
      })}
    </div>
  );
}

const BUCKET_LABEL: Record<Suggestion['bucket'], string> = {
  alley: 'Down your alley',
  hop: 'One hop over',
  wildcard: 'Wildcard',
  thread: 'Your thread',
  ai: 'Generated for you',
};

export function TopicCard({ s, onStart }: { s: Suggestion; onStart: (s: Suggestion) => void }) {
  const likeTopic = useStore((st) => st.likeTopic);
  const dismissTopic = useStore((st) => st.dismissTopic);
  const toggleSaved = useStore((st) => st.toggleSaved);
  const liked = useStore((st) => st.profile.topicSignals[s.topic.id]?.liked);
  const saved = useStore((st) => st.savedTopics.some((x) => x.id === s.topic.id));
  const canSignal = s.bucket !== 'thread';
  return (
    <SpotlightCard className={`card topic-card bucket-${s.bucket}`} spotlightColor="rgba(255, 109, 41, 0.22)">
      <div className="row between">
        <span className="bucket-label">{BUCKET_LABEL[s.bucket]}</span>
        <span className="tag">
          {domainEmoji(s.topic.domain)} {domainLabel(s.topic.domain)}
        </span>
      </div>
      <div className="h3">{s.topic.title}</div>
      <div className="small grey">{s.topic.hook}</div>
      <div className="tiny faint" style={{ flex: 1 }}>
        {s.reason}
      </div>
      <div className="row between" style={{ marginTop: 4 }}>
        <div className="row" style={{ gap: 4 }}>
          {canSignal && (
            <>
              <button className={`btn icon sm${liked ? ' primary' : ''}`} aria-label="More like this" title="More like this" onClick={() => likeTopic(s.topic)}>
                <Icon icon={FavouriteIcon} size={15} />
              </button>
              <button className={`btn icon sm${saved ? ' primary' : ''}`} aria-label="Save for later" title="Save for later" onClick={() => toggleSaved(s.topic)}>
                <Icon icon={Bookmark01Icon} size={15} />
              </button>
              <button className="btn icon sm" aria-label="Not for me" title="Not for me" onClick={() => dismissTopic(s.topic)}>
                <Icon icon={Cancel01Icon} size={15} />
              </button>
            </>
          )}
        </div>
        <button className="btn sm primary" onClick={() => onStart(s)}>
          Dive in <Icon icon={ArrowRight01Icon} size={14} />
        </button>
      </div>
    </SpotlightCard>
  );
}

export function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card tight stack" style={{ gap: 6 }}>
      <div className="statnum">{children}</div>
      <div className="tiny muted">{label}</div>
    </div>
  );
}

export const linkState = (s: Suggestion) => ({ topic: s.topic });
export { Link };
