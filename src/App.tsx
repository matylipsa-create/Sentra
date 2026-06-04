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

// ── Active page — each tab gets a key so React fully unmounts on switch ──────
function PageContent({ tab }: { tab: string }) {
  switch (tab) {
    case 'dashboard':  return <Dashboard />;
    case 'regulation': return <Regulation />;
    case 'operations': return <Operations />;
    case 'settings':   return <Settings />;
    default:           return <Dashboard />;
  }
}

function AppShell() {
  const { state } = useApp();
  const isDashboard = state.activeTab === 'dashboard';
  const isFullBleed = isDashboard || state.activeTab === 'regulation' || state.activeTab === 'operations';

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
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
    <div
      className="min-h-screen flex flex-col"
      style={{ background: isDashboard ? '#000000' : '#0a0e1a' }}
    >
      {/* TopBar is always z-30 root — never overlapped */}
      <TopBar />

      <main
        className="flex-1 pt-14 pb-20"
        style={{
          // Dashboard: zero overflow, AMOLED black, HUD fills exactly
          overflow:   isDashboard ? 'hidden' : 'auto',
          background: isDashboard ? '#000000' : '#0a0e1a',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {isFullBleed ? (
          // Full-height container — HUD/pages fill exact viewport height
          <div
            // key forces full unmount+remount when tab changes → no state bleed
            key={state.activeTab}
            className="flex flex-col"
            style={{
              height:     isDashboard ? 'calc(100dvh - 136px)' : undefined,
              minHeight:  isDashboard ? undefined : 'calc(100dvh - 136px)',
              overflow:   isDashboard ? 'hidden' : undefined,
              paddingLeft:  '0',
              paddingRight: '0',
            }}
          >
            <PageContent tab={state.activeTab} />
          </div>
        ) : (
          // Settings — scrollable, centered, padded
          <div
            key={state.activeTab}
            className="max-w-lg mx-auto py-4 px-4"
          >
            <PageContent tab={state.activeTab} />
          </div>
        )}
      </main>

      {/* BottomNav and EmergencyDrawer are always above content, never inside scroll */}
      <BottomNav />
      <EmergencyDrawer />
    </div>
  );
}

const WHITELIST = ['matylipsa@gmail.com'];

export default function App() {
  const [user, setUser] = useState<SentraUser | null>(null);

  const handleAuth = (authenticatedUser: SentraUser) => {
    if (
      authenticatedUser.method === 'BIOMETRIC' ||
      WHITELIST.includes(authenticatedUser.email ?? '')
    ) {
      setUser(authenticatedUser);
    } else {
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
