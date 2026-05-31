// SENTRA v3.0 Service Worker — Network-First with auto-purge
const CACHE_VERSION = 'sentra-v3.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const MAX_RUNTIME_ENTRIES = 60;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ---- Install ---------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ---- Activate --------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch — Network-First -------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never cache Pipedream / Telegram / Nominatim API calls
  const url = new URL(request.url);
  const isExternal =
    url.hostname.includes('pipedream') ||
    url.hostname.includes('telegram') ||
    url.hostname.includes('nominatim') ||
    url.hostname.includes('tensorflow');

  if (isExternal) return; // Let them pass through without caching

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
      await purgeOldEntries(cache);
    }
    return networkResponse;
  } catch {
    // Network failed — fall back to cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Final fallback for navigation requests
    if (request.destination === 'document') {
      const staticCache = await caches.open(STATIC_CACHE);
      return (await staticCache.match('/index.html')) || new Response('Offline', { status: 503 });
    }
    return new Response('Network error', { status: 503 });
  }
}

// ---- Purge old runtime cache entries ---------------------------------------
async function purgeOldEntries(cache) {
  const requests = await cache.keys();
  const now = Date.now();

  // Purge by count (keep last MAX_RUNTIME_ENTRIES)
  if (requests.length > MAX_RUNTIME_ENTRIES) {
    const toDelete = requests.slice(0, requests.length - MAX_RUNTIME_ENTRIES);
    await Promise.all(toDelete.map((r) => cache.delete(r)));
  }

  // Purge by age
  for (const req of requests) {
    const res = await cache.match(req);
    if (!res) continue;
    const dateHeader = res.headers.get('date');
    if (!dateHeader) continue;
    const cacheDate = new Date(dateHeader).getTime();
    if (now - cacheDate > MAX_CACHE_AGE_MS) await cache.delete(req);
  }
}

// ---- Skip waiting ----------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
