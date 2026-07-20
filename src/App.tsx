import { useEffect, useState, type CSSProperties } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import SentraAuth from './components/SentraAuth';
import type { SentraUser } from './components/SentraAuth';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import EmergencyDrawer from './components/EmergencyDrawer';
import PanicOverlay from './components/PanicOverlay';
import Dashboard from './pages/Dashboard';
import Regulation from './pages/Regulation';
import Operations from './pages/Operations';
import Settings from './pages/Settings';
import type { NavTab } from './types';

// All four pages are mounted once and toggled with display:none.
// This prevents remounting heavy components (SentraHUD, workers, TF model)
// on every tab switch, eliminating re-initialization costs entirely.
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
      {/* Dashboard — AMOLED black, no padding */}
      <div style={{ ...full('dashboard'), background: '#000000' }}>
        <Dashboard />
      </div>

      {/* Regulation — padded, full height */}
      <div style={{ ...full('regulation'), paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1rem' }}>
        <Regulation />
      </div>

      {/* Operations — padded, full height */}
      <div style={{ ...full('operations'), paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1rem' }}>
        <Operations />
      </div>

      {/* Settings — centered, scrollable */}
      <div className="max-w-lg mx-auto" style={{ display: tab === 'settings' ? 'block' : 'none', padding: '1rem' }}>
        <Settings />
      </div>
    </>
  );
}

// AppShell does not read activeTab — it never re-renders on tab changes.
// Only PageContent re-renders (a lightweight CSS display toggle).
function AppShell() {
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

      <BottomNav />
      <EmergencyDrawer />
      <PanicOverlay />
    </div>
  );
}

const WHITELIST = ['matylipsa@gmail.com'];

export default function App() {
  const [user, setUser] = useState<SentraUser | null>(null);

  const handleAuth = (authenticatedUser: SentraUser) => {
    if (authenticatedUser.method === 'BIOMETRIC' || WHITELIST.includes(authenticatedUser.email ?? '')) {
      setUser(authenticatedUser);
    } else {
      console.error('Acceso Denegado: Usuario no autorizado —', authenticatedUser.email);
      alert('Acceso Denegado');
    }
  };

  if (!user) {
    return <SentraAuth onAuthenticated={handleAuth} />;
  }

  return (
    <ToastProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ToastProvider>
  );
}
