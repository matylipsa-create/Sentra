import { AlertTriangle, Cpu } from 'lucide-react';
import { useApp } from '../context/AppContext';

const MODE_COLORS = {
  ASSIST: '#1a73e8',
  STABILIZE: '#f97316',
  OBSERVE: '#10b981',
};

export default function TopBar() {
  const { state, setDrawer } = useApp();
  const color = MODE_COLORS[state.daemonMode];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4"
      style={{
        background: 'rgba(10, 14, 26, 0.95)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}25`, border: `1px solid ${color}40` }}
        >
          <Cpu size={14} style={{ color }} />
        </div>
        <span className="text-sm font-black tracking-[0.15em] text-white">SENTRA</span>
      </div>

      {/* Mode pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full border"
        style={{ background: `${color}15`, borderColor: `${color}40` }}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
        <span className="text-xs font-bold tracking-widest" style={{ color }}>
          {state.daemonMode}
        </span>
      </div>

      {/* Emergency trigger */}
      <button
        onClick={() => setDrawer(true)}
        className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all active:scale-90"
        title="Centro de Emergencias"
      >
        <AlertTriangle size={16} />
      </button>
    </header>
  );
}
