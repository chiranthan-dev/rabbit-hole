import { useNavigate } from 'react-router-dom';
import { Range } from '../components/ui';
import { StatTile } from '../components/Widgets';
import { stats, useStore } from '../lib/store';
import { DOMAINS } from '../lib/catalog';
import { domainExposure } from '../lib/recommend';
import { fmtMinutes } from '../lib/util';
import CountUp from '../bits/CountUp';

export default function You() {
  const profile = useStore((s) => s.profile);
  const holes = useStore((s) => s.holes);
  const setProfile = useStore((s) => s.setProfile);
  const nav = useNavigate();
  const st = stats(holes);
  const exposure = domainExposure(holes);
  const maxAbs = Math.max(1, ...Object.values(profile.domainAffinity).map((v) => Math.abs(v ?? 0)));
  const tags = Object.entries(profile.tagAffinity).sort((a, b) => b[1] - a[1]);
  const loved = tags.filter(([, v]) => v > 0).slice(0, 14);
  const cooled = tags.filter(([, v]) => v < 0).slice(-8);
  const unexplored = DOMAINS.filter((d) => !exposure[d.id]);

  return (
    <div className="stack xl">
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">You</div>
        <h1 className="display sm">{profile.name || 'Your curiosity'}</h1>
        <p className="grey">What you’ve learned, and what Rabbit Hole has learned about you.</p>
      </div>

      <div className="grid four">
        <StatTile label="holes completed">
          <CountUp to={st.holesDone} />
        </StatTile>
        <StatTile label="time spent learning">{fmtMinutes(st.minutes)}</StatTile>
        <StatTile label="tasks done">
          <CountUp to={st.tasksDone} />
        </StatTile>
        <StatTile label="ideas you can explain">
          <CountUp to={st.conceptsClear} />
        </StatTile>
        <StatTile label="day streak">
          <CountUp to={st.streak} />
        </StatTile>
        <StatTile label="questions raised">
          <CountUp to={st.questions} />
        </StatTile>
      </div>

      <div className="split">
        <div className="card stack lg">
          <div className="stack" style={{ gap: 4 }}>
            <div className="h2">Interest map</div>
            <div className="small muted">Built from your picks, hearts, dismissals, the holes you start and how you rate them.</div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {DOMAINS.map((d) => {
              const v = profile.domainAffinity[d.id] ?? 0;
              const w = (Math.abs(v) / maxAbs) * 50;
              return (
                <div key={d.id} className="affbar">
                  <span>
                    {d.emoji} {d.label}
                  </span>
                  <span className="track">
                    <span
                      style={{
                        left: v >= 0 ? '50%' : `${50 - w}%`,
                        width: `${w}%`,
                        background: v >= 0 ? 'linear-gradient(90deg,#ffb48f,#FF6D29)' : 'rgba(186,186,186,.5)',
                      }}
                    />
                    <span style={{ left: '50%', width: 1, background: 'rgba(255,255,255,.25)' }} />
                  </span>
                  <span className="tiny faint" style={{ textAlign: 'right' }}>
                    {exposure[d.id] ? `${exposure[d.id]}×` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="stack lg">
          <div className="card stack">
            <div className="h3">Themes you gravitate to</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {loved.length ? loved.map(([t]) => <span key={t} className="tag orange">{t}</span>) : <span className="small muted">Heart a few topics in Discover.</span>}
            </div>
            {cooled.length > 0 && (
              <>
                <div className="h3" style={{ marginTop: 8 }}>
                  Cooling off
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {cooled.map(([t]) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="card stack">
            <div className="h3">Adventurousness</div>
            <Range value={profile.adventurousness} min={0} max={1} step={0.05} onChange={(v) => setProfile({ adventurousness: v })} />
            <div className="row between tiny faint">
              <span>Familiar</span>
              <span>{Math.round(profile.adventurousness * 100)}%</span>
              <span>Wild</span>
            </div>
          </div>
          {unexplored.length > 0 && (
            <div className="card stack">
              <div className="h3">Never been there</div>
              <div className="small muted">Domains you haven’t explored yet — wildcards come from here.</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {unexplored.map((d) => (
                  <span key={d.id} className="tag">
                    {d.emoji} {d.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="h2">How suggestions work</div>
        <div className="grid three small grey">
          <div className="stack" style={{ gap: 4 }}>
            <span className="bucket-label bucket-alley">Down your alley</span>
            Topics whose domain and themes score highest in your interest map.
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="bucket-label bucket-hop">One hop over</span>
            Topics in domains you barely know that share a theme with something you love — found through which themes tend to appear together.
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="bucket-label bucket-wildcard">Wildcards</span>
            Deliberately far from your profile, favouring domains you’ve never explored, with a dash of randomness. More of these as adventurousness goes up.
          </div>
        </div>
        <div className="small muted">
          Signals: picking a domain at onboarding (+), hearting (+), saving (+), starting a hole (+), finishing with a high rating or “go deeper” (++), dismissing (−), a low rating (−). Topics you’ve seen a lot fade so new ones surface.
        </div>
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/discover')}>
          See my suggestions
        </button>
      </div>
    </div>
  );
}
