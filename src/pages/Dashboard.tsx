import { useEffect, useState } from 'react';
import { Activity, Shield, Eye, Anchor, Cpu, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { DaemonMode } from '../types';

const MODE_CONFIG = {
  ASSIST: {
    label: 'MODO ASISTENCIA',
    color: '#1a73e8',
    glow: 'rgba(26, 115, 232, 0.4)',
    ring: 'rgba(26, 115, 232, 0.2)',
    bg: 'bg-blue-500/10 border-blue-500/30',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
  },
  STABILIZE: {
    label: 'MODO ESTABILIZAR',
    color: '#f97316',
    glow: 'rgba(249, 115, 22, 0.4)',
    ring: 'rgba(249, 115, 22, 0.2)',
    bg: 'bg-orange-500/10 border-orange-500/30',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
  },
  OBSERVE: {
    label: 'MODO OBSERVACIÓN',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.4)',
    ring: 'rgba(16, 185, 129, 0.2)',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
};

const AGENT_ICONS = {
  Anchor: Anchor,
  Daemon: Cpu,
  Observer: Eye,
};

function DaemonWidget() {
  const { state, setMode } = useApp();
  const cfg = MODE_CONFIG[state.daemonMode];
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse((p) => (p + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const circumference = 2 * Math.PI * 54;
  const daemon = state.agents.find((a) => a.name === 'Daemon');
  const level = daemon?.activationLevel ?? 88;
  const offset = circumference - (level / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Circular widget */}
      <div className="relative w-52 h-52">
        {/* Outer ring pulse */}
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-10"
          style={{ background: cfg.color, animationDuration: '3s' }}
        />
        {/* Outer ring */}
        <div
          className="absolute inset-2 rounded-full border-2 opacity-20"
          style={{ borderColor: cfg.color }}
        />

        {/* SVG Progress ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Background track */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="4"
          />
          {/* Progress */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke={cfg.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 0 6px ${cfg.color})`,
              transition: 'stroke-dashoffset 0.5s ease',
            }}
          />
          {/* Small ticks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10 * Math.PI) / 180;
            const r1 = 50, r2 = 54;
            const x1 = 60 + r1 * Math.cos(angle);
            const y1 = 60 + r1 * Math.sin(angle);
            const x2 = 60 + r2 * Math.cos(angle);
            const y2 = 60 + r2 * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-8 rounded-full flex flex-col items-center justify-center"
          style={{
            background: `radial-gradient(circle, rgba(10,14,26,0.95) 60%, ${cfg.ring})`,
            boxShadow: `0 0 30px ${cfg.glow}`,
          }}>
          <Cpu size={28} style={{ color: cfg.color }} />
          <span className="text-3xl font-bold text-white mt-1">{level}</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest">DAEMON</span>
        </div>

        {/* Animated dot on ring */}
        <div
          className="absolute w-3 h-3 rounded-full"
          style={{
            background: cfg.color,
            boxShadow: `0 0 8px ${cfg.color}`,
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) rotate(${pulse * 3.6}deg) translateY(-54px)`,
            transformOrigin: 'center',
          }}
        />
      </div>

      {/* Mode label */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${cfg.bg}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
        <span className={`text-xs font-bold tracking-widest ${cfg.text}`}>{cfg.label}</span>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-2">
        {(['ASSIST', 'STABILIZE', 'OBSERVE'] as DaemonMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
              state.daemonMode === m
                ? `${MODE_CONFIG[m].bg} ${MODE_CONFIG[m].text} border-current`
                : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: ReturnType<typeof useApp>['state']['agents'][0] }) {
  const Icon = AGENT_ICONS[agent.name];
  const isAlert = agent.status === 'alert';
  const color = isAlert ? '#f97316' : '#1a73e8';

  return (
    <div
      className="flex-1 rounded-xl p-3 border border-white/10 bg-white/5 backdrop-blur-sm"
      style={{ boxShadow: `0 0 20px ${color}10` }}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon size={16} style={{ color }} />
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <p className="text-xs text-gray-400 font-medium">{agent.name}</p>
      <div className="mt-1.5 h-1 rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${agent.activationLevel}%`, background: color }}
        />
      </div>
      <p className="text-xs text-gray-600 mt-1">{agent.activationLevel}%</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = '#1a73e8',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-3 items-start">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { state, setTab } = useApp();
  const [time, setTime] = useState(new Date());
  const [securityStatus, setSecurityStatus] = useState<'secure' | 'alert'>('secure');

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSecurityStatus(state.daemonMode === 'STABILIZE' ? 'alert' : 'secure');
  }, [state.daemonMode]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const formatDate = (d: Date) =>
    d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Centro de Comando</p>
          <h1 className="text-2xl font-bold text-white mt-0.5">SENTRA</h1>
          <p className="text-xs text-gray-600 capitalize mt-0.5">{formatDate(time)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-bold text-white tracking-widest">{formatTime(time)}</p>
          <div className="flex items-center gap-1.5 justify-end mt-1">
            {securityStatus === 'secure' ? (
              <>
                <CheckCircle size={12} className="text-emerald-400" />
                <span className="text-xs text-emerald-400">SISTEMA SEGURO</span>
              </>
            ) : (
              <>
                <AlertTriangle size={12} className="text-orange-400 animate-pulse" />
                <span className="text-xs text-orange-400">ALERTA ACTIVA</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Daemon Widget */}
      <div className="flex flex-col items-center py-4">
        <DaemonWidget />
      </div>

      {/* Agents row */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Agentes Activos</p>
        <div className="flex gap-3">
          {state.agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Shield}
          label="Ops Activas"
          value="3"
          sub="2 resueltas hoy"
          color="#1a73e8"
        />
        <StatCard
          icon={Activity}
          label="Resonancia"
          value="87%"
          sub="+4% esta semana"
          color="#10b981"
        />
        <StatCard
          icon={TrendingUp}
          label="Estabilidad"
          value="Óptima"
          sub="Últimas 4 horas"
          color="#1a73e8"
        />
        <StatCard
          icon={Eye}
          label="Monitoreo"
          value="3 zonas"
          sub="Sin anomalías"
          color="#10b981"
        />
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Acciones Rápidas</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTab('regulation')}
            className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-left hover:bg-blue-500/20 transition-all active:scale-95"
          >
            <Cpu size={20} className="text-blue-400 mb-2" />
            <p className="text-sm font-semibold text-white">Regulación</p>
            <p className="text-xs text-gray-500 mt-0.5">Protocolo Resonancia</p>
          </button>
          <button
            onClick={() => setTab('operations')}
            className="p-4 rounded-xl border border-white/10 bg-white/5 text-left hover:bg-white/10 transition-all active:scale-95"
          >
            <Shield size={20} className="text-gray-400 mb-2" />
            <p className="text-sm font-semibold text-white">Operaciones</p>
            <p className="text-xs text-gray-500 mt-0.5">Logs & Cámaras</p>
          </button>
        </div>
      </div>
    </div>
  );
}
