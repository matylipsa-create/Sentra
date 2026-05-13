import { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
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

  const isFullHeight = state.activeTab === 'regulation' || state.activeTab === 'operations';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0e1a' }}>
      <TopBar />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden pt-14 pb-20 px-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {isFullHeight ? (
          <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 136px)' }}>
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

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
