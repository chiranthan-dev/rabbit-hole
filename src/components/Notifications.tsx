import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notification03Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Icon, toast } from './ui';
import { useAuth } from '../lib/auth';
import { disableReminders, enableReminders, notifySupport, permission, reminderStatus, sendTestNotification, setReminderTime } from '../lib/notify';

const TIMES = ['07:00', '08:00', '12:30', '18:00', '19:00', '20:00', '21:00'];
const pretty = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

type State = { loading: true } | { loading: false; on: boolean; time: string; devices: number };

/** Settings → Notifications. */
export function NotificationsPanel() {
  const auth = useAuth();
  const nav = useNavigate();
  const support = notifySupport();
  const [state, setState] = useState<State>({ loading: true });
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState('19:00');

  const load = async () => {
    if (auth.status !== 'in' || !support.ok) return setState({ loading: false, on: false, time, devices: 0 });
    try {
      const s = await reminderStatus();
      setTime(s.time);
      setState({ loading: false, on: s.subscribed, time: s.time, devices: s.devices });
    } catch {
      setState({ loading: false, on: false, time, devices: 0 });
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const on = !state.loading && state.on;

  return (
    <section className="card stack lg" id="notifications">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon icon={Notification03Icon} size={18} color="#FF6D29" />
          <div className="h2">Notifications</div>
        </div>
        <div className="small muted">
          A daily nudge with what’s left in your holes — only on days there’s something to do. When a week ends you’ll get a reminder to wrap it up.
        </div>
      </div>

      {!support.ok ? (
        <div className="notice warn">
          {support.message}
        </div>
      ) : auth.status !== 'in' ? (
        <div className="row wrap between" style={{ gap: 10 }}>
          <span className="small muted">Reminders are sent to your account, so log in to turn them on.</span>
          <button className="btn sm" onClick={() => nav('/welcome?auth=login')}>
            Log in
          </button>
        </div>
      ) : permission() === 'denied' ? (
        <div className="notice warn">
          Notifications are blocked for this site. Allow them in your browser’s site settings (or your phone’s Settings → Notifications → Rabbit Hole), then reload.
        </div>
      ) : (
        <>
          <div className="stack" style={{ gap: 8 }}>
            <span className="small muted">Remind me at</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {TIMES.map((t) => (
                <button
                  key={t}
                  className={`chip${time === t ? ' on' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setTime(t);
                    if (on)
                      void run(async () => {
                        await setReminderTime(t);
                        toast(`Reminders moved to ${pretty(t)}.`);
                      });
                  }}
                >
                  {pretty(t)}
                </button>
              ))}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {on ? (
              <>
                <button className="btn" disabled={busy} onClick={() => run(async () => toast((await sendTestNotification()).sent ? 'Sent — check your notifications.' : 'Couldn’t reach this device. Try turning reminders off and on.'))}>
                  Send a test
                </button>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await disableReminders();
                      await load();
                      toast('Reminders are off on this device.');
                    })
                  }
                >
                  Turn off on this device
                </button>
              </>
            ) : (
              <button
                className="btn primary"
                disabled={busy || state.loading}
                onClick={() =>
                  run(async () => {
                    await enableReminders(time);
                    await load();
                    toast(`Reminders on — around ${pretty(time)} on days with something to do.`);
                  })
                }
              >
                Turn on reminders
              </button>
            )}
          </div>
          {on && (
            <div className="tiny faint">
              On for {state.devices === 1 ? 'this device' : `${state.devices} devices`} · arrives within about 15 minutes of {pretty(time)}, your local time.
            </div>
          )}
        </>
      )}
    </section>
  );
}

const DISMISS_KEY = 'rabbit-hole-reminder-prompt';

/** A one-time card on Today offering reminders (logged in, supported, not yet decided). */
export function ReminderNudge() {
  const auth = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* storage blocked */
    }
    setShow(auth.status === 'in' && notifySupport().ok && permission() === 'default' && !dismissed);
  }, [auth.status]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage blocked */
    }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div className="card tight row wrap between fade-in" style={{ gap: 12 }}>
      <span className="row" style={{ gap: 10 }}>
        <Icon icon={Notification03Icon} size={18} color="#FF6D29" />
        <span className="small">Want a gentle nudge at 7 pm on days with tasks left?</span>
      </span>
      <span className="row" style={{ gap: 6 }}>
        <button
          className="btn sm primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enableReminders('19:00');
              toast('Reminders on. Change the time in Settings → Notifications.');
              dismiss();
            } catch (e) {
              toast((e as Error).message);
              dismiss();
            } finally {
              setBusy(false);
            }
          }}
        >
          Turn on
        </button>
        <button className="btn icon sm ghost" aria-label="Not now" onClick={dismiss}>
          <Icon icon={Cancel01Icon} size={14} />
        </button>
      </span>
    </div>
  );
}
