import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonMode } from '../types';
import { addHistoryEvent, type SentraHistoryEvent } from './useSeedData';

const DEMO_KEY = 'sentra_demo_mode';
const DEMO_INTERVAL_MS = 8_000;
const MAX_EVENTS = 20;

type DemoEventType = 'vision' | 'audio' | 'keyword' | 'movement' | 'fall' | 'eme';

interface DemoEventConfig {
  event: DemoEventType;
  modo: DaemonMode;
  label: string;
  color: string;
}

const EVENT_CONFIGS: DemoEventConfig[] = [
  { event: 'vision',   modo: 'STABILIZE', label: 'Visión: persona detectada',         color: '#ffb300' },
  { event: 'audio',    modo: 'STABILIZE', label: 'Audio: alerta acústica',            color: '#ffb300' },
  { event: 'keyword',  modo: 'SOFT_WARN', label: 'IA: palabra clave detectada',       color: '#ff6b35' },
  { event: 'movement', modo: 'OBSERVE',   label: 'Movimiento: intrusión perimetral',  color: '#6b7fd7' },
  { event: 'fall',     modo: 'SOFT_WARN', label: 'Caída: detección de impacto',        color: '#ff6b35' },
  { event: 'eme',      modo: 'SOFT_WARN', label: 'Emergencia: protocolo activado',     color: '#ff6b35' },
];

const DEMO_DESCRIPTIONS: Record<DemoEventType, string[]> = {
  vision:   ['Persona detectada en zona restringida', 'Vehículo estacionado en acceso norte', 'Movimiento sospechoso en perímetro sur'],
  audio:    ['Sonido metálico cerca del portón', 'Discurso elevado detectado', 'Ruido de impacto en sector oeste'],
  keyword:  ['Palabra clave "AUXILIO" reconocida', 'Término "peligro" detectado en audio', 'Frase de coacción identificada'],
  movement: ['Intrusión en barrera perimetral', 'Tránsito por zona de exclusión', 'Apertura de puerta no autorizada'],
  fall:     ['Impacto vertical — posible caída', 'Acelerómetro: patrón de caída', 'Colisión detectada en sector norte'],
  eme:      ['Protocolo de emergencia activado', 'Código rojo declarado', 'Despacho de unidades iniciado'],
};

const DEMO_COORDS = [
  '-38.0055, -57.5426',
  '-34.6037, -58.3816',
  '-38.0123, -57.5380',
  '-34.5989, -58.4201',
];

function randomConfidence(): string {
  return `${Math.floor(70 + Math.random() * 30)}%`;
}

function randomCoords(): string {
  return DEMO_COORDS[Math.floor(Math.random() * DEMO_COORDS.length)];
}

export function useDemoEventGenerator() {
  const [demoActive, setDemoActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEMO_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateEvent = useCallback(() => {
    const cfg = EVENT_CONFIGS[Math.floor(Math.random() * EVENT_CONFIGS.length)];
    const descriptions = DEMO_DESCRIPTIONS[cfg.event];
    const descripcion = descriptions[Math.floor(Math.random() * descriptions.length)];

    const ev: SentraHistoryEvent = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      coords: randomCoords(),
      modo: cfg.label.split(':')[0].toUpperCase(),
      descripcion,
      confianza: randomConfidence(),
    };

    addHistoryEvent(ev);

    window.dispatchEvent(new CustomEvent('sentra_demo_event', {
      detail: { ...cfg, ...ev },
    }));
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoActive((prev) => {
      const next = !prev;
      try { localStorage.setItem(DEMO_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (demoActive) {
      generateEvent();
      intervalRef.current = setInterval(generateEvent, DEMO_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [demoActive, generateEvent]);

  return { demoActive, toggleDemo };
}
