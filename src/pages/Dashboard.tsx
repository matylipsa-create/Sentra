import { useEffect, useState } from 'react';
import SentraHUD from '../components/SentraHUD';
import SentinelIntegration from '../components/SentinelIntegration';

export default function Dashboard() {
  console.log('Dashboard montado');
  const [demoActive, setDemoActive] = useState(() => {
    try { return localStorage.getItem('sentra_demo_mode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const handleToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail as { active: boolean };
      setDemoActive(detail.active);
    };
    const handleDemoEvent = () => setDemoActive(true);
    window.addEventListener('sentra_demo_toggle', handleToggle);
    window.addEventListener('sentra_demo_event', handleDemoEvent);
    return () => {
      window.removeEventListener('sentra_demo_toggle', handleToggle);
      window.removeEventListener('sentra_demo_event', handleDemoEvent);
    };
  }, []);

  return (
    <>
      {demoActive && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: 'rgba(234,179,8,0.15)',
            border: '1px solid rgba(234,179,8,0.5)',
            boxShadow: '0 0 12px rgba(234,179,8,0.3)',
          }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#eab308' }} />
          <span className="font-mono text-[10px] font-bold tracking-widest" style={{ color: '#eab308' }}>
            DEMO ACTIVA
          </span>
        </div>
      )}
      <SentraHUD />
      <SentinelIntegration />
    </>
  );
}
