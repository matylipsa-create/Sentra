import { useCallback, useRef, useState } from 'react';
import type { DaemonMode } from '../types';

const LS_KEY = 'sentra_session_metrics_v1';

export interface SessionEvent {
  time: string;
  mode: DaemonMode;
  label: string;
  event: string;
  color: string;
}

export interface SessionMetrics {
  ASSIST: number;
  STABILIZE: number;
  SOFT_WARN: number;
  OBSERVE: number;
}

export interface LifetimeData {
  session_count: number;
  metrics: SessionMetrics;
  last_session_id: string | null;
}

export const MODE_COLORS: Record<DaemonMode, string> = {
  ASSIST:    '#00e676',
  STABILIZE: '#ffb300',
  SOFT_WARN: '#ff6b35',
  OBSERVE:   '#6b7fd7',
};

const EMPTY: SessionMetrics = { ASSIST: 0, STABILIZE: 0, SOFT_WARN: 0, OBSERVE: 0 };

function loadLifetime(): LifetimeData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LifetimeData>;
      if (parsed && typeof parsed === 'object') {
        return {
          session_count: parsed.session_count || 0,
          metrics:       { ...EMPTY, ...parsed.metrics },
          last_session_id: parsed.last_session_id || null,
        };
      }
    }
  } catch { /* corrupted */ }
  return { session_count: 0, metrics: { ...EMPTY }, last_session_id: null };
}

export function useSessionMetrics() {
  const bootTimeRef = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>(`SNT-${bootTimeRef.current.toString(36).toUpperCase()}`);

  const [metrics, setMetrics] = useState<SessionMetrics>({ ...EMPTY });
  const [history, setHistory] = useState<SessionEvent[]>([]);
  const [lifetime, setLifetime] = useState<LifetimeData>(() => {
    const lt = loadLifetime();
    const next: LifetimeData = {
      session_count: lt.session_count + 1,
      metrics:       lt.metrics,
      last_session_id: sessionIdRef.current,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const recordEvent = useCallback((mode: DaemonMode, label: string, event: string) => {
    const color = MODE_COLORS[mode];
    const entry: SessionEvent = {
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      mode, label, event, color,
    };
    setHistory((prev) => [...prev.slice(-49), entry]);
    setMetrics((prev) => ({ ...prev, [mode]: prev[mode] + 1 }));
    setLifetime((prev) => {
      const next: LifetimeData = {
        ...prev,
        metrics: { ...prev.metrics, [mode]: prev.metrics[mode] + 1 },
      };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setMetrics({ ...EMPTY });
    setHistory([]);
  }, []);

  const resetLifetime = useCallback(() => {
    const fresh: LifetimeData = {
      session_count: 1,
      metrics: { ...EMPTY },
      last_session_id: sessionIdRef.current,
    };
    setLifetime(fresh);
    try { localStorage.setItem(LS_KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
    setMetrics({ ...EMPTY });
    setHistory([]);
  }, []);

  const durationSec = Math.floor((Date.now() - bootTimeRef.current) / 1000);

  const buildSessionData = useCallback(() => {
    const total = Object.values(metrics).reduce((a, b) => a + b, 0);
    const lifetimeTotal = Object.values(lifetime.metrics).reduce((a, b) => a + b, 0);
    return {
      product: 'Sentinel',
      version: 'integrated_v1',
      session_id: sessionIdRef.current,
      session_number: lifetime.session_count,
      generated_at: new Date().toISOString(),
      duration_sec: durationSec,
      current_mode: 'ASSIST' as DaemonMode,
      metrics,
      total_events: total,
      lifetime_metrics: { ...lifetime.metrics },
      lifetime_total: lifetimeTotal,
      history,
    };
  }, [metrics, lifetime, history, durationSec]);

  return {
    metrics,
    history,
    lifetime,
    sessionId: sessionIdRef.current,
    recordEvent,
    clearSession,
    resetLifetime,
    buildSessionData,
  };
}
