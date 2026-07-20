import { openDB, type IDBPDatabase } from 'idb';
import {
  PIPEDREAM_ENDPOINT,
  TELEGRAM_CHANNEL_ID,
  RTT_THRESHOLD_MS,
  MAX_RETRIES,
  FLUSH_INTERVAL_MS,
  CACHE_PURGE_AGE_MS,
} from '../config';
import { batchDispatcher } from './batchDispatcher';
import { computeConfidence } from './eventConfidence';

const TELEGRAM_ID_KEY = 'sentra_telegram_chat_id';
const PIPEDREAM_KEY   = 'sentra_pipedream_url';

// Returns runtime-overridden config values, falling back to compile-time defaults.
function getRuntimeConfig(): { endpoint: string; channelId: string } {
  const endpoint  = localStorage.getItem(PIPEDREAM_KEY)   || PIPEDREAM_ENDPOINT;
  const channelId = localStorage.getItem(TELEGRAM_ID_KEY) || TELEGRAM_CHANNEL_ID;
  return { endpoint, channelId };
}

export type MeshEventType =
  | 'SYSTEM_ARMED'
  | 'SYSTEM_DISARMED'
  | 'USER_INTERACTION'         // Diff #4 — reemplaza pipedreamOrchestrator.dispatchInteraction
  | 'KEYWORD_DETECTED'         // Fase 2 — palabras clave detectadas por el worker de IA
  | 'VISION_ALERT'
  | 'SPEECH_COERCION'
  | 'EMERGENCY_DISPATCH'
  | 'GEO_UPDATE'
  | 'HARDWARE_DIAG'
  | 'NETWORK_RTT'
  | 'FALLBACK_QUEUED'
  | 'FALLBACK_FLUSHED'
  | 'CAMERA_PERMISSION_DENIED'
  | 'AUDIO_ALERT'
  // ── MDAO adversarial detection events ────────────────────────────────────
  | 'ADVERSARIAL_GARMENT'   // silhouette + non-human label → anti-AI clothing
  | 'FACE_DENSITY'          // ≥3 clustered person detections (HyperFace)
  | 'IR_SABOTAGE';          // sudden full-white sector (optical sabotage)

export interface MeshEvent {
  id?: number;
  type: MeshEventType;
  payload: unknown;
  timestamp: number;
  sent: boolean;
  retries: number;
}

export interface CerebroPayload {
  event_type: MeshEventType;
  timestamp: number;
  channel_id: string;
  data: unknown;
  sentra_version: '3.0';
}

type Handler = (event: MeshEvent) => void;

const DB_NAME = 'sentra_mesh_v3';
const STORE   = 'events';

class SentraMesh {
  private static instance: SentraMesh | null = null;
  private db: IDBPDatabase | null = null;
  private handlers = new Map<MeshEventType, Set<Handler>>();
  private rtt = 0;

  private constructor() {}

  static getInstance(): SentraMesh {
    if (!SentraMesh.instance) SentraMesh.instance = new SentraMesh();
    return SentraMesh.instance;
  }

  async init(): Promise<void> {
    this.db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('sent', 'sent');
          store.createIndex('type', 'type');
        }
      },
    });
    this.flushLoop();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flushNow());
    }
  }

  on(type: MeshEventType, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  /**
   * Emit a mesh event.
   *
   * Flow:
   *  1. notify()  — fires all local handlers synchronously (visual updates always happen)
   *  2. batchDispatcher.enqueue() — checks 30 s debounce; returns false when suppressed
   *  3. If accepted: store in IDB for reliable retry on failed HTTP calls
   *
   * batchDispatcher handles HTTP dispatch (batched 15 s window or immediate for criticals).
   * flushLoop provides the retry safety-net for any failed dispatches from the batch.
   */
  async emit(type: MeshEventType, payload: unknown): Promise<void> {
    const confidence = computeConfidence(type, payload);
    const stamped = { ...(payload as object), confidence };

    const event: MeshEvent = {
      type,
      payload: stamped,
      timestamp: Date.now(),
      sent: false,
      retries: 0,
    };

    // Always fire local handlers — UI updates are never debounce-suppressed
    this.notify(event);

    // Persistimos primero en IDB para tener un id que pasarle al dispatcher.
    // El dispatcher se encarga de marcar este id como `sent: true` cuando el
    // batch sale con éxito (o cuando el evento queda suprimido por debounce).
    let idbId: number | undefined;
    if (this.db) {
      const id = await this.db.add(STORE, event);
      idbId = id as number;
      event.id = idbId;
    }

    // Route through batch dispatcher; returns false when debounced.
    batchDispatcher.enqueue(type, stamped, idbId);
  }

  // Direct Cerebro dispatch — used only by flushLoop for IDB retries
  async dispatchToCerebro(
    payload: CerebroPayload,
    sourceEvent?: MeshEvent,
    endpoint?: string,
    channelId?: string,
  ): Promise<boolean> {
    const url     = endpoint  ?? getRuntimeConfig().endpoint;
    const channel = channelId ?? getRuntimeConfig().channelId;

    if (!navigator.onLine) {
      await this.enqueueRetry(sourceEvent);
      return false;
    }

    const rttOk = this.rtt < RTT_THRESHOLD_MS || this.rtt === 0;
    if (!rttOk) {
      await this.enqueueRetry(sourceEvent);
      this.emit('FALLBACK_QUEUED', { reason: 'RTT_EXCEEDED', rtt: this.rtt });
      return false;
    }

    try {
      const start = performance.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':     'application/json',
          'X-SENTRA-Version': '3.0',
          'X-Channel-ID':     channel,
        },
        body: JSON.stringify({ ...payload, channel_id: channel }),
        signal: AbortSignal.timeout(RTT_THRESHOLD_MS * 3),
      });
      this.rtt = performance.now() - start;

      if (res.ok || res.status < 500) {
        if (sourceEvent) await this.markSent(sourceEvent);
        return true;
      }
      await this.enqueueRetry(sourceEvent);
      return false;
    } catch {
      this.rtt = 9999;
      await this.enqueueRetry(sourceEvent);
      return false;
    }
  }

  private async enqueueRetry(event?: MeshEvent): Promise<void> {
    if (!this.db || !event?.id) return;
    const tx     = this.db.transaction(STORE, 'readwrite');
    const stored = await tx.store.get(event.id);
    if (stored) await tx.store.put({ ...stored, retries: stored.retries + 1 });
    await tx.done;
  }

  private notify(event: MeshEvent): void {
    this.handlers.get(event.type)?.forEach((h) => {
      try { h(event); } catch { /* isolate handler errors */ }
    });
  }

  private async markSent(event: MeshEvent): Promise<void> {
    if (!this.db || !event.id) return;
    const tx     = this.db.transaction(STORE, 'readwrite');
    const stored = await tx.store.get(event.id);
    if (stored) await tx.store.put({ ...stored, sent: true });
    await tx.done;
  }

  private async flushLoop(): Promise<void> {
    const flush = async () => { void this.flushNow(); };
    setInterval(flush, FLUSH_INTERVAL_MS);
    await this.flushNow();
  }

  private async flushNow(): Promise<void> {
    if (!this.db || !navigator.onLine) return;
    const unsent = await this.db.getAllFromIndex(STORE, 'sent', IDBKeyRange.only(false));
    let flushed = 0;
    for (const event of unsent) {
      if (event.retries >= MAX_RETRIES) continue;
      const ok = await this.dispatchToCerebro(
        {
          event_type:     event.type,
          timestamp:      event.timestamp,
          channel_id:     getRuntimeConfig().channelId,
          data:           event.payload,
          sentra_version: '3.0',
        },
        event
      );
      if (ok) flushed++;
    }
    if (flushed > 0) {
      this.notify({
        type:      'FALLBACK_FLUSHED',
        payload:   { count: flushed },
        timestamp: Date.now(),
        sent:      true,
        retries:   0,
      });
    }
    await this.purgeOld();
  }

  private async purgeOld(): Promise<void> {
    if (!this.db) return;
    const cutoff = Date.now() - CACHE_PURGE_AGE_MS;
    const all    = await this.db.getAll(STORE);
    const tx     = this.db.transaction(STORE, 'readwrite');
    for (const e of all) {
      if (e.sent && e.timestamp < cutoff) await tx.store.delete(e.id);
    }
    await tx.done;
  }

  measureRTT(): void {
    const { endpoint } = getRuntimeConfig();
    const start = performance.now();
    fetch(endpoint, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
      .then(() => { this.rtt = performance.now() - start; })
      .catch(() => { this.rtt = 9999; });
  }

  getRTT(): number { return this.rtt; }

  async getPendingCount(): Promise<number> {
    if (!this.db) return 0;
    const unsent = await this.db.getAllFromIndex(STORE, 'sent', IDBKeyRange.only(false));
    return unsent.length;
  }

  async getAllEvents(): Promise<MeshEvent[]> {
    if (!this.db) return [];
    return this.db.getAll(STORE);
  }

  async clearAllEvents(): Promise<void> {
    if (!this.db) return;
    await this.db.clear(STORE);
  }
}

export const mesh = SentraMesh.getInstance();
