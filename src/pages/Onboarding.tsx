import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight01Icon, ArrowDownRight01Icon } from '@hugeicons/core-free-icons';
import { Background } from '../components/Shell';
import { Icon, Range, toast } from '../components/ui';
import { accountsAvailable, logIn, resetPassword, signUp, useAuth } from '../lib/auth';
import { syncSettled } from '../lib/sync';
import { downloadText } from '../lib/util';
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
  const [params] = useSearchParams();
  const initialMode = (params.get('auth') as Mode) || 'signup';
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(useStore.getState().profile.name);
  const [recovery, setRecovery] = useState('');

  // Set as soon as someone signs in on this screen, so the check below only
  // applies to people who were already logged in when they opened it.
  const authedHere = useRef(false);

  // Already logged in (e.g. "Redo onboarding"): skip the sign-in screen.
  useEffect(() => {
    if (auth.status !== 'in' || authedHere.current || recovery || step !== 0) return;
    if (useStore.getState().profile.onboarded) nav('/', { replace: true });
    else {
      setName(auth.user?.name ?? useStore.getState().profile.name);
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  const afterLogin = async () => {
    await syncSettled(); // bring this account's holes onto the device first
    const st = useStore.getState();
    if (st.profile.onboarded) nav('/', { replace: true });
    else {
      setName(useAuth.getState().user?.name ?? st.profile.name);
      setStep(1);
    }
  };
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
          {step === 0 && !recovery && (
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
              <AuthBox
                initialMode={initialMode}
                onStart={() => (authedHere.current = true)}
                onGuest={(n) => {
                  setName(n);
                  setStep(1);
                }}
                onSignedUp={(code, userName) => {
                  setName(userName);
                  setRecovery(code);
                }}
                onLoggedIn={afterLogin}
              />
            </div>
          )}

          {recovery && step === 0 && (
            <RecoveryCode
              code={recovery}
              onContinue={async () => {
                await syncSettled(); // after a reset, the account's holes come down first
                setRecovery('');
                if (useStore.getState().profile.onboarded) nav('/', { replace: true });
                else setStep(1);
              }}
            />
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

// ------------------------------------------------------------------ sign in / sign up

type Mode = 'signup' | 'login' | 'reset' | 'guest';

function AuthBox({
  initialMode,
  onStart,
  onGuest,
  onSignedUp,
  onLoggedIn,
}: {
  initialMode: Mode;
  onStart: () => void;
  onGuest: (name: string) => void;
  onSignedUp: (recoveryCode: string, name: string) => void;
  onLoggedIn: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '', code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    accountsAvailable().then((ok) => {
      setAvailable(ok);
      if (!ok) setMode('guest');
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'guest') return onGuest(f.name.trim());
      onStart();
      if (mode === 'signup') onSignedUp(await signUp(f.name.trim(), f.email, f.password), f.name.trim());
      else if (mode === 'login') {
        await logIn(f.email, f.password);
        await onLoggedIn();
      } else {
        const code = await resetPassword(f.email, f.code, f.password);
        toast('Password reset. You’re logged in.');
        onSignedUp(code, '');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = { signup: 'Create account', login: 'Log in', reset: 'Reset password & log in', guest: 'Continue' }[mode];

  return (
    <form className="auth-card stack" onSubmit={submit} noValidate>
      {available && mode !== 'guest' && (
        <div className="tabs" style={{ alignSelf: 'center' }} role="tablist">
          {(['signup', 'login'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m || (m === 'login' && mode === 'reset') ? 'on' : ''} onClick={() => (setMode(m), setError(''))}>
              {m === 'signup' ? 'Create account' : 'Log in'}
            </button>
          ))}
        </div>
      )}
      {mode === 'reset' && <div className="small muted center">Enter your email and the recovery code you saved when you signed up.</div>}
      {(mode === 'signup' || mode === 'guest') && (
        <input className="input pillish" autoComplete="name" placeholder="What should we call you?" value={f.name} onChange={set('name')} autoFocus />
      )}
      {mode !== 'guest' && <input className="input pillish" type="email" autoComplete="email" placeholder="Email" value={f.email} onChange={set('email')} autoFocus={mode !== 'signup'} />}
      {mode === 'reset' && <input className="input pillish" autoComplete="one-time-code" placeholder="Recovery code (XXXX-XXXX-XXXX-XXXX)" value={f.code} onChange={set('code')} />}
      {mode !== 'guest' && (
        <input
          className="input pillish"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={mode === 'login' ? 'Password' : mode === 'reset' ? 'New password (8+ characters)' : 'Password (8+ characters)'}
          value={f.password}
          onChange={set('password')}
        />
      )}
      {error && <div className="small center" style={{ color: '#ff9b9b' }}>{error}</div>}
      <button className="btn primary lg" disabled={busy || available === null}>
        {busy ? 'One moment…' : label} <Icon icon={ArrowRight01Icon} size={16} />
      </button>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 14 }}>
        {mode === 'login' && (
          <button type="button" className="btn sm ghost" onClick={() => (setMode('reset'), setError(''))}>
            Forgot password?
          </button>
        )}
        {mode === 'reset' && (
          <button type="button" className="btn sm ghost" onClick={() => (setMode('login'), setError(''))}>
            Back to log in
          </button>
        )}
        {available && mode !== 'guest' && (
          <button type="button" className="btn sm ghost" onClick={() => (setMode('guest'), setError(''))}>
            Continue without an account
          </button>
        )}
        {available && mode === 'guest' && (
          <button type="button" className="btn sm ghost" onClick={() => setMode('signup')}>
            Create an account instead
          </button>
        )}
      </div>
      {mode === 'guest' && (
        <div className="tiny faint center">
          {available === false ? 'Accounts aren’t available right now — ' : 'As a guest, '}your holes are saved only in this browser. You can create an account later and keep them.
        </div>
      )}
    </form>
  );
}

function RecoveryCode({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack lg center fade-in auth-card" style={{ textAlign: 'center' }}>
      <div className="eyebrow">One last thing</div>
      <h2 className="h1">Save your recovery code</h2>
      <p className="grey small">If you ever forget your password, this code lets you reset it. It’s shown only now — keep it somewhere safe, like your password manager.</p>
      <div className="recovery">{code}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
        <button
          type="button"
          className="btn sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast('Copied.');
            } catch {
              toast('Select the code and copy it.');
            }
          }}
        >
          Copy
        </button>
        <button type="button" className="btn sm" onClick={() => downloadText('rabbit-hole-recovery-code.txt', `Rabbit Hole recovery code\n${code}\n`, 'text/plain')}>
          Download
        </button>
      </div>
      <label className="row small" style={{ gap: 8, justifyContent: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I’ve saved it
      </label>
      <button className="btn primary lg" disabled={!saved} onClick={onContinue}>
        Continue <Icon icon={ArrowRight01Icon} size={16} />
      </button>
    </div>
  );
}
