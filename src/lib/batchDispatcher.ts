/**
 * BatchDispatcher — Anti-flood layer between SentraMesh and Pipedream.
 *
 * Rules:
 *  • Non-critical events accumulate for up to BATCH_INTERVAL_MS (15 s), then
 *    ship as a single "events_batch" payload.
 *  • Critical events (ALERT/CODE_RED triggers) break the timer and dispatch
 *    immediately in a one-shot call.
 *  • Identical events are suppressed for DEBOUNCE_MS (30 s) — the HUD still
 *    updates visually via mesh.notify(); only the outbound HTTP is blocked.
 *  • channel_id is always read from localStorage at flush time so Settings
 *    changes take effect on the very next batch.
 *  • Tras una respuesta HTTP exitosa del batch, el dispatcher marca como
 *    `sent: true` los registros de IDB cuyos `idbId` componían el batch.
 *    Esto evita que `SentraMesh.flushLoop` los reenvíe individualmente.
 *    (Bug #1 — auditoría 2026-01)
 */

import { openDB } from 'idb';
import {
  PIPEDREAM_ENDPOINT,
  TELEGRAM_CHANNEL_ID,
} from '../config';
import type { MeshEventType } from './SentraMesh';

const PIPEDREAM_KEY    = 'sentra_pipedream_url';
const TELEGRAM_ID_KEY  = 'sentra_telegram_chat_id';

// IDB constants — must match SentraMesh
const DB_NAME = 'sentra_mesh_v3';
const STORE   = 'events';

export const BATCH_INTERVAL_MS = 15_000;
export const DEBOUNCE_MS       = 30_000;

// These bypass the 15 s window and dispatch as a one-shot payload immediately.
const CRITICAL_TYPES = new Set<MeshEventType>([
  'VISION_ALERT',
  'SPEECH_COERCION',
  'EMERGENCY_DISPATCH',
  'ADVERSARIAL_GARMENT',
  'FACE_DENSITY',
  'IR_SABOTAGE',
  'AUDIO_ALERT',
  'KEYWORD_DETECTED',   // Fase 2 — palabra clave = alta prioridad, flush inmediato
]);

interface BatchEvent {
  type:      MeshEventType;
  payload:   unknown;
  timestamp: number;
  idbId?:    number;
}

class BatchDispatcher {
  private static instance: BatchDispatcher | null = null;

  private queue:      BatchEvent[]         = [];
  private timer:      ReturnType<typeof setTimeout> | null = null;
  private dedupeMap:  Map<string, number>  = new Map();

  private constructor() {}

  static getInstance(): BatchDispatcher {
    if (!BatchDispatcher.instance) BatchDispatcher.instance = new BatchDispatcher();
    return BatchDispatcher.instance;
  }

  /**
   * Attempt to enqueue an event for outbound HTTP dispatch.
   * Returns `false` when the event is suppressed by the debounce window
   * (caller should still rely on its own IDB persistence — this dispatcher
   *  marks the duplicate as sent itself, see `markSent` below).
   *
   * @param idbId  ID del registro persistido por SentraMesh; permite que el
   *               dispatcher marque el evento como `sent: true` tras flush OK.
   */
  enqueue(type: MeshEventType, payload: unknown, idbId?: number): boolean {
    const key      = this.dedupeKey(type, payload);
    const lastSent = this.dedupeMap.get(key) ?? 0;

    if (Date.now() - lastSent < DEBOUNCE_MS) {
      // Evento duplicado en la ventana de debounce. NO sale por HTTP, pero
      // hay que liberar el registro de IDB para que el flushLoop no lo levante.
      if (idbId !== undefined) void this.markSent([idbId]);
      return false;
    }

    this.queue.push({ type, payload, timestamp: Date.now(), idbId });

    if (CRITICAL_TYPES.has(type)) {
      this.flushImmediate();
    } else {
      this.scheduleFlush();
    }
    return true;
  }

  // Exported so SentraHUD can show pending-batch count in System Health
  getPendingCount(): number { return this.queue.length; }

  // ── Private ──────────────────────────────────────────────────────────────

  private dedupeKey(type: MeshEventType, payload: unknown): string {
    if (type === 'VISION_ALERT' || type === 'ADVERSARIAL_GARMENT') {
      const p = payload as { label?: string; anomalyType?: string };
      return `${type}:${p.label ?? p.anomalyType ?? ''}`;
    }
    if (type === 'AUDIO_ALERT') {
      const p = payload as { alerta?: string };
      return `${type}:${p.alerta ?? ''}`;
    }
    return type;
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => this.flush(), BATCH_INTERVAL_MS);
  }

  private flushImmediate(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.flush();
  }

  private flush(): void {
    this.timer = null;
    if (!this.queue.length) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const batch     = this.queue.splice(0);
    const channelId = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(TELEGRAM_ID_KEY)
      : null) ?? TELEGRAM_CHANNEL_ID;
    const endpoint  = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(PIPEDREAM_KEY)
      : null) ?? PIPEDREAM_ENDPOINT;

    const now = Date.now();
    batch.forEach((e) => {
      this.dedupeMap.set(this.dedupeKey(e.type, e.payload), now);
    });

    const idsToMark = batch
      .map((e) => e.idbId)
      .filter((id): id is number => typeof id === 'number');

    const body = {
      events_batch:    batch.map(({ idbId: _omit, ...rest }) => rest),
      channel_id:      channelId,
      sentra_version:  '3.0',
      batch_timestamp: now,
      batch_count:     batch.length,
    };

    fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-SENTRA-Version': '3.0',
        'X-Channel-ID':     channelId,
        'X-Batch':          'true',
        'X-Batch-Count':    String(batch.length),
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    })
      .then((res) => {
        // 2xx OK, 4xx = payload inválido (no insistir). 5xx = retry vía flushLoop.
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          return this.markSent(idsToMark);
        }
        // 5xx: no marcar, SentraMesh.flushLoop reintentará.
      })
      .catch(() => {
        // Red caída / abort. Eventos persisten unsent → SentraMesh reintenta.
      });
  }

  /**
   * Marca registros de IDB como `sent: true` para que `SentraMesh.flushLoop`
   * no los reenvíe. Idempotente y resistente a errores (corre fire-and-forget).
   */
  private async markSent(ids: number[]): Promise<void> {
    if (!ids.length) return;
    try {
      const db = await openDB(DB_NAME, 1);
      const tx = db.transaction(STORE, 'readwrite');
      await Promise.all(
        ids.map(async (id) => {
          const stored = await tx.store.get(id);
          if (stored && !stored.sent) {
            await tx.store.put({ ...stored, sent: true });
          }
        }),
      );
      await tx.done;
      db.close();
    } catch {
      // Si IDB no está disponible, el peor caso es un reenvío del flushLoop.
    }
  }
}

export const batchDispatcher = BatchDispatcher.getInstance();
