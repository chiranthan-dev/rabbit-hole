import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Refresh01Icon, UserIcon } from '@hugeicons/core-free-icons';
import { Icon, toast } from './ui';
import { useStore } from '../lib/store';
import { syncNow, useSyncStatus } from '../lib/sync';
import { changePassword, deleteAccount, logOut, useAuth } from '../lib/auth';

const ago = (iso?: string) => {
  if (!iso) return 'not yet';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** Settings → Account. */
export function AccountPanel() {
  const { status, user, message } = useAuth();
  const sync = useStore((s) => s.sync);
  const syncStatus = useSyncStatus();
  const nav = useNavigate();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [del, setDel] = useState('');
  const [busy, setBusy] = useState('');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (status !== 'in' || !user)
    return (
      <section className="card stack lg" id="account">
        <div className="stack" style={{ gap: 4 }}>
          <div className="h2">Account</div>
          <div className="small muted">
            {status === 'unavailable'
              ? message ?? 'Accounts aren’t available on this copy of the app.'
              : 'You’re using Rabbit Hole as a guest — everything lives only in this browser. Create a free account to keep it safe and use it on your phone and laptop.'}
          </div>
          {message && status === 'out' && <div className="small" style={{ color: '#ffc069' }}>{message}</div>}
        </div>
        {status !== 'unavailable' && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn primary" onClick={() => nav('/welcome?auth=signup')}>
              Create an account
            </button>
            <button className="btn" onClick={() => nav('/welcome?auth=login')}>
              Log in
            </button>
          </div>
        )}
        {status !== 'unavailable' && <div className="tiny faint">Your guest holes are kept and added to the account when you sign up or log in.</div>}
      </section>
    );

  return (
    <section className="card stack lg" id="account">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="avatar lg">{user.name.slice(0, 1).toUpperCase()}</span>
          <div className="stack" style={{ gap: 0 }}>
            <div className="h2">{user.name}</div>
            <div className="small muted">{user.email}</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
          <span className={`tag${syncStatus.status === 'synced' ? ' good' : syncStatus.status === 'error' || syncStatus.status === 'unavailable' ? ' warn' : ''}`}>
            {syncStatus.status === 'syncing' ? 'saving…' : syncStatus.status === 'synced' ? 'saved to your account' : syncStatus.status}
          </span>
          <span className="tiny faint">Last saved {ago(sync.lastSyncAt)}</span>
        </div>
      </div>
      {syncStatus.message && <div className="small" style={{ color: '#ffc069' }}>{syncStatus.message}</div>}
      <div className="small muted">
        Your holes, notes and interests are saved to your account and appear on any device where you log in. API keys stay on each device.
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn" onClick={() => void syncNow()}>
          <Icon icon={Refresh01Icon} size={14} /> Save now
        </button>
        <button
          className="btn"
          disabled={busy === 'out'}
          onClick={() =>
            run('out', async () => {
              await logOut();
              nav('/welcome', { replace: true });
            })
          }
        >
          Log out
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            if (confirm('Log out on every device, including this one?'))
              run('all', async () => {
                await logOut(true);
                nav('/welcome', { replace: true });
              });
          }}
        >
          Log out everywhere
        </button>
      </div>

      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          Change password
        </summary>
        <form
          className="stack"
          style={{ marginTop: 10, maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault();
            run('pw', async () => {
              await changePassword(pw.current, pw.next);
              setPw({ current: '', next: '' });
              toast('Password changed. Other devices have been signed out.');
            });
          }}
        >
          <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!pw.current || pw.next.length < 8 || busy === 'pw'}>
            Update password
          </button>
        </form>
      </details>

      <details>
        <summary className="small" style={{ cursor: 'pointer', color: '#ff9b9b' }}>
          Delete account
        </summary>
        <form
          className="stack"
          style={{ marginTop: 10, maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirm('Permanently delete your account and everything in it? This cannot be undone.')) return;
            run('del', async () => {
              await deleteAccount(del);
              toast('Your account has been deleted.');
              nav('/welcome', { replace: true });
            });
          }}
        >
          <div className="small muted">This permanently deletes your account, holes, notes and interests. Export a backup first if you want to keep them.</div>
          <input className="input" type="password" autoComplete="current-password" placeholder="Your password" value={del} onChange={(e) => setDel(e.target.value)} />
          <button className="btn danger" style={{ alignSelf: 'flex-start' }} disabled={!del || busy === 'del'}>
            Delete my account
          </button>
        </form>
      </details>
    </section>
  );
}

/** Header chip: your initial when logged in, a Log in button for guests. */
export function AccountChip() {
  const { status, user } = useAuth();
  if (status === 'in' && user)
    return (
      <Link to="/settings#account" className="row" style={{ gap: 8, textDecoration: 'none' }} title={`${user.name} · ${user.email}`}>
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
      </Link>
    );
  if (status === 'out')
    return (
      <Link to="/welcome?auth=login" className="btn sm">
        <Icon icon={UserIcon} size={14} /> Log in
      </Link>
    );
  return null;
}

/** Small "saved / saving" dot, shown while logged in. */
export function SyncDot() {
  const linked = useStore((s) => !!s.sync.userId);
  const status = useSyncStatus((s) => s.status);
  if (!linked) return null;
  const color = status === 'synced' ? '#8fd694' : status === 'syncing' ? '#FF6D29' : status === 'offline' ? '#BABABA' : '#ffc069';
  const label = status === 'synced' ? 'saved' : status === 'syncing' ? 'saving' : status;
  return (
    <Link to="/settings#account" className="row tiny muted" style={{ gap: 6, textDecoration: 'none' }} title={`Sync: ${status}`}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="hide-sm">{label}</span>
    </Link>
  );
}
