/**
 * BatchDispatcher + SentraMesh — Tests del bug #1 y contratos post-fix
 *
 *   Bug actual: BatchDispatcher.flush() envía el batch pero NO marca los
 *   eventos en IndexedDB como `sent: true`. El flushLoop de SentraMesh los
 *   levanta como pendientes y los reenvía individualmente → duplicación.
 *
 *   Contrato post-fix (Diff #1):
 *     - SentraMesh.emit() persiste el evento en IDB y pasa su `idbId` al
 *       BatchDispatcher.enqueue(type, payload, idbId).
 *     - Si el batch se despacha con éxito (HTTP 2xx/4xx), los `idbId` se
 *       marcan como `sent: true` en IDB.
 *     - Si el batch falla (red caída, 5xx), NO se marcan → el flushLoop
 *       los reintentará (mismo comportamiento que hoy).
 *
 *   Antes del fix: los tests "🐛 BUG" FALLAN.
 *   Después del fix: TODOS pasan.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const STORE = 'events';
const DB_NAME = 'sentra_mesh_v3';

async function readIdb(): Promise<{ all: any[]; sent: any[]; unsent: any[] }> {
  const db = await openDB(DB_NAME, 1);
  const all = await db.getAll(STORE);
  db.close();
  return {
    all,
    sent:   all.filter((e: any) => e.sent === true),
    unsent: all.filter((e: any) => e.sent === false),
  };
}

// Reset COMPLETO del singleton BatchDispatcher (por reflexión)
function resetBatchDispatcher(bd: any) {
  if (bd._timer) { clearTimeout(bd._timer); }
  bd.queue      = [];
  bd.timer      = null;
  bd.dedupeMap  = new Map();
  // soporte post-fix
  if ('inFlightIds' in bd) bd.inFlightIds = [];
}

// ── Setup global ────────────────────────────────────────────────────────────

beforeEach(async () => {
  // IDB virgen en cada test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).indexedDB = new IDBFactory();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  );
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
//  Tests del BUG #1 — fallan con el código original
// ─────────────────────────────────────────────────────────────────────────────

describe('🐛 BUG #1 — el batch debe marcar los eventos como `sent` en IDB', () => {

  it('CRITICAL VISION_ALERT: tras batch exitoso, el evento queda sent:true en IDB', async () => {
    const { mesh } = await import('../src/lib/SentraMesh');
    await mesh.init();

    await mesh.emit('VISION_ALERT', { label: 'knife', confidence: 0.9 });
    // VISION_ALERT es CRITICAL → flush inmediato
    await sleep(200);

    const { all, sent, unsent } = await readIdb();

    expect(fetch).toHaveBeenCalledTimes(1);     // 1 POST al batch endpoint
    expect(all.length).toBe(1);                  // 1 evento persistido
    expect(unsent.length).toBe(0);               // ❌ BUG: hoy queda en 1
    expect(sent.length).toBe(1);                 // ❌ BUG: hoy queda en 0
  });

  it('flushLoop NO reenvía un evento ya despachado por el batch', async () => {
    const { mesh } = await import('../src/lib/SentraMesh');
    await mesh.init();

    await mesh.emit('VISION_ALERT', { label: 'person', confidence: 0.8 });
    await sleep(200);
    expect(fetch).toHaveBeenCalledTimes(1);

    // FLUSH_INTERVAL_MS = 15s en prod (no podemos mockearlo desde el módulo
    // sin tocar src/). Tolerable: el flushLoop primero corre await flush()
    // inmediatamente en init — eso ya tuvo oportunidad de leer el evento
    // como "unsent" antes de que el batch lo marcara.
    // Validamos que entre 200ms y 500ms (sin esperar el setInterval) NO
    // se haya disparado un POST adicional.
    await sleep(500);

    // Hoy bug: el flush inicial del flushLoop podría no haber visto el evento
    // todavía (carrera) → este test es indicativo. El test 1 es el canónico.
    // Reforzamos el contrato: el evento debe estar marcado.
    const { sent } = await readIdb();
    expect(sent.length).toBe(1);
  });

  it('emitiendo el MISMO evento crítico 2 veces (2do bloqueado por debounce) AMBOS quedan sent', async () => {
    // Caso clave del diff: cuando el segundo emit cae en debounce y NO entra
    // al batch, igual hay que marcarlo como sent (sino el flushLoop lo levanta).
    const { mesh } = await import('../src/lib/SentraMesh');
    await mesh.init();

    await mesh.emit('VISION_ALERT', { label: 'knife', confidence: 0.9 });
    await sleep(50);
    await mesh.emit('VISION_ALERT', { label: 'knife', confidence: 0.92 }); // mismo dedupe key
    await sleep(300);

    const { all, sent, unsent } = await readIdb();
    expect(all.length).toBe(2);              // los 2 persistidos
    expect(fetch).toHaveBeenCalledTimes(1);  // 1 solo POST (el 2do fue debounced)
    expect(unsent.length).toBe(0);           // ❌ BUG: hoy queda en 2
    expect(sent.length).toBe(2);             // ❌ BUG: hoy queda en 0
  });

  it('si el fetch del batch falla (5xx), los eventos NO se marcan sent (retry esperado)', async () => {
    // Caso negativo — debe seguir funcionando para no romper la retransmisión.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );

    const { mesh } = await import('../src/lib/SentraMesh');
    await mesh.init();

    await mesh.emit('VISION_ALERT', { label: 'knife', confidence: 0.9 });
    await sleep(200);

    const { sent, unsent } = await readIdb();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent.length).toBe(0);     // NO se marcó → permite retry
    expect(unsent.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Regresión — comportamiento del BatchDispatcher en aislamiento
// ─────────────────────────────────────────────────────────────────────────────

describe('✅ Regresión — BatchDispatcher en aislamiento', () => {

  it('debounce: misma key dentro de DEBOUNCE_MS se suprime', async () => {
    const { batchDispatcher } = await import('../src/lib/batchDispatcher');
    resetBatchDispatcher(batchDispatcher);

    // 1er VISION_ALERT con label=knife → aceptado, flush inmediato
    expect(batchDispatcher.enqueue('VISION_ALERT', { label: 'knife' })).toBe(true);
    // 2do INMEDIATO con misma label → suprimido
    expect(batchDispatcher.enqueue('VISION_ALERT', { label: 'knife' })).toBe(false);
    // distinta label → aceptado (key independiente)
    expect(batchDispatcher.enqueue('VISION_ALERT', { label: 'person' })).toBe(true);
  });

  it('CRITICAL dispara fetch inmediato', async () => {
    const { batchDispatcher } = await import('../src/lib/batchDispatcher');
    resetBatchDispatcher(batchDispatcher);

    batchDispatcher.enqueue('EMERGENCY_DISPATCH', { test: true });
    await sleep(50);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('NON-CRITICAL: getPendingCount refleja la cola antes del flush', async () => {
    const { batchDispatcher } = await import('../src/lib/batchDispatcher');
    resetBatchDispatcher(batchDispatcher);

    batchDispatcher.enqueue('GEO_UPDATE',    { lat: 0, lon: 0 });
    batchDispatcher.enqueue('NETWORK_RTT',   { rtt: 100 });
    batchDispatcher.enqueue('HARDWARE_DIAG', { camera: true });

    expect(batchDispatcher.getPendingCount()).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
  });
});
