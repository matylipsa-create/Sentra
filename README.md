# SENTRA v3.0 — Tactic System

Adaptive Reactive Emergency Response PWA. AMOLED dark UI (#000000), offline-first, Web Worker architecture, optimized for mid/high-end Android.

## Stack

- React 18 + TypeScript 5 + Vite 5
- Tailwind CSS (utility-first)
- TensorFlow.js 4 + COCO-SSD MobileNetV2 (Web Worker, 3 FPS cap, WebGPU preferred)
- IndexedDB via `idb` — event queue with auto-retry
- Service Worker: Network-First + 7-day auto-purge
- Nominatim API — reverse geocoding off main thread
- Pipedream webhook as primary Cerebro endpoint

## Local Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # strict TypeScript validation
npm run build        # production bundle → dist/
```

## Deploy to Vercel

### Option A — Vercel CLI (fastest)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Vercel auto-detects Vite. No framework config needed. Done.

### Option B — Vercel Dashboard

1. Push repo to GitHub / GitLab.
2. Go to [vercel.com/new](https://vercel.com/new) → Import project.
3. Framework preset: **Vite** (auto-detected).
4. Build command: `npm run build`
5. Output directory: `dist`
6. Click **Deploy**.

### Recommended vercel.json (permission headers)

Create `vercel.json` at project root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Permissions-Policy", "value": "camera=*, microphone=*, geolocation=*" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    }
  ]
}
```

## Environment Variables

None required. All endpoints are hardcoded in `src/config.ts`:

| Key | Value |
|-----|-------|
| `PIPEDREAM_ENDPOINT` | `https://eoqv1v7e0297v4p.m.pipedream.net` |
| `TELEGRAM_CHANNEL_ID` | `-1003914032579` |

## PWA Installation (Android Chrome)

1. Open deployed URL in Chrome for Android.
2. Tap ⋮ menu → **Add to Home Screen**.
3. App installs in standalone mode — pure AMOLED black, no browser chrome.

Or use [PWA Builder](https://www.pwabuilder.com/) to generate a signed `.apk` / `.aab` for Play Store.

## Architecture

```
src/
├── config.ts                    # Single source of truth for all endpoints
├── lib/
│   └── SentraMesh.ts            # Singleton EDA bus + IDB queue + dispatchToCerebro()
├── workers/
│   ├── sentraVision.worker.ts   # TF.js COCO-SSD, 3 FPS, WebGPU/WebGL
│   ├── sentraIA.worker.ts       # NLP coercion filter (es-AR, 30+ keywords)
│   └── sentraGeo.worker.ts      # Nominatim reverse geocoding + Haversine
├── hooks/
│   └── useSentraCore.ts         # ARM/DISARM, geolocation, hardware diagnostics
└── components/
    ├── SentraHUD.tsx             # AMOLED HUD — lazy loads Vision + IA on ARM
    ├── SentraVisionPanel.tsx     # Camera feed + detection overlay
    └── SentraIAPanel.tsx         # SpeechRecognition bridge (es-AR)
```

## Key Features

| Feature | Detail |
|---------|--------|
| ARM/DISARM | Single RADAR button — only interactive HUD element |
| Vision | COCO-SSD person/knife/scissors detection at 3 FPS |
| IA | Continuous `es-AR` speech monitoring, coercion + silent-trigger detection |
| Code Red | Haptic vibration + silent POST to Pipedream on coercion |
| One-Shot | RTT check < 200ms before send; queue to IDB if exceeded |
| Retry | Auto-flush every 15s, max 5 retries per event |
| Camera blocked | `NotAllowedError` → modal via `UI_ACTION_REQUEST` |
| Log debounce | 500ms debounce prevents main-thread flooding |
| Geo | Nominatim `display_name` (street/number) in worker thread |

## Bundle Sizes

| Chunk | Size (gzip) | Loaded |
|-------|-------------|--------|
| index.js | ~15 KB | Always |
| vendor.js | ~83 KB | Always |
| idb.js | ~1.4 KB | Always |
| sentraVision.worker.js | ~1.8 MB | On ARM only |
| SentraVisionPanel.js | ~1.5 KB | On ARM (lazy) |
| SentraIAPanel.js | ~0.8 KB | On ARM (lazy) |
