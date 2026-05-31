import { openDB, type IDBPDatabase } from 'idb';

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
  | 'FALLBACK_FLUSHED';

export interface MeshEvent {
  id?: number;
  type: MeshEventType;
  payload: unknown;
  timestamp: number;
  sent: boolean;
  retries: number;
}

type Handler = (event: MeshEvent) => void;

const DB_NAME = 'sentra_mesh_v3';
const STORE = 'events';
const MAX_RETRIES = 5;
const RTT_THRESHOLD_MS = 200;

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
    // Start flush loop
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

    // Persist to IndexedDB immediately
    if (this.db) {
      const id = await this.db.add(STORE, event);
      event.id = id as number;
    }

    // Notify local subscribers immediately
    this.notify(event);

    // Attempt network send
    await this.trySend(event);
  }

  private notify(event: MeshEvent): void {
    this.handlers.get(event.type)?.forEach((h) => {
      try { h(event); } catch { /* isolate handler errors */ }
    });
  }

  private async trySend(event: MeshEvent): Promise<boolean> {
    const isOnline = navigator.onLine;
    const rttOk = this.rtt < RTT_THRESHOLD_MS || this.rtt === 0;

    if (!isOnline || !rttOk) return false;

    try {
      const start = performance.now();
      const res = await fetch('https://eo4xot0qo22mfqm.m.pipedream.net', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event }),
        signal: AbortSignal.timeout(RTT_THRESHOLD_MS * 3),
      });
      this.rtt = performance.now() - start;

      if (res.ok || res.status < 500) {
        await this.markSent(event);
        return true;
      }
    } catch {
      // Network fail – stays in IndexedDB queue
    }
    return false;
  }

  private async markSent(event: MeshEvent): Promise<void> {
    if (!this.db || !event.id) return;
    const tx = this.db.transaction(STORE, 'readwrite');
    const stored = await tx.store.get(event.id);
    if (stored) {
      stored.sent = true;
      await tx.store.put(stored);
    }
    await tx.done;
  }

  private async flushLoop(): Promise<void> {
    const flush = async () => {
      if (!this.db || !navigator.onLine) return;
      const unsent = await this.db.getAllFromIndex(STORE, 'sent', IDBKeyRange.only(false));
      for (const event of unsent) {
        if (event.retries >= MAX_RETRIES) continue;
        const sent = await this.trySend(event);
        if (!sent) {
          await this.db.put(STORE, { ...event, retries: event.retries + 1 });
        }
      }
      // Purge sent events older than 24h
      await this.purgeOld();
    };

    setInterval(flush, 15_000); // Flush every 15s
    await flush(); // Immediate attempt
  }

  private async purgeOld(): Promise<void> {
    if (!this.db) return;
    const cutoff = Date.now() - 86_400_000;
    const all = await this.db.getAll(STORE);
    const tx = this.db.transaction(STORE, 'readwrite');
    for (const e of all) {
      if (e.sent && e.timestamp < cutoff) await tx.store.delete(e.id);
    }
    await tx.done;
  }

  measureRTT(): void {
    const start = performance.now();
    fetch('https://eo4xot0qo22mfqm.m.pipedream.net', {
      method: 'HEAD',
      signal: AbortSignal.timeout(2000),
    })
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
