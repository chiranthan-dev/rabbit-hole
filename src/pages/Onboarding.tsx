import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight01Icon, ArrowDownRight01Icon } from '@hugeicons/core-free-icons';
import { Background } from '../components/Shell';
import { Icon, Range } from '../components/ui';
import { DOMAINS } from '../lib/catalog';
import { useStore } from '../lib/store';
import type { Domain, LearningStyle } from '../lib/types';
import ShinyText from '../bits/ShinyText';
import ClickSpark from '../bits/ClickSpark';

const STYLES: { id: LearningStyle; label: string }[] = [
  { id: 'mixed', label: 'A bit of everything' },
  { id: 'reading', label: 'Reading' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Podcasts & audio' },
  { id: 'hands-on', label: 'Hands-on' },
];

const adventureLabel = (a: number) =>
  a < 0.25 ? 'Keep me close to what I love' : a < 0.6 ? 'Mostly familiar, some surprises' : a < 0.85 ? 'Lead me somewhere new' : 'Surprise me completely';

export default function Onboarding() {
  const onboard = useStore((s) => s.onboard);
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [adv, setAdv] = useState(0.55);
  const [minutes, setMinutes] = useState(45);
  const [style, setStyle] = useState<LearningStyle>('mixed');

  const toggle = (d: Domain) => setDomains((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const finish = () => {
    onboard({ name: name.trim(), domains, adventurousness: adv, minutes, style });
    nav('/discover?welcome=1');
  };

  return (
    <div className="shell">
      <Background />
      <header className="topbar">
        <span className="small">Rabbit Hole</span>
        <span className="small muted">
          {step + 1} / 4
        </span>
      </header>
      <ClickSpark sparkColor={['#FF6D29', '#ffffff', '#BABABA']} sparkCount={10} sparkRadius={22}>
        <main className="main" style={{ maxWidth: 760, paddingTop: '8vh', minHeight: '80dvh' }}>
          {step === 0 && (
            <div className="stack xl center fade-in">
              <div className="eyebrow">A weekly challenge for the curious</div>
              <h1 className="display">Rabbit Hole</h1>
              <div className="trio">
                <span>One topic</span>
                <span>One week</span>
                <span>Real understanding</span>
              </div>
              <p className="grey" style={{ maxWidth: 520, margin: '0 auto' }}>
                Pick something you’re curious about. Tell us how much time you have. Rabbit Hole researches it and builds a week of small,
                achievable tasks — designed for <ShinyText text="understanding, not just finishing" color="#ffd9c7" shineColor="#FF6D29" speed={3} />.
              </p>
              <div className="stack" style={{ maxWidth: 380, margin: '0 auto', width: '100%' }}>
                <input
                  className="input pillish center"
                  placeholder="What should we call you?"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
                />
                <button className="btn primary lg" onClick={() => setStep(1)}>
                  Let’s go <Icon icon={ArrowRight01Icon} size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="stack lg fade-in">
              <div className="stack center" style={{ gap: 8 }}>
                <div className="eyebrow">Interests</div>
                <h2 className="h1">What pulls you in{name ? `, ${name}` : ''}?</h2>
                <p className="muted small">Pick a few. This is just a starting point — Rabbit Hole learns from what you like, skip and finish.</p>
              </div>
              <div className="row wrap" style={{ justifyContent: 'center', gap: 10 }}>
                {DOMAINS.map((d) => (
                  <button key={d.id} className={`pill${domains.includes(d.id) ? ' chip on' : ''}`} style={{ paddingLeft: 8 }} onClick={() => toggle(d.id)}>
                    <span className="swatch" style={{ display: 'grid', placeItems: 'center', background: domains.includes(d.id) ? '#FF6D29' : 'rgba(255,255,255,.08)' }}>
                      {d.emoji}
                    </span>
                    {d.label}
                  </button>
                ))}
              </div>
              <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={domains.length === 0} />
            </div>
          )}

          {step === 2 && (
            <div className="stack lg fade-in center">
              <div className="eyebrow">Discovery</div>
              <h2 className="h1">How adventurous are you?</h2>
              <p className="muted small" style={{ maxWidth: 480, margin: '0 auto' }}>
                Rabbit Hole mixes topics close to your interests with “bridges” into fields you’ve never touched and pure wildcards. Slide right for more surprises.
              </p>
              <div className="card stack" style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
                <Range value={adv} min={0} max={1} step={0.05} onChange={setAdv} ariaLabel="Adventurousness" />
                <div className="row between tiny faint">
                  <span>Familiar</span>
                  <span>Wild</span>
                </div>
                <div className="h3 orange">{adventureLabel(adv)}</div>
              </div>
              <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </div>
          )}

          {step === 3 && (
            <div className="stack lg fade-in center">
              <div className="eyebrow">Rhythm</div>
              <h2 className="h1">A typical day, how much time?</h2>
              <p className="muted small">You’ll set this per day at the start of each week. This is just the default.</p>
              <div className="card stack" style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
                <div className="statnum">{minutes} min</div>
                <Range value={minutes} min={10} max={180} step={5} onChange={setMinutes} ariaLabel="Minutes per day" />
                <div className="divider" />
                <div className="small muted">How do you like to learn?</div>
                <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
                  {STYLES.map((s) => (
                    <button key={s.id} className={`chip${style === s.id ? ' on' : ''}`} onClick={() => setStyle(s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                <button className="btn" onClick={() => setStep(2)}>
                  Back
                </button>
                <button className="btn primary lg" onClick={finish}>
                  Find my first rabbit hole <Icon icon={ArrowDownRight01Icon} size={16} />
                </button>
              </div>
            </div>
          )}
        </main>
      </ClickSpark>
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
      <button className="btn" onClick={onBack}>
        Back
      </button>
      <button className="btn primary" disabled={nextDisabled} onClick={onNext}>
        Continue <Icon icon={ArrowRight01Icon} size={16} />
      </button>
    </div>
  );
}
