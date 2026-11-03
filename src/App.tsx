import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Component, useEffect, type ReactNode } from 'react';
import { Shell } from './components/Shell';
import { useStore } from './lib/store';
import Today from './pages/Today';
import NewHole from './pages/NewHole';
import HolePage from './pages/Hole';
import Discover from './pages/Discover';
import History from './pages/History';
import You from './pages/You';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import Mobile from './pages/Mobile';
import { setOnUnauthorized, startSync } from './lib/sync';
import { refreshAuth } from './lib/auth';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Routed() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const { pathname } = useLocation();
  if (!onboarded && pathname !== '/welcome' && pathname !== '/m') return <Navigate to="/welcome" replace />;
  if (pathname === '/m') return <Mobile />;
  if (pathname === '/welcome') return <Onboarding />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/new" element={<NewHole />} />
        <Route path="/hole/:id" element={<HolePage />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/history" element={<History />} />
        <Route path="/you" element={<You />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="main stack" style={{ maxWidth: 560, paddingTop: '15vh' }}>
        <h1 className="h1">Something broke.</h1>
        <div className="code">{this.state.error.message}</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <a className="btn" href="/settings">
            Settings (export your data)
          </a>
        </div>
      </div>
    );
  }
}

export default function App() {
  useEffect(() => {
    // If the server reports the session is gone mid-sync, re-check who's logged in.
    setOnUnauthorized(() => void refreshAuth());
    void refreshAuth().then(() => startSync());
  }, []);
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ScrollTop />
      <Routed />
    </BrowserRouter>
    </ErrorBoundary>
  );
}
