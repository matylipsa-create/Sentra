import { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, CheckCircle, Clock, RefreshCw, Zap, WifiOff } from 'lucide-react';
import type { SecurityLog, Severity } from '../types';

const OPERATIONS_ENDPOINT = 'https://eo4xot0qo22mfqm.m.pipedream.net';
const MAX_EVENTS = 5;
const POLL_INTERVAL_MS = 15_000;

// Severity priority for sorting: critical > warning > info
const SEVERITY_RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  info:     { label: 'INFO',    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  warning:  { label: 'ALERTA', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  critical: { label: 'CRÍTICO', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
};

// Regex to extract JSON block between the sentinel markers
const JSON_BLOCK_RE = /={4}JSON_START={4}([\s\S]*?)={4}JSON_END={4}/;

function extractJson(raw: string): unknown {
  const match = JSON_BLOCK_RE.exec(raw);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (err) {
    console.error('[SENTRA] Operations JSON parse error:', err);
    return null;
  }
}

function normalizeEvent(raw: unknown): SecurityLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const message = (r.message ?? r.msg ?? r.description ?? r.text ?? '') as string;
  if (!message) return null;

  const rawSeverity = ((r.severity ?? r.level ?? r.priority ?? 'info') as string).toLowerCase();
  const severity: Severity = rawSeverity === 'critical' ? 'critical'
    : rawSeverity === 'warning' || rawSeverity === 'warn' ? 'warning'
    : 'info';

  return {
    id: (r.id as string) ?? crypto.randomUUID(),
    severity,
    source: (r.source ?? r.agent ?? r.origin ?? 'Sistema') as string,
    message,
    resolved: Boolean(r.resolved ?? false),
    createdAt: r.timestamp ? new Date(r.timestamp as string | number) : new Date(),
  };
}

// Fetch the endpoint, extract JSON, return array of SecurityLog
async function fetchEvents(): Promise<SecurityLog[]> {
  const res = await fetch(OPERATIONS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SENTRA-Version': '3.0' },
    body: JSON.stringify({ event_type: 'OPERATIONS_POLL', timestamp: Date.now() }),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await res.text();
  const parsed = extractJson(text);

  // Accept either an array of events or a single event object
  const items: unknown[] = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return items.map(normalizeEvent).filter(Boolean) as SecurityLog[];
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
    <div className={`rounded-xl border p-3 transition-all duration-500 ${log.resolved ? 'opacity-50' : ''} ${cfg.border} ${cfg.bg} ${isNew ? 'ring-1 ring-blue-400/40' : ''}`}>
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
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [filter, setFilter] = useState<'all' | Severity | 'unresolved'>('all');
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function ingestEvents(incoming: SecurityLog[]) {
    if (!incoming.length) return;

    setLogs((prev) => {
      // Merge by id — don't duplicate
      const existingIds = new Set(prev.map((l) => l.id));
      const novel = incoming.filter((e) => !existingIds.has(e.id));
      if (!novel.length) return prev;

      const merged = [...novel, ...prev];
      // Sort by severity priority desc, then by date desc
      merged.sort((a, b) => {
        const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        return rankDiff !== 0 ? rankDiff : b.createdAt.getTime() - a.createdAt.getTime();
      });
      return merged.slice(0, MAX_EVENTS);
    });

    // Highlight new entries for 3s
    setNewIds((prev) => {
      const next = new Set(prev);
      incoming.forEach((e) => next.add(e.id));
      return next;
    });
    incoming.forEach((e) => {
      const existing = highlightTimers.current.get(e.id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setNewIds((prev) => { const n = new Set(prev); n.delete(e.id); return n; });
        highlightTimers.current.delete(e.id);
      }, 3000);
      highlightTimers.current.set(e.id, t);
    });
  }

  async function poll(isManual = false) {
    if (isManual) setRefreshing(true);
    setFetchStatus('loading');
    try {
      const events = await fetchEvents();
      ingestEvents(events);
      setFetchStatus('ok');
    } catch (err) {
      console.error('[SENTRA] Operations poll failed:', err);
      setFetchStatus('error');
    } finally {
      if (isManual) setRefreshing(false);
    }
  }

  // Initial fetch + polling
  useEffect(() => {
    poll();
    const interval = setInterval(() => poll(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      highlightTimers.current.forEach(clearTimeout);
    };
  }, []);

  const handleResolve = (id: string) => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, resolved: true } : l)));
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
          onClick={() => poll(true)}
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

      {/* Status badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
        {fetchStatus === 'error' ? (
          <>
            <WifiOff size={12} className="text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">Error al contactar Pipedream — reintentando en {POLL_INTERVAL_MS / 1000}s</p>
          </>
        ) : (
          <>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${fetchStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-blue-400 animate-pulse'}`} />
            <p className="text-xs text-gray-500">
              Cola FIFO · máx. {MAX_EVENTS} eventos · orden por prioridad · actualiza cada {POLL_INTERVAL_MS / 1000}s
            </p>
          </>
        )}
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
        {fetchStatus === 'loading' && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <RefreshCw size={28} className="text-blue-400/40 animate-spin" />
            <p className="text-sm text-gray-500">Cargando eventos desde Pipedream...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Shield size={36} className="text-gray-700" />
            <p className="text-sm text-gray-500">
              {fetchStatus === 'error' ? 'Sin datos — fallo de conexión con el endpoint' : 'Sin eventos en esta categoría'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <LogRow key={log.id} log={log} onResolve={handleResolve} isNew={newIds.has(log.id)} />
          ))
        )}
      </div>
    </div>
  );
}
