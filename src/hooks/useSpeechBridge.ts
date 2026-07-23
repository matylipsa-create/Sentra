/**
 * useSpeechBridge — puente único entre Web Speech API (main thread) y el
 * worker sentraIA (análisis de coerción + keywords).
 *
 * Fase 2 (auditoría 2026-01) — objetivo:
 *   • UNA sola instancia global de webkitSpeechRecognition en toda la app.
 *   • CERO lógica de matching en el main thread (todo vive en el worker).
 *   • El worker emite al main thread; el main thread emite al mesh.
 *
 * Consumidores:
 *   • SentraHUD activa el bridge cuando `armed === true`.
 *   • SentraIAPanel lee `lastTranscript` para mostrar en HUD.
 *   • Sustituye la lógica de SpeechRecognition que vivía en AudioEngine y en
 *     SentraIAPanel (dos instancias en conflicto).
 */
import { useEffect, useRef, useState } from 'react';
import { mesh } from '../lib/SentraMesh';
import type { GeoState } from './useSentraCore';

interface SpeechBridgeArgs {
  active: boolean;
  geo:    GeoState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRec = any;

export function useSpeechBridge({ active, geo }: SpeechBridgeArgs) {
  const [listening,      setListening]      = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');

  const recRef       = useRef<AnySpeechRec>(null);
  const workerRef    = useRef<Worker | null>(null);
  const mountedRef   = useRef(false);
  const geoRef       = useRef<GeoState>(geo);
  geoRef.current     = geo;

  useEffect(() => {
    // Detach cuando no está armado
    if (!active) return;

    const SpeechRec =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    mountedRef.current = true;

    // ── Worker ────────────────────────────────────────────────────────────
    const worker = new Worker(
      new URL('../workers/sentraIA.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<{
      type:       'KEYWORD_DETECTED' | 'COERCION_DETECTED' | 'SILENT_TRIGGER' | 'TRANSCRIPT';
      transcript: string;
      keyword?:   string;
      matched?:   string[];
      timestamp:  number;
    }>) => {
      const msg = e.data;
      setLastTranscript(msg.transcript);

      if (msg.type === 'KEYWORD_DETECTED' && msg.keyword) {
        mesh.emit('KEYWORD_DETECTED', {
          keyword:   msg.keyword,
          transcript: msg.transcript,
          ubicacion: {
            latitude:  geoRef.current.latitude,
            longitude: geoRef.current.longitude,
            address:   geoRef.current.address,
          },
          timestamp: msg.timestamp,
        });
      } else if (msg.type === 'SILENT_TRIGGER') {
        mesh.emit('SPEECH_COERCION', {
          transcript:      msg.transcript,
          isSilentTrigger: true,
          matched:         [],
          timestamp:       msg.timestamp,
        });
      } else if (msg.type === 'COERCION_DETECTED') {
        mesh.emit('SPEECH_COERCION', {
          transcript:      msg.transcript,
          isSilentTrigger: false,
          matched:         msg.matched ?? [],
          timestamp:       msg.timestamp,
        });
      }
      // TRANSCRIPT limpio → solo actualiza lastTranscript (arriba)
    };

    workerRef.current = worker;

    // ── SpeechRecognition (instancia única) ──────────────────────────────
    const rec: AnySpeechRec = new SpeechRec();
    rec.lang            = 'es-AR';
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      // Concatenar todas las alternativas del último batch de resultados
      const transcript = Array.from(ev.results as ArrayLike<unknown>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join(' ');
      if (!transcript.trim()) return;
      worker.postMessage({ type: 'ANALYZE_TRANSCRIPT', transcript });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (ev: any) => {
      // 'no-speech' es benigno; otros errores → reinicio a los 2 s
      if (ev.error !== 'no-speech' && mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) {
            try { rec.start(); } catch { /* already started */ }
          }
        }, 2000);
      }
    };

    rec.onend = () => {
      if (mountedRef.current) {
        try { rec.start(); } catch { /* already running */ }
      } else {
        setListening(false);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      /* start() falla si ya hay una recognition activa — no debería pasar
         porque el bridge es singleton, pero cubrimos el edge case. */
    }

    return () => {
      mountedRef.current = false;
      try { rec.stop(); } catch { /* noop */ }
      worker.terminate();
      recRef.current    = null;
      workerRef.current = null;
      setListening(false);
    };
  }, [active]);

  return { listening, lastTranscript };
}
