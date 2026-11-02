import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '../components/Shell';
import { connect, isValidCode, syncNow, useSyncStatus } from '../lib/sync';
import { useStore } from '../lib/store';

/** Opened from the QR code / link on another device: /link#<code> */
export default function LinkDevice() {
  const nav = useNavigate();
  const status = useSyncStatus();
  const [bad, setBad] = useState(false);

  useEffect(() => {
    const code = decodeURIComponent(location.hash.slice(1));
    history.replaceState(null, '', '/link'); // don't leave the secret in the address bar
    if (!isValidCode(code)) return setBad(true);
    if (useStore.getState().sync.code !== code) connect(code);
    else void syncNow();
  }, []);

  useEffect(() => {
    if (status.status === 'synced') {
      const t = setTimeout(() => nav(useStore.getState().profile.onboarded ? '/' : '/welcome', { replace: true }), 600);
      return () => clearTimeout(t);
    }
  }, [status.status, nav]);

  return (
    <div className="shell">
      <Background />
      <main className="main stack lg center" style={{ maxWidth: 520, paddingTop: '22vh' }}>
        <h1 className="display sm">{bad ? 'That link didn’t work.' : status.status === 'synced' ? 'Linked.' : 'Linking…'}</h1>
        <p className="grey">
          {bad
            ? 'The sync code is missing or broken. Copy the link again from Settings on your other device.'
            : status.message ?? 'Pulling your rabbit holes from your other device.'}
        </p>
        {(bad || status.status === 'error' || status.status === 'unavailable') && (
          <button className="btn primary" style={{ alignSelf: 'center' }} onClick={() => nav('/settings#sync')}>
            Open sync settings
          </button>
        )}
      </main>
    </div>
  );
}
