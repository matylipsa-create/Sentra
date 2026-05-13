import { useState, useEffect } from 'react';
import { Shield, Camera, AlertTriangle, CheckCircle, Clock, Wifi, WifiOff, RefreshCw, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import type { SecurityLog, Severity } from '../types';

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  info: { label: 'INFO', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  warning: { label: 'ALERTA', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  critical: { label: 'CRÍTICO', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const MOCK_LOGS: SecurityLog[] = [
  { id: '1', severity: 'info', source: 'Sistema', message: 'SENTRA inicializado correctamente', resolved: true, createdAt: new Date(Date.now() - 1000 * 60 * 5) },
  { id: '2', severity: 'warning', source: 'Daemon', message: 'Patrón de estrés elevado detectado — protocolo activado', resolved: true, createdAt: new Date(Date.now() - 1000 * 60 * 18) },
  { id: '3', severity: 'info', source: 'Cámara 1', message: 'Movimiento detectado — Zona A identificada segura', resolved: true, createdAt: new Date(Date.now() - 1000 * 60 * 32) },
  { id: '4', severity: 'critical', source: 'Sensor', message: 'Variación atípica en frecuencia cardiaca — monitoreo intensivo', resolved: false, createdAt: new Date(Date.now() - 1000 * 60 * 45) },
  { id: '5', severity: 'info', source: 'Observer', message: 'Ciclo de observación completado. Sin anomalías en zona norte', resolved: true, createdAt: new Date(Date.now() - 1000 * 60 * 60) },
  { id: '6', severity: 'warning', source: 'Sistema', message: 'Conexión de sensor intermitente — reconectando', resolved: true, createdAt: new Date(Date.now() - 1000 * 60 * 90) },
];

const CAMERAS = [
  { id: 1, name: 'Zona A — Principal', status: 'online', image: 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=400&h=225&dpr=1' },
  { id: 2, name: 'Zona B — Acceso', status: 'online', image: 'https://images.pexels.com/photos/534151/pexels-photo-534151.jpeg?auto=compress&cs=tinysrgb&w=400&h=225&dpr=1' },
  { id: 3, name: 'Zona C — Perímetro', status: 'offline', image: null },
  { id: 4, name: 'Zona D — Interior', status: 'online', image: 'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=400&h=225&dpr=1' },
];

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function LogRow({ log, onResolve }: { log: SecurityLog; onResolve: (id: string) => void }) {
  const cfg = SEVERITY_CONFIG[log.severity];
  return (
    <div className={`rounded-xl border p-3 transition-all ${log.resolved ? 'opacity-50' : ''} ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.color} bg-white/5`}>
              {cfg.label}
            </span>
            <span className="text-xs text-gray-500">{log.source}</span>
          </div>
          <p className="text-sm text-gray-300 leading-snug">{log.message}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Clock size={10} className="text-gray-600" />
            <span className="text-xs text-gray-600">{timeAgo(log.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {log.resolved ? (
            <CheckCircle size={16} className="text-emerald-500" />
          ) : (
            <button
              onClick={() => onResolve(log.id)}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-gray-400 hover:text-white transition-all"
            >
              Resolver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CameraCard({ cam }: { cam: typeof CAMERAS[0] }) {
  const isOnline = cam.status === 'online';
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-white/5">
      <div className="relative aspect-video bg-gray-900">
        {isOnline && cam.image ? (
          <img
            src={cam.image}
            alt={cam.name}
            className="w-full h-full object-cover opacity-70"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <WifiOff size={24} className="text-gray-600" />
            <span className="text-xs text-gray-600">Sin señal</span>
          </div>
        )}
        {/* Overlay scan line */}
        {isOnline && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="w-full h-px bg-blue-400/30 animate-scan" />
          </div>
        )}
        {/* Status badge */}
        <div
          className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
          {isOnline ? 'EN LÍNEA' : 'OFFLINE'}
        </div>
        {/* Live dot */}
        {isOnline && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-bold">REC</span>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-300">{cam.name}</p>
      </div>
    </div>
  );
}

type FilterType = 'all' | Severity | 'unresolved';

export default function Operations() {
  const { state } = useApp();
  const [logs, setLogs] = useState<SecurityLog[]>(MOCK_LOGS);
  const [activeTab, setActiveTab] = useState<'logs' | 'cameras'>('logs');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Try to load from Supabase
    (async () => {
      try {
        const { data } = await supabase
          .from('security_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (data && data.length > 0) {
          setLogs(
            data.map((row) => ({
              id: row.id,
              severity: row.severity as Severity,
              source: row.source,
              message: row.message,
              resolved: row.resolved,
              createdAt: new Date(row.created_at),
            }))
          );
        }
      } catch {
        /* use mock data */
      }
    })();
  }, []);

  const handleResolve = async (id: string) => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, resolved: true } : l)));
    try {
      await supabase.from('security_logs').update({ resolved: true }).eq('id', id);
    } catch {
      /* offline */
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  const filteredLogs = logs.filter((l) => {
    if (filter === 'all') return true;
    if (filter === 'unresolved') return !l.resolved;
    return l.severity === filter;
  });

  const unresolvedCount = logs.filter((l) => !l.resolved).length;
  const criticalCount = logs.filter((l) => l.severity === 'critical' && !l.resolved).length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">STAR OPS</p>
          <h2 className="text-lg font-bold text-white">Operaciones</h2>
        </div>
        <button
          onClick={handleRefresh}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 bg-white/5 border border-white/10 text-center">
          <p className="text-xl font-bold text-white">{logs.length}</p>
          <p className="text-xs text-gray-500">Total Eventos</p>
        </div>
        <div className={`rounded-xl p-3 border text-center ${unresolvedCount > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/10'}`}>
          <p className={`text-xl font-bold ${unresolvedCount > 0 ? 'text-orange-400' : 'text-white'}`}>{unresolvedCount}</p>
          <p className="text-xs text-gray-500">Sin resolver</p>
        </div>
        <div className={`rounded-xl p-3 border text-center ${criticalCount > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
          <p className={`text-xl font-bold ${criticalCount > 0 ? 'text-red-400' : 'text-white'}`}>{criticalCount}</p>
          <p className="text-xs text-gray-500">Críticos</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(['logs', 'cameras'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === t
                ? 'bg-blue-600/30 border border-blue-500/50 text-blue-400'
                : 'bg-white/5 border border-white/10 text-gray-500 hover:text-gray-400'
            }`}
          >
            {t === 'logs' ? <Shield size={15} /> : <Camera size={15} />}
            {t === 'logs' ? 'Registros' : 'Cámaras'}
          </button>
        ))}
      </div>

      {activeTab === 'logs' && (
        <>
          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['all', 'unresolved', 'critical', 'warning', 'info'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  filter === f
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-white/5 border-white/10 text-gray-500'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'unresolved' ? 'Pendientes' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Log list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ minHeight: 0 }}>
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <CheckCircle size={36} className="text-emerald-500/40" />
                <p className="text-sm text-gray-500">Sin eventos en esta categoría</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <LogRow key={log.id} log={log} onResolve={handleResolve} />
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'cameras' && (
        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pr-1" style={{ minHeight: 0 }}>
          {CAMERAS.map((cam) => (
            <CameraCard key={cam.id} cam={cam} />
          ))}
        </div>
      )}
    </div>
  );
}
