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
 */

import {
  PIPEDREAM_ENDPOINT,
  TELEGRAM_CHANNEL_ID,
  TELEGRAM_BOT_TOKEN,
} from '../config';
import type { MeshEventType } from './SentraMesh';

const PIPEDREAM_KEY    = 'sentra_pipedream_url';
const TELEGRAM_ID_KEY  = 'sentra_telegram_chat_id';

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
]);

interface BatchEvent {
  type:      MeshEventType;
  payload:   unknown;
  timestamp: number;
}

class BatchDispatcher {
  private static instance: BatchDispatcher | null = null;

  private queue:      BatchEvent[]         = [];
  private timer:      ReturnType<typeof setTimeout> | null = null;
  private dedupeMap:  Map<string, number>  = new Map(); // key → lastDispatch ms

  private constructor() {}

  static getInstance(): BatchDispatcher {
    if (!BatchDispatcher.instance) BatchDispatcher.instance = new BatchDispatcher();
    return BatchDispatcher.instance;
  }

  /**
   * Attempt to enqueue an event for outbound HTTP dispatch.
   * Returns `false` when the event is suppressed by the debounce window
   * (caller should skip IDB storage and any HTTP work for that event).
   */
  enqueue(type: MeshEventType, payload: unknown): boolean {
    const key      = this.dedupeKey(type, payload);
    const lastSent = this.dedupeMap.get(key) ?? 0;

    if (Date.now() - lastSent < DEBOUNCE_MS) return false; // blocked

    this.queue.push({ type, payload, timestamp: Date.now() });

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
    // Dedupe vision/audio alerts by type + specific label so
    // "person" and "knife" are tracked independently.
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

    // Record dispatch time for all events in this batch
    const now = Date.now();
    batch.forEach((e) => {
      this.dedupeMap.set(this.dedupeKey(e.type, e.payload), now);
    });

    const body = {
      events_batch:    batch,
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
        'X-Bot-Token':      TELEGRAM_BOT_TOKEN,
        'X-Batch':          'true',
        'X-Batch-Count':    String(batch.length),
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    }).catch(() => {
      // Events are already persisted in IDB via SentraMesh — retry is handled there
    });
  }
}

export const batchDispatcher = BatchDispatcher.getInstance();
