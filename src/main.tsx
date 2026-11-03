import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/global.css';
import App from './App';

// Offline cache (service worker). With autoUpdate, a newly deployed version
// installs in the background and the page reloads itself once it takes over,
// so nobody gets stuck on an old build. We also check for updates whenever the
// app comes back into view, and hourly while it stays open.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 60 * 60 * 1000);
  },
});

// No pinch-zoom on touch devices. iOS Safari ignores `user-scalable=no` in the
// viewport tag, so block its gesture events (and two-finger pinches) directly.
if (matchMedia('(pointer: coarse)').matches) {
  const stop = (e: Event) => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
}

// Note: no <StrictMode> — its dev-only double mount drops the WebGL
// context of the animated background (React Bits Grainient).
createRoot(document.getElementById('root')!).render(<App />);
