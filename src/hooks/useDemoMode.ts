import { useState } from 'react';
import { mesh } from '../lib/SentraMesh';
import type { GeoState } from './useSentraCore';

type LogLevel = 'sys' | 'warn' | 'crit' | 'ok' | 'net';
type LogFn = (msg: string, level: LogLevel) => void;

interface DemoOptions {
  arm: () => Promise<void>;
  armed: boolean;
  addLog: LogFn;
  geo: GeoState;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useDemoMode() {
  const [isRunning, setIsRunning] = useState(false);

  const run = async ({ arm, armed, addLog, geo }: DemoOptions) => {
    if (isRunning) return;
    setIsRunning(true);

    try {
      // Step 0: Arm if needed
      if (!armed) {
        addLog('[DEMO] Armando sistema automáticamente...', 'sys');
        await arm();
        await delay(1400);
      }

      addLog('[DEMO] ▶ Secuencia de demostración iniciada', 'sys');
      await delay(1600);

      // Step 1: Vision detection
      await mesh.emit('VISION_ALERT', { label: 'person', confidence: 0.93 });
      addLog('🟠 VISIÓN: PERSONA detectada — confianza 93%', 'crit');
      await delay(2400);

      // Step 2: Audio keyword
      await mesh.emit('AUDIO_ALERT', {
        alerta: 'PALABRA CLAVE: AUXILIO',
        timestamp: new Date().toISOString(),
        ubicacion: {
          latitude:  geo.latitude,
          longitude: geo.longitude,
          address:   geo.address,
        },
      });
      addLog('🔴 AUDIO: Palabra clave crítica — "AUXILIO"', 'crit');
      await delay(2800);

      // Step 3: Speech coercion → CODE RED
      await mesh.emit('SPEECH_COERCION', { isSilentTrigger: true, transcript: '[demo-trigger]' });
      addLog('🚨 IA: CÓDIGO ROJO — Protocolo silencioso activo', 'crit');
      await delay(3200);

      // Step 4: Emergency dispatch
      await mesh.emit('EMERGENCY_DISPATCH', { dispatched: true, channel: 'Telegram', demo: true });
      addLog('📡 DISPATCH → Pipedream OK · Telegram notificado', 'net');
      await delay(2200);

      // Step 5: IDB queue and flush
      await mesh.emit('FALLBACK_QUEUED', { reason: 'DEMO_SEQUENCE', count: 3 });
      addLog('💾 IDB: 3 eventos encolados en FIFO IndexedDB', 'warn');
      await delay(2000);

      await mesh.emit('FALLBACK_FLUSHED', { count: 3, latency_ms: 142 });
      addLog('✅ IDB: Cola vaciada — sincronización completada', 'ok');
      await delay(1800);

      addLog('[DEMO] ■ Secuencia finalizada — sistema estabilizado', 'ok');
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, run };
}
