// Push notifications on the client: ask permission, subscribe this device,
// and keep the server's copy of the subscription and reminder time in step.

const API = '/api/account';

export type NotifySupport =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios-install' | 'dev'; message: string };

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function notifySupport(): NotifySupport {
  if (isIOS() && !isStandalone())
    return {
      ok: false,
      reason: 'ios-install',
      message: 'On iPhone and iPad, notifications work in the installed app: tap Share → Add to Home Screen, open Rabbit Hole from there, then turn reminders on.',
    };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return { ok: false, reason: 'unsupported', message: 'This browser doesn’t support notifications. Try Chrome, Edge, Firefox or Safari 16.4+.' };
  return { ok: true };
}

export const permission = (): NotificationPermission | 'unsupported' => ('Notification' in window ? Notification.permission : 'unsupported');

/** The service worker, if the app has one (production builds; not `npm run dev`). */
async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
}

async function call<T>(op: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}?op=${op}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

const toBytes = (b64url: string) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export async function currentSubscription() {
  const reg = await registration(1500);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must run from a tap/click), subscribe this device and save it to the account. */
export async function enableReminders(time: string) {
  const support = notifySupport();
  if (!support.ok) throw new Error(support.message);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted')
    throw new Error(
      perm === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.'
        : 'Notifications weren’t allowed.',
    );
  const reg = await registration();
  if (!reg) throw new Error('Notifications need the installed or deployed app (they don’t run in `npm run dev`; use `npm run preview`).');
  const { publicKey } = await call<{ publicKey: string }>('push-config');
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't receive our pushes: replace it.
  const key = sub?.options.applicationServerKey;
  if (sub && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
  await call('push-subscribe', { subscription: sub.toJSON(), tz: timeZone(), time });
}

export async function disableReminders() {
  const sub = await currentSubscription();
  if (sub) {
    await call('push-unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

export async function reminderStatus() {
  const sub = await currentSubscription();
  const s = await call<{ subscribed: boolean; devices: number; time: string; tz: string | null; daily: boolean }>('push-status', { endpoint: sub?.endpoint ?? '' });
  return { ...s, subscribed: !!sub && s.subscribed };
}

export const setReminderTime = (time: string) => call('push-prefs', { time, tz: timeZone() });
export const sendTestNotification = () => call<{ sent: number; failed: number }>('push-test', {});

/**
 * On app start (logged in): if this device is subscribed, re-send the subscription so
 * the server has it even after a key rotation or a data reset, and keep the time zone current.
 */
export async function refreshSubscription() {
  try {
    if (permission() !== 'granted') return;
    const sub = await currentSubscription();
    if (!sub) return;
    const status = await call<{ subscribed: boolean; time: string }>('push-status', { endpoint: sub.endpoint });
    await call('push-subscribe', { subscription: sub.toJSON(), tz: timeZone(), time: status.time });
  } catch {
    /* offline or logged out: try again next time */
  }
}
