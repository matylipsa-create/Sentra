import { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, CheckCircle, Clock, RefreshCw, Zap } from 'lucide-react';
import { mesh } from '../lib/SentraMesh';
import type { SecurityLog, Severity } from '../types';

const MAX_EVENTS = 5;

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  info:     { label: 'INFO',    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  warning:  { label: 'ALERTA', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  critical: { label: 'CRÍTICO', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
};

const SEED_LOGS: SecurityLog[] = [
  { id: '1', severity: 'info',     source: 'Sistema',   message: 'SENTRA inicializado correctamente',                               resolved: true,  createdAt: new Date(Date.now() - 60_000 * 5)  },
  { id: '2', severity: 'warning',  source: 'Daemon',    message: 'Patrón de estrés elevado detectado — protocolo activado',        resolved: true,  createdAt: new Date(Date.now() - 60_000 * 18) },
  { id: '3', severity: 'critical', source: 'Sensor',    message: 'Variación atípica en frecuencia cardiaca — monitoreo intensivo', resolved: false, createdAt: new Date(Date.now() - 60_000 * 45) },
  { id: '4', severity: 'info',     source: 'Observer',  message: 'Ciclo de observación completado. Sin anomalías en zona norte',  resolved: true,  createdAt: new Date(Date.now() - 60_000 * 60) },
  { id: '5', severity: 'warning',  source: 'Sistema',   message: 'Conexión de sensor intermitente — reconectando',                 resolved: true,  createdAt: new Date(Date.now() - 60_000 * 90) },
];

// Map mesh event types to SecurityLog severities
function meshEventToLog(type: string): { severity: Severity; source: string; message: string } {
  switch (type) {
    case 'SYSTEM_ARMED':        return { severity: 'info',     source: 'Sistema',  message: 'Sistema armado — modo vigilancia activo' };
    case 'SYSTEM_DISARMED':     return { severity: 'info',     source: 'Sistema',  message: 'Sistema desarmado' };
    case 'VISION_ALERT':        return { severity: 'critical', source: 'Visión',   message: 'Alerta visual detectada por cámara' };
    case 'SPEECH_COERCION':     return { severity: 'critical', source: 'Audio',    message: 'Indicador de coacción detectado en voz' };
    case 'EMERGENCY_DISPATCH':  return { severity: 'critical', source: 'Emergencia', message: 'Despacho de emergencia activado' };
    case 'AUDIO_ALERT':         return { severity: 'warning',  source: 'Audio',    message: 'Alerta de audio recibida' };
    case 'FALLBACK_QUEUED':     return { severity: 'warning',  source: 'Red',      message: 'Evento encolado por latencia elevada' };
    case 'FALLBACK_FLUSHED':    return { severity: 'info',     source: 'Red',      message: 'Cola de eventos sincronizada con Pipedream' };
    case 'HARDWARE_DIAG':       return { severity: 'info',     source: 'Hardware', message: 'Diagnóstico de hardware completado' };
    case 'GEO_UPDATE':          return { severity: 'info',     source: 'GPS',      message: 'Posición geográfica actualizada' };
    default:                    return { severity: 'info',     source: 'Sistema',  message: `Evento de sistema: ${type}` };
  }
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function LogRow({ log, onResolve, isNew }: { log: SecurityLog; onResolve: (id: string) => void; isNew?: boolean }) {
  const cfg = SEVERITY_CONFIG[log.severity];
  return (
    <div
      className={`rounded-xl border p-3 transition-all duration-500 ${log.resolved ? 'opacity-50' : ''} ${cfg.border} ${cfg.bg} ${isNew ? 'ring-1 ring-blue-400/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.color} bg-white/5`}>
              {cfg.label}
            </span>
            <span className="text-xs text-gray-500">{log.source}</span>
            {isNew && <Zap size={10} className="text-blue-400" />}
          </div>
          <p className="text-sm text-gray-300 leading-snug">{log.message}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Clock size={10} className="text-gray-600" />
            <span className="text-xs text-gray-600">{timeAgo(log.createdAt)}</span>
          </div>
        </div>
        <div className="flex-shrink-0">
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

export default function Operations() {
  const [logs, setLogs] = useState<SecurityLog[]>(SEED_LOGS);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | Severity | 'unresolved'>('all');
  const animFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to ALL mesh events and inject them into the queue (max 5)
  useEffect(() => {
    const eventTypes = [
      'SYSTEM_ARMED', 'SYSTEM_DISARMED', 'VISION_ALERT', 'SPEECH_COERCION',
      'EMERGENCY_DISPATCH', 'AUDIO_ALERT', 'FALLBACK_QUEUED', 'FALLBACK_FLUSHED',
      'HARDWARE_DIAG', 'GEO_UPDATE', 'NETWORK_RTT',
    ] as const;

    const unsubs = eventTypes.map((type) =>
      mesh.on(type, (event) => {
        const { severity, source, message } = meshEventToLog(event.type);
        const id = String(event.id ?? crypto.randomUUID());
        const newLog: SecurityLog = {
          id,
          severity,
          source,
          message,
          resolved: false,
          createdAt: new Date(event.timestamp),
        };

        setLogs((prev) => {
          const merged = [newLog, ...prev];
          // Keep only the 5 most recent
          return merged.slice(0, MAX_EVENTS);
        });

        // Highlight for 3s
        setNewIds((prev) => new Set(prev).add(id));
        if (animFrameRef.current) clearTimeout(animFrameRef.current);
        animFrameRef.current = setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 3000);
      })
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
      if (animFrameRef.current) clearTimeout(animFrameRef.current);
    };
  }, []);

  const handleResolve = (id: string) => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, resolved: true } : l)));
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
  const criticalCount   = logs.filter((l) => l.severity === 'critical' && !l.resolved).length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">SENTRA</p>
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
          <p className="text-xs text-gray-500">Últimos eventos</p>
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

      {/* Real-time badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        <p className="text-xs text-gray-500">Cola en tiempo real · máx. {MAX_EVENTS} registros · inyección via SentraMesh</p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'unresolved', 'critical', 'warning', 'info'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-400'
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
            <Shield size={36} className="text-gray-700" />
            <p className="text-sm text-gray-500">Sin eventos en esta categoría</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              onResolve={handleResolve}
              isNew={newIds.has(log.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
