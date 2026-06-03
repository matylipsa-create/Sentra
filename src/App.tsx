import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import SentraAuth from './components/SentraAuth';
import type { SentraUser } from './components/SentraAuth';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import EmergencyDrawer from './components/EmergencyDrawer';
import Dashboard from './pages/Dashboard';
import Regulation from './pages/Regulation';
import Operations from './pages/Operations';
import Settings from './pages/Settings';

function PageContent() {
  const { state } = useApp();

  const pages = {
    dashboard: <Dashboard />,
    regulation: <Regulation />,
    operations: <Operations />,
    settings: <Settings />,
  };

  return pages[state.activeTab];
}

function AppShell() {
  const { state } = useApp();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => {/* non-fatal */});
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

  // Dashboard is SENTRA v3 — full height, no horizontal padding, no overflow
  const isFullHeight = state.activeTab === 'dashboard' || state.activeTab === 'regulation' || state.activeTab === 'operations';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0e1a' }}>
      <TopBar />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden pt-14 pb-20"
        style={{
          WebkitOverflowScrolling: 'touch',
          // Zero padding for dashboard (AMOLED HUD)
          paddingLeft: state.activeTab === 'dashboard' ? 0 : '1rem',
          paddingRight: state.activeTab === 'dashboard' ? 0 : '1rem',
          background: state.activeTab === 'dashboard' ? '#000000' : '#0a0e1a',
        }}
      >
        {isFullHeight ? (
          <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 136px)', background: state.activeTab === 'dashboard' ? '#000000' : undefined }}>
            <PageContent />
          </div>
        ) : (
          <div className="max-w-lg mx-auto py-4">
            <PageContent />
          </div>
        )}
      </main>

      <BottomNav />
      <EmergencyDrawer />
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
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
