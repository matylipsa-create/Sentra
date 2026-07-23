import { useEffect, useState } from 'react';

export interface SentraSource {
  id: string;
  name: string;
  tipo: 'frigate' | 'camera' | 'sensor';
  url: string;
  status: 'online' | 'offline';
}

export interface SentraHistoryEvent {
  id: string;
  timestamp: string;
  coords: string;
  modo: string;
  descripcion: string;
  confianza: string;
}

const SOURCES_KEY = 'sentra_sources';
const HISTORY_KEY = 'sentra_history';

const DEFAULT_SOURCE: SentraSource = {
  id: 'SENTRA-07',
  name: 'SENTRA-07',
  tipo: 'frigate',
  url: 'http://192.168.0.107:8090',
  status: 'online',
};

const SEED_EVENT: SentraHistoryEvent = {
  id: 'seed-001',
  timestamp: '2026-07-23T03:04:00',
  coords: '-38.0055, -57.5426',
  modo: 'EMERGENCY',
  descripcion: 'Persona detectada en zona restringida',
  confianza: '94%',
};

export function useSeedData() {
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SOURCES_KEY)) {
        localStorage.setItem(SOURCES_KEY, JSON.stringify([DEFAULT_SOURCE]));
      }
      if (!localStorage.getItem(HISTORY_KEY)) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify([SEED_EVENT]));
      }
    } catch {
      /* storage unavailable */
    }
    setSeeded(true);
  }, []);

  return { seeded };
}

export function getSources(): SentraSource[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    return raw ? (JSON.parse(raw) as SentraSource[]) : [];
  } catch {
    return [];
  }
}

export function getHistory(): SentraHistoryEvent[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SentraHistoryEvent[]) : [];
  } catch {
    return [];
  }
}

export function addHistoryEvent(ev: SentraHistoryEvent) {
  try {
    const current = getHistory();
    const next = [...current, ev].slice(-20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
