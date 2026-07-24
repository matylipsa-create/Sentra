import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import { useSeedData } from './hooks/useSeedData';
import { useInactivityReturn } from './hooks/useInactivityReturn';
import SentraAuth from './components/SentraAuth';
import type { SentraUser } from './components/SentraAuth';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import EmergencyDrawer from './components/EmergencyDrawer';
import PanicOverlay from './components/PanicOverlay';
import ErrorBoundary from './components/ErrorBoundary';
import DebugOverlay from './components/DebugOverlay';
import Dashboard from './pages/Dashboard';
import Regulation from './pages/Regulation';
import Operations from './pages/Operations';
import Settings from './pages/Settings';
import type { NavTab } from './types';

function PageContent() {
  const { state } = useApp();
  const tab = state.activeTab;

  const full = (t: NavTab): CSSProperties => ({
    display:       tab === t ? 'flex' : 'none',
    flexDirection: 'column',
    minHeight:     'calc(100dvh - 136px)',
  });

  return (
    <>
      <div style={{ ...full('dashboard'), background: '#000000' }}>
        <Dashboard />
      </div>
      <div style={{ ...full('regulation'), paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1rem' }}>
        <Regulation />
      </div>
      <div style={{ ...full('operations'), paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1rem' }}>
        <Operations />
      </div>
      <div className="max-w-lg mx-auto" style={{ display: tab === 'settings' ? 'block' : 'none', padding: '1rem' }}>
        <Settings />
      </div>
    </>
  );
}

function AppShell() {
  const { state, setMode, setStatus } = useApp();
  useSeedData();

  const handleInactivityReturn = useCallback(() => {
    setMode('OBSERVE');
    setStatus('idle');
  }, [setMode, setStatus]);

  const inactivity = useInactivityReturn(state.daemonMode, handleInactivityReturn);

  useEffect(() => {
    const register = () => inactivity.registerActivity();
    window.addEventListener('pointerdown', register);
    window.addEventListener('keydown', register);
    window.addEventListener('touchstart', register);
    return () => {
      window.removeEventListener('pointerdown', register);
      window.removeEventListener('keydown', register);
      window.removeEventListener('touchstart', register);
    };
  }, [inactivity]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {/* non-fatal */});
    }
  }, []);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        window.speechSynthesis.getVoices();
      });
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0e1a' }}>
      <TopBar />
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden pt-14 pb-20"
        style={{ WebkitOverflowScrolling: 'touch', background: '#0a0e1a' }}
      >
        <PageContent />
      </main>
      {inactivity.countdownActive && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg z-40"
          style={{
            background: 'rgba(107,127,215,0.12)',
            border: '1px solid rgba(107,127,215,0.3)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <p
            className="font-mono text-[10px] tracking-wider"
            style={{ color: 'rgba(107,127,215,0.9)', fontFamily: 'JetBrains Mono, monospace' }}
          >
            Retornando a OBSERVE en {inactivity.remainingSec}s
          </p>
        </div>
      )}
      <BottomNav />
      <EmergencyDrawer />
      <PanicOverlay />
    </div>
  );
}

const WHITELIST = ['matylipsa@gmail.com'];

export default function App() {
  const [user, setUser] = useState<SentraUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [debugMode] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!debugMode) return;
    const onError = (e: ErrorEvent) => {
      setError(e.message || 'Error desconocido (window.onerror)');
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      setError(`Promise rejection: ${reason}`);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [debugMode]);

  const handleAuth = (authenticatedUser: SentraUser) => {
    if (authenticatedUser.method === 'BIOMETRIC' || WHITELIST.includes(authenticatedUser.email ?? '')) {
      setUser(authenticatedUser);
    } else {
      console.error('Acceso Denegado: Usuario no autorizado —', authenticatedUser.email);
      alert('Acceso Denegado');
    }
  };

  if (!user) {
    return (
      <>
        <SentraAuth onAuthenticated={handleAuth} />
        {debugMode && <DebugOverlay isAuthenticated={false} error={error} />}
      </>
    );
  }

  return (
    <ToastProvider>
      <AppProvider>
        <ErrorBoundary onError={setError}>
          <AppShell />
        </ErrorBoundary>
        {debugMode && <DebugOverlay isAuthenticated={true} error={error} />}
      </AppProvider>
    </ToastProvider>
  );
}
