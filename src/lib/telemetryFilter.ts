/**
 * telemetryFilter — Canal de telemetría minimalista para el sistema táctico.
 *
 * Reglas (auditoría 2026-01):
 *   • Envía a PIPEDREAM_TELEMETRY_ENDPOINT si y solo si:
 *       - bpm >= 110, o
 *       - alert_type === 'CRITICAL'
 *   • Modo silencioso: bpm < 110 && alert_type === 'NORMAL' → no envía.
 *   • Throttle: durante anomalías sostenidas se envía como MÁXIMO 1 vez
 *     cada 5 s (TELEMETRY_THROTTLE_MS). Los eventos dentro de la ventana se
 *     descartan silenciosamente. Protege el costo de cómputo del destino.
 *   • Payload minimalista: { bpm: <int>, alert_type: 'NORMAL' | 'CRITICAL' }
 *   • Content-Type: application/json
 *   • Timeout: 2 s
 *   • Sin reintentos. Fallo → descarte inmediato.
 *
 * Este canal es INDEPENDIENTE del BatchDispatcher / SentraMesh y no
 * persiste en IndexedDB — el objetivo es mínimo consumo, no durabilidad.
 */

import { PIPEDREAM_TELEMETRY_ENDPOINT } from '../config';

export const TELEMETRY_ENDPOINT      = PIPEDREAM_TELEMETRY_ENDPOINT;
export const TELEMETRY_BPM_THRESHOLD = 110;
export const TELEMETRY_TIMEOUT_MS    = 2_000;
export const TELEMETRY_THROTTLE_MS   = 5_000;

export type TelemetryAlertType = 'NORMAL' | 'CRITICAL';

export interface TelemetryInput {
  bpm:        number;
  alert_type: TelemetryAlertType;
}

/**
 * Gate puro (fácil de testear). Retorna `true` si el evento cumple el
 * umbral y debería enviarse; `false` en modo silencioso.
 * NO aplica throttle — la decisión de ritmo la toma `sendTelemetry`.
 */
export function shouldSendTelemetry(input: TelemetryInput): boolean {
  const bpmAnomalous  = Number.isFinite(input.bpm) && input.bpm >= TELEMETRY_BPM_THRESHOLD;
  const alertCritical = input.alert_type === 'CRITICAL';
  return bpmAnomalous || alertCritical;
}

// ── Estado del throttle (a nivel módulo) ───────────────────────────────────
// Timestamp del último POST despachado. Se comparte entre TODAS las
// llamadas a sendTelemetry (canal único global).
let lastSentAt = 0;

/** Helper de test — resetea el estado del throttle. */
export function resetTelemetryThrottle(): void {
  lastSentAt = 0;
}

/**
 * Envía la telemetría respetando el gate y el throttle de 5 s.
 * Fire-and-forget.
 *
 * @returns Promise<boolean>
 *   `true`  → se despachó un POST (independiente del resultado HTTP)
 *   `false` → silenciado (por gate o por throttle)
 */
export async function sendTelemetry(input: TelemetryInput): Promise<boolean> {
  if (!shouldSendTelemetry(input)) return false;

  // Throttle: como MÁXIMO 1 envío cada 5 s en modo alerta sostenida.
  const now = Date.now();
  if (now - lastSentAt < TELEMETRY_THROTTLE_MS) return false;
  lastSentAt = now;

  const payload = {
    bpm:        Math.trunc(input.bpm),
    alert_type: input.alert_type,
  };

  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
    });
  } catch {
    // Descarte inmediato. Sin retry, sin logging (mínima huella).
  }
  return true;
}
