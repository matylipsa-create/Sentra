// Test setup: fake IndexedDB + structured-clone polyfill (jsdom no incluye IDB).
import 'fake-indexeddb/auto';

// jsdom no incluye AbortSignal.timeout en algunas versiones; fallback seguro.
if (typeof AbortSignal.timeout !== 'function') {
  // @ts-expect-error - polyfill mínimo
  AbortSignal.timeout = (ms: number) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };
}
