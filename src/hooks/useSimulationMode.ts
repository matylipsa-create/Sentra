import { useEffect, useRef, useState, useCallback } from 'react';
import { mesh } from '../lib/SentraMesh';
import { useToast } from '../context/ToastContext';

const SIM_KEY = 'sentra_simulation';

const EVENTS = [
  { type: 'VISION_ALERT',       payload: { label: 'person', confidence: 0.91 }, title: 'Visión: Persona detectada', variant: 'warning' as const },
  { type: 'AUDIO_ALERT',        payload: { alerta: 'Sonido inusual detectado' }, title: 'Audio: Alerta acústica', variant: 'warning' as const },
  { type: 'KEYWORD_DETECTED',   payload: { keyword: 'auxilio' },                 title: 'IA: Palabra clave detectada', variant: 'critical' as const },
  { type: 'FACE_DENSITY',       payload: { count: 4 },                           title: 'MDAO-B: Densidad facial', variant: 'info' as const },
  { type: 'FALLBACK_QUEUED',    payload: { reason: 'SIM', count: 1 },             title: 'IDB: Evento encolado', variant: 'info' as const },
  { type: 'FALLBACK_FLUSHED',   payload: { count: 1, latency_ms: 80 },            title: 'IDB: Cola sincronizada', variant: 'success' as const },
];

const INTERVAL_MS = 6000;

export function useSimulationMode() {
  const [active, setActive] = useState<boolean>(() => {
    try { return localStorage.getItem(SIM_KEY) === 'true'; } catch { return false; }
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      const evt = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      mesh.emit(evt.type, evt.payload);
      toast({ title: evt.title, variant: evt.variant });
    }, INTERVAL_MS);
  }, [toast]);

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIM_KEY, String(next)); } catch { /* ignore */ }
      if (next) {
        start();
        toast({ title: 'Modo Simulación activado', message: 'Eventos sintéticos cada 6s', variant: 'info' });
      } else {
        stop();
        toast({ title: 'Modo Simulación desactivado', variant: 'success' });
      }
      return next;
    });
  }, [start, stop, toast]);

  useEffect(() => {
    if (active) start();
    return stop;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { active, toggle };
}
