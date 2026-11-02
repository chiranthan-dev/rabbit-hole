import { lazy, Suspense, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Home09Icon, Compass01Icon, Archive01Icon, User03Icon, Settings02Icon } from '@hugeicons/core-free-icons';
import { Icon, Toasts } from './ui';
import { useStore } from '../lib/store';

const Grainient = lazy(() => import('../bits/Grainient'));

export function Background() {
  const ui = useStore((s) => s.ui);
  return (
    <div className="bg" aria-hidden="true">
      {ui.background === 'animated' && (
        <Suspense fallback={null}>
          <Grainient
            className="grainient"
            colors={['#161316', '#2a1a14', '#453027', '#b8461a', '#FF6D29']}
            type="radial"
            angle={-20}
            speed={ui.motion === 'reduced' ? 0 : 0.25}
            flow={0.6}
            scale={1.3}
            softness={1}
            silk={0.5}
            grainAmount={0.06}
            grainAnimated={ui.motion !== 'reduced'}
            interactive={false}
            clickSwirl={false}
            contrast={0.95}
            saturation={0.95}
            dpr={1}
          />
        </Suspense>
      )}
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Today', icon: Home09Icon, end: true },
  { to: '/discover', label: 'Discover', icon: Compass01Icon },
  { to: '/history', label: 'Journal', icon: Archive01Icon },
  { to: '/you', label: 'You', icon: User03Icon },
  { to: '/settings', label: 'Settings', icon: Settings02Icon },
];

export function Shell({ children }: { children: ReactNode }) {
  const motion = useStore((s) => s.ui.motion);
  return (
    <div className={`shell${motion === 'reduced' ? ' reduce-motion' : ''}`}>
      <Background />
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          <span>
            Rabbit Hole <small className="hide-sm">· one topic, one week</small>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon icon={n.icon} size={16} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main">{children}</main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon icon={n.icon} size={20} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
