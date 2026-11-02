import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Copy01Icon, Refresh01Icon, SmartPhone01Icon } from '@hugeicons/core-free-icons';
import { Icon, toast } from './ui';
import { useStore } from '../lib/store';
import { connect, disconnect, isValidCode, linkUrl, newSyncCode, syncAvailable, syncNow, useSyncStatus } from '../lib/sync';
import { copyText } from '../lib/manual';

const ago = (iso?: string) => {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function SyncPanel() {
  const sync = useStore((s) => s.sync);
  const status = useSyncStatus();
  const [avail, setAvail] = useState<{ ok: boolean; message?: string } | null>(null);
  const [qr, setQr] = useState('');
  const [entry, setEntry] = useState('');
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    syncAvailable().then(setAvail);
  }, []);
  useEffect(() => {
    if (!sync.code) return setQr('');
    QRCode.toDataURL(linkUrl(sync.code), { margin: 1, width: 220, color: { dark: '#161316', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [sync.code]);

  return (
    <section className="card stack lg" id="sync">
      <div className="stack" style={{ gap: 4 }}>
        <div className="h2">Sync across devices</div>
        <div className="small muted">
          Keep your laptop and phone on the same weeks, notes and interests. No account: a private sync code links your devices. Anyone with the code can see your data, so keep it to yourself. API keys never sync.
        </div>
      </div>

      {avail && !avail.ok && (
        <div className="code" style={{ borderColor: 'rgba(255,192,105,.5)' }}>
          {avail.message}
        </div>
      )}

      {!sync.code ? (
        <div className="grid two">
          <div className="card tight stack">
            <div className="h3">First device</div>
            <div className="small muted">Create a sync code and upload everything on this device.</div>
            <button
              className="btn primary"
              style={{ alignSelf: 'flex-start' }}
              disabled={!avail?.ok}
              onClick={() => {
                connect(newSyncCode(), true);
                toast('Sync is on. Now link your other device.');
              }}
            >
              Turn on sync
            </button>
          </div>
          <div className="card tight stack">
            <div className="h3">Already have a code?</div>
            <div className="small muted">Paste it (or scan the QR from your other device) to merge this device in.</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" placeholder="Sync code" value={entry} onChange={(e) => setEntry(e.target.value)} />
              <button
                className="btn"
                disabled={!avail?.ok || !isValidCode(entry)}
                onClick={() => {
                  connect(entry);
                  setEntry('');
                  toast('Linked — pulling your data…');
                }}
              >
                Link
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="split">
          <div className="stack">
            <div className="row wrap" style={{ gap: 8 }}>
              <span className={`tag${status.status === 'synced' ? ' good' : status.status === 'error' || status.status === 'unavailable' ? ' warn' : ''}`}>
                {status.status === 'syncing' ? 'syncing…' : status.status}
              </span>
              <span className="small muted">Last synced {ago(sync.lastSyncAt)}</span>
            </div>
            {status.message && <div className="small" style={{ color: '#ffc069' }}>{status.message}</div>}
            <div className="small muted">Your sync code</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" readOnly value={reveal ? sync.code : '•'.repeat(24)} onFocus={(e) => reveal && e.currentTarget.select()} />
              <button className="btn sm ghost" onClick={() => setReveal((r) => !r)}>
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn" onClick={() => void syncNow()}>
                <Icon icon={Refresh01Icon} size={14} /> Sync now
              </button>
              <button
                className="btn"
                onClick={async () => toast((await copyText(linkUrl(sync.code!))) ? 'Link copied — open it on your other device.' : 'Couldn’t copy; use the QR code.')}
              >
                <Icon icon={Copy01Icon} size={14} /> Copy link
              </button>
              <button
                className="btn ghost danger"
                onClick={() => {
                  if (confirm('Stop syncing on this device? Your data stays here and on your other devices.')) disconnect();
                }}
              >
                Turn off here
              </button>
            </div>
          </div>
          <div className="card tight stack center" style={{ alignItems: 'center' }}>
            <div className="row" style={{ gap: 8 }}>
              <Icon icon={SmartPhone01Icon} size={18} />
              <span className="h3">Link your phone</span>
            </div>
            {qr ? <img src={qr} width={180} height={180} alt="QR code to link another device" style={{ borderRadius: 14 }} /> : <div className="small muted">QR unavailable</div>}
            <div className="tiny muted">Scan with your phone camera. It opens Rabbit Hole and links automatically.</div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Tiny status pill for headers. */
export function SyncDot() {
  const code = useStore((s) => s.sync.code);
  const status = useSyncStatus((s) => s.status);
  if (!code) return null;
  const color = status === 'synced' ? '#8fd694' : status === 'syncing' ? '#FF6D29' : status === 'offline' ? '#BABABA' : '#ffc069';
  return (
    <Link to="/settings#sync" className="row tiny muted" style={{ gap: 6, textDecoration: 'none' }} title={`Sync: ${status}`}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="hide-sm">{status === 'syncing' ? 'syncing' : status === 'synced' ? 'synced' : status}</span>
    </Link>
  );
}
