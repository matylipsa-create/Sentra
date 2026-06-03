import { openDB, type IDBPDatabase } from 'idb';
import {
  PIPEDREAM_ENDPOINT,
  TELEGRAM_CHANNEL_ID,
  TELEGRAM_BOT_TOKEN,
  RTT_THRESHOLD_MS,
  MAX_RETRIES,
  FLUSH_INTERVAL_MS,
  CACHE_PURGE_AGE_MS,
} from '../config';

export type MeshEventType =
  | 'SYSTEM_ARMED'
  | 'SYSTEM_DISARMED'
  | 'VISION_ALERT'
  | 'SPEECH_COERCION'
  | 'EMERGENCY_DISPATCH'
  | 'GEO_UPDATE'
  | 'HARDWARE_DIAG'
  | 'NETWORK_RTT'
  | 'FALLBACK_QUEUED'
  | 'FALLBACK_FLUSHED'
  | 'CAMERA_PERMISSION_DENIED'
  | 'AUDIO_ALERT';

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
const STORE = 'events';

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
  }

  on(type: MeshEventType, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  async emit(type: MeshEventType, payload: unknown): Promise<void> {
    const event: MeshEvent = {
      type,
      payload,
      timestamp: Date.now(),
      sent: false,
      retries: 0,
    };

    if (this.db) {
      const id = await this.db.add(STORE, event);
      event.id = id as number;
    }

    this.notify(event);
    await this.dispatchToCerebro({ event_type: type, timestamp: event.timestamp, channel_id: TELEGRAM_CHANNEL_ID, data: payload, sentra_version: '3.0' }, event);
  }

  // Main dispatch function — POST to Cerebro (Pipedream) with retry on IDB
  async dispatchToCerebro(payload: CerebroPayload, sourceEvent?: MeshEvent): Promise<boolean> {
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
      const res = await fetch(PIPEDREAM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SENTRA-Version': '3.0',
          'X-Channel-ID': TELEGRAM_CHANNEL_ID,
          'X-Bot-Token': TELEGRAM_BOT_TOKEN,
        },
        body: JSON.stringify(payload),
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
    const tx = this.db.transaction(STORE, 'readwrite');
    const stored = await tx.store.get(event.id);
    if (stored) await tx.store.put({ ...stored, retries: stored.retries + 1 });
    await tx.done;
  }

  private notify(event: MeshEvent): void {
    this.handlers.get(event.type)?.forEach((h) => {
      try { h(event); } catch { /* isolate */ }
    });
  }

  private async markSent(event: MeshEvent): Promise<void> {
    if (!this.db || !event.id) return;
    const tx = this.db.transaction(STORE, 'readwrite');
    const stored = await tx.store.get(event.id);
    if (stored) await tx.store.put({ ...stored, sent: true });
    await tx.done;
  }

  private async flushLoop(): Promise<void> {
    const flush = async () => {
      if (!this.db || !navigator.onLine) return;
      const unsent = await this.db.getAllFromIndex(STORE, 'sent', IDBKeyRange.only(false));
      let flushed = 0;
      for (const event of unsent) {
        if (event.retries >= MAX_RETRIES) continue;
        const ok = await this.dispatchToCerebro(
          { event_type: event.type, timestamp: event.timestamp, channel_id: TELEGRAM_CHANNEL_ID, data: event.payload, sentra_version: '3.0' },
          event
        );
        if (ok) flushed++;
      }
      if (flushed > 0) this.notify({ type: 'FALLBACK_FLUSHED', payload: { count: flushed }, timestamp: Date.now(), sent: true, retries: 0 });
      await this.purgeOld();
    };

    setInterval(flush, FLUSH_INTERVAL_MS);
    await flush();
  }

  private async purgeOld(): Promise<void> {
    if (!this.db) return;
    const cutoff = Date.now() - CACHE_PURGE_AGE_MS;
    const all = await this.db.getAll(STORE);
    const tx = this.db.transaction(STORE, 'readwrite');
    for (const e of all) {
      if (e.sent && e.timestamp < cutoff) await tx.store.delete(e.id);
    }
    await tx.done;
  }

  measureRTT(): void {
    const start = performance.now();
    fetch(PIPEDREAM_ENDPOINT, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
      .then(() => { this.rtt = performance.now() - start; })
      .catch(() => { this.rtt = 9999; });
  }

  getRTT(): number { return this.rtt; }

  async getPendingCount(): Promise<number> {
    if (!this.db) return 0;
    const unsent = await this.db.getAllFromIndex(STORE, 'sent', IDBKeyRange.only(false));
    return unsent.length;
  }
}

export const mesh = SentraMesh.getInstance();
