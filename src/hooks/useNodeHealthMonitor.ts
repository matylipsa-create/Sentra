import { useCallback, useEffect, useRef, useState } from 'react';

export type HealthStatus = 'active' | 'down';

export interface NodeHealth {
  id: string;
  label: string;
  kind: 'node' | 'sensor';
  status: HealthStatus;
  lastSeen: number;
}

export interface FailureLogEntry {
  id: string;
  label: string;
  kind: 'node' | 'sensor';
  timestamp: string;
  message: string;
}

const MONITOR_KEY = 'sentra_failure_log_v1';
const POLL_INTERVAL_MS = 5_000;
const MAX_LOG = 200;

const INITIAL_HEALTH: NodeHealth[] = [
  { id: 'zte',        label: 'ZTE',        kind: 'node',   status: 'active', lastSeen: Date.now() },
  { id: 'pc',         label: 'PC',         kind: 'node',   status: 'active', lastSeen: Date.now() },
  { id: 'rpi',        label: 'RaspberryPi',kind: 'node',   status: 'active', lastSeen: Date.now() },
  { id: 'camera',     label: 'Cámara',     kind: 'sensor', status: 'active', lastSeen: Date.now() },
  { id: 'microphone', label: 'Micrófono',  kind: 'sensor', status: 'active', lastSeen: Date.now() },
  { id: 'gps',        label: 'GPS',        kind: 'sensor', status: 'active', lastSeen: Date.now() },
];

function loadFailureLog(): FailureLogEntry[] {
  try {
    const raw = localStorage.getItem(MONITOR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-MAX_LOG);
    }
  } catch { /* corrupted */ }
  return [];
}

function saveFailureLog(log: FailureLogEntry[]) {
  try {
    localStorage.setItem(MONITOR_KEY, JSON.stringify(log.slice(-MAX_LOG)));
  } catch { /* ignore */ }
}

// Simulated reliability weights — real probes could replace these later.
const RELIABILITY: Record<string, number> = {
  zte: 0.94, pc: 0.97, rpi: 0.90,
  camera: 0.92, microphone: 0.95, gps: 0.93,
};

export function useNodeHealthMonitor() {
  const [health, setHealth] = useState<NodeHealth[]>(INITIAL_HEALTH);
  const [failureLog, setFailureLog] = useState<FailureLogEntry[]>(() => loadFailureLog());
  const [sessionFailures, setSessionFailures] = useState(0);
  const healthRef = useRef(health);
  healthRef.current = health;

  const logFailure = useCallback((node: NodeHealth) => {
    const entry: FailureLogEntry = {
      id: `${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: node.label,
      kind: node.kind,
      timestamp: new Date().toISOString(),
      message: `${node.kind === 'node' ? 'Nodo' : 'Sensor'} ${node.label} caído`,
    };
    setFailureLog((prev) => {
      const next = [...prev, entry].slice(-MAX_LOG);
      saveFailureLog(next);
      return next;
    });
    setSessionFailures((c) => c + 1);
    console.error(`[SENTRA Monitor] ${entry.message} — ${entry.timestamp}`);
  }, []);

  useEffect(() => {
    const poll = () => {
      const now = Date.now();
      setHealth((prev) =>
        prev.map((item) => {
          const reliability = RELIABILITY[item.id] ?? 0.9;
          const isDown = Math.random() > reliability;

          if (isDown && item.status === 'active') {
            const downed: NodeHealth = { ...item, status: 'down', lastSeen: now };
            logFailure(downed);
            return downed;
          }
          // Recovery: a down node has a chance to come back
          if (!isDown && item.status === 'down') {
            return { ...item, status: 'active', lastSeen: now };
          }
          return { ...item, lastSeen: now };
        }),
      );
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [logFailure]);

  const resetFailures = useCallback(() => {
    setSessionFailures(0);
  }, []);

  return { health, failureLog, sessionFailures, resetFailures };
}
