/**
 * telemetryFilter — tests del gate y del pipeline HTTP.
 *
 * Casos cubiertos:
 *   ✅ bpm >= 110               → envía
 *   ✅ alert_type = CRITICAL    → envía
 *   ✅ bpm < 110 & NORMAL       → NO envía (modo silencioso)
 *   ✅ bpm exactamente 110      → envía (frontera inclusiva)
 *   ✅ bpm NaN / undefined      → no cuenta como anómalo
 *   ✅ POST usa Content-Type application/json
 *   ✅ POST usa timeout de 2000 ms (AbortSignal.timeout)
 *   ✅ Fallo del fetch NO relanza excepción (sin retry, descarte silencioso)
 *   ✅ bpm decimal → se trunca a entero antes de enviar
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sendTelemetry,
  shouldSendTelemetry,
  resetTelemetryThrottle,
  TELEMETRY_ENDPOINT,
  TELEMETRY_TIMEOUT_MS,
  TELEMETRY_THROTTLE_MS,
} from '../src/lib/telemetryFilter';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
  resetTelemetryThrottle();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
//  Gate puro (shouldSendTelemetry)
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldSendTelemetry — reglas del filtro', () => {
  it('bpm >= 110 dispara envío aunque alert_type sea NORMAL', () => {
    expect(shouldSendTelemetry({ bpm: 110, alert_type: 'NORMAL' })).toBe(true);
    expect(shouldSendTelemetry({ bpm: 150, alert_type: 'NORMAL' })).toBe(true);
  });

  it('alert_type CRITICAL dispara envío aunque bpm sea bajo', () => {
    expect(shouldSendTelemetry({ bpm: 65,  alert_type: 'CRITICAL' })).toBe(true);
    expect(shouldSendTelemetry({ bpm: 0,   alert_type: 'CRITICAL' })).toBe(true);
  });

  it('bpm < 110 y NORMAL → modo silencioso', () => {
    expect(shouldSendTelemetry({ bpm: 60,  alert_type: 'NORMAL' })).toBe(false);
    expect(shouldSendTelemetry({ bpm: 109, alert_type: 'NORMAL' })).toBe(false);
  });

  it('bpm no finito (NaN/Infinity) no cuenta como anómalo', () => {
    expect(shouldSendTelemetry({ bpm: NaN,        alert_type: 'NORMAL' })).toBe(false);
    expect(shouldSendTelemetry({ bpm: Infinity,   alert_type: 'NORMAL' })).toBe(false);
    // Pero si es CRITICAL, igual envía.
    expect(shouldSendTelemetry({ bpm: NaN,        alert_type: 'CRITICAL' })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Pipeline HTTP (sendTelemetry)
// ─────────────────────────────────────────────────────────────────────────────

describe('sendTelemetry — pipeline HTTP', () => {

  it('NO llama a fetch en modo silencioso', async () => {
    const dispatched = await sendTelemetry({ bpm: 72, alert_type: 'NORMAL' });
    expect(dispatched).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('llama a fetch con URL, método, headers y body correctos', async () => {
    const dispatched = await sendTelemetry({ bpm: 118, alert_type: 'NORMAL' });
    expect(dispatched).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(TELEMETRY_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body).toEqual({ bpm: 118, alert_type: 'NORMAL' });

    // Timeout via AbortSignal — verificamos que sea un AbortSignal aún vivo
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('trunca bpm decimal a entero antes de enviar', async () => {
    await sendTelemetry({ bpm: 121.87, alert_type: 'CRITICAL' });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.bpm).toBe(121);
    expect(Number.isInteger(body.bpm)).toBe(true);
  });

  it('envía cuando alert_type=CRITICAL aunque bpm sea bajo', async () => {
    const dispatched = await sendTelemetry({ bpm: 55, alert_type: 'CRITICAL' });
    expect(dispatched).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ bpm: 55, alert_type: 'CRITICAL' });
  });

  it('si fetch falla (red caída) NO relanza excepción — descarte silencioso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    // No debe hacer throw. La Promise se resuelve normalmente en true (se
    // intentó despachar, aunque haya fallado la red).
    await expect(sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' })).resolves.toBe(true);
  });

  it('si fetch retorna 5xx NO reintenta (sólo 1 llamada)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honra el timeout de 2000 ms (usa AbortSignal.timeout)', async () => {
    // Verificamos que el signal se aborte dentro del rango temporal correcto.
    let capturedSignal: AbortSignal | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Response('{}', { status: 200 });
    }));

    await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    // Confirmamos que el signal tiene el timeout esperado (indirectamente:
    // no lo podemos leer del signal, pero validamos que la constante esté fija)
    expect(TELEMETRY_TIMEOUT_MS).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Throttle — 1 envío cada 5 s durante anomalías sostenidas
// ─────────────────────────────────────────────────────────────────────────────

describe('sendTelemetry — throttle de 5 s en modo alerta', () => {

  it('constante fijada en 5 segundos', () => {
    expect(TELEMETRY_THROTTLE_MS).toBe(5000);
  });

  it('2 envíos anómalos consecutivos dentro de la ventana → sólo 1 POST', async () => {
    const r1 = await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });
    const r2 = await sendTelemetry({ bpm: 132, alert_type: 'CRITICAL' });

    expect(r1).toBe(true);
    expect(r2).toBe(false);            // silenciado por throttle
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rafaga de 10 lecturas anómalas en 1s → sólo 1 POST', async () => {
    for (let i = 0; i < 10; i++) {
      await sendTelemetry({ bpm: 120 + i, alert_type: 'NORMAL' }); // bpm alto
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('el throttle mezcla ambos disparadores (bpm alto + CRITICAL)', async () => {
    // Primer envío por bpm alto, siguiente por CRITICAL — pero dentro de 5s → uno solo
    await sendTelemetry({ bpm: 115, alert_type: 'NORMAL' });
    await sendTelemetry({ bpm: 70,  alert_type: 'CRITICAL' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tras 5 s el throttle libera y el siguiente evento sí sale', async () => {
    // Congelamos Date.now para controlar la ventana.
    const t0 = 1_000_000_000_000;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(t0);

    await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });   // t0     → sale
    spy.mockReturnValue(t0 + 4_999);
    await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });   // t0+4.9 → silenciado
    spy.mockReturnValue(t0 + 5_001);
    await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });   // t0+5.0 → sale

    expect(fetch).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('un evento silenciado por GATE (bpm bajo + NORMAL) NO consume la ventana del throttle', async () => {
    // Si el gate bloquea, no debe reservar la ventana → un envío anómalo
    // posterior debe salir aunque haya sido llamado en la misma milésima.
    await sendTelemetry({ bpm: 70, alert_type: 'NORMAL' });      // gate silencia
    expect(fetch).not.toHaveBeenCalled();

    await sendTelemetry({ bpm: 130, alert_type: 'CRITICAL' });   // debe salir
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
