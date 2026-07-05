# SENTRA — Diffs propuestos (sin aplicar)

> Cada diff es independiente. Apruébalos individualmente con `aplicá #N` o todos juntos con `aplicá todo`.
> Las rutas son relativas a la raíz del repo `Sentra/`.

---

## Diff #1 — 🔴 Marcar eventos como `sent` cuando el batch sale (causa raíz de duplicación)

**Archivo:** `src/lib/batchDispatcher.ts`
**Impacto:** −50 % a −83 % de POSTs (elimina los reintentos individuales del `flushLoop` para eventos que el batch ya envió).

```diff
@@ src/lib/batchDispatcher.ts
-import {
+import { openDB, type IDBPDatabase } from 'idb';
+import {
   PIPEDREAM_ENDPOINT,
   TELEGRAM_CHANNEL_ID,
   TELEGRAM_BOT_TOKEN,
 } from '../config';
 import type { MeshEventType } from './SentraMesh';

@@ class BatchDispatcher {
   private queue:      BatchEvent[]         = [];
   private timer:      ReturnType<typeof setTimeout> | null = null;
   private dedupeMap:  Map<string, number>  = new Map();
+  // IDs de los eventos en el batch actual, para marcarlos como sent tras flush OK
+  private inFlightIds: number[] = [];

-  enqueue(type: MeshEventType, payload: unknown): boolean {
+  enqueue(type: MeshEventType, payload: unknown, idbId?: number): boolean {
     const key      = this.dedupeKey(type, payload);
     const lastSent = this.dedupeMap.get(key) ?? 0;
     if (Date.now() - lastSent < DEBOUNCE_MS) return false;

-    this.queue.push({ type, payload, timestamp: Date.now() });
+    this.queue.push({ type, payload, timestamp: Date.now(), idbId });
     ...
   }

-  private flush(): void {
+  private async flush(): Promise<void> {
     ...
-    fetch(endpoint, { ... }).catch(() => {});
+    const ids = batch.map((b) => b.idbId).filter((x): x is number => typeof x === 'number');
+    try {
+      const res = await fetch(endpoint, { ... });
+      if (res.ok || res.status < 500) await markSentInIDB(ids);
+    } catch { /* IDB retry handled in flushLoop */ }
   }
 }
```

Y en `SentraMesh.ts`:

```diff
-    const accepted = batchDispatcher.enqueue(type, payload);
-    if (!accepted) return;
-    if (this.db) {
-      const id = await this.db.add(STORE, event);
-      event.id = id as number;
-    }
+    let idbId: number | undefined;
+    if (this.db) {
+      const id = await this.db.add(STORE, event);
+      idbId = id as number;
+      event.id = idbId;
+    }
+    const accepted = batchDispatcher.enqueue(type, payload, idbId);
+    if (!accepted && idbId !== undefined) {
+      // suprimido por debounce: marcarlo como sent para no inflar el flushLoop
+      await this.markSent(event);
+    }
```

**Verificación manual:** abrir DevTools → IndexedDB → `sentra_mesh_v3 / events`. Tras disparar un VISION_ALERT, el registro debe quedar con `sent: true` en < 2 s. Antes del fix queda `sent: false` indefinidamente.

---

## Diff #2 — 🔴 Eliminar dispatch redundante en `AudioEngine`

**Archivo:** `src/components/AudioEngine.tsx`
**Impacto:** −50 % POSTs por alerta de audio. Mejora latencia ya que sale en el flush inmediato del batch (mismo path que VISION_ALERT).

```diff
-// Pipedream endpoint — swap for production URL
-const AUDIO_ALERT_ENDPOINT = 'https://eo4xot0qo22mfqm.m.pipedream.net/audio_alert';
-
-// ── Dispatch to Pipedream (fire-and-forget) ────────────────────────────────
-
-function dispatchAudioAlert(log: AudioAlertLog): void {
-  fetch(AUDIO_ALERT_ENDPOINT, {
-    method:  'POST',
-    headers: { 'Content-Type': 'application/json', 'X-Sentra-Source': 'AudioEngine-v1' },
-    body:    JSON.stringify(log),
-    signal:  AbortSignal.timeout(5000),
-  }).catch(() => {
-    mesh.emit('FALLBACK_QUEUED', { type: 'AUDIO_ALERT', log });
-  });
-}
-
@@ const emitAlert = (alerta: string) => {
     onAlert(log);
-    mesh.emit('AUDIO_ALERT', log);
-    dispatchAudioAlert(log);
+    mesh.emit('AUDIO_ALERT', log); // routed via BatchDispatcher (CRITICAL_TYPES → immediate flush)
   };
```

> Si el endpoint `/audio_alert` necesita un workflow separado en Pipedream, lo recomendable es manejar el ruteo del lado servidor según `event_type: 'AUDIO_ALERT'`.

---

## Diff #3 — 🔴 Caché + throttle de Nominatim

**Archivos:** `src/hooks/useSentraCore.ts`, `src/workers/sentraGeo.worker.ts`
**Impacto:** −80 % req a Nominatim. Cumple con la *Usage Policy*.

```diff
+++ src/workers/sentraGeo.worker.ts
+const CACHE = new Map<string, { ts: number; address: string }>();
+const CACHE_TTL_MS = 5 * 60_000;
+
+function cacheKey(lat: number, lon: number) {
+  // grid de ~55 m (4 decimales)
+  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
+}

 async function reverseGeocode(lat: number, lon: number): Promise<string> {
+  const key = cacheKey(lat, lon);
+  const hit = CACHE.get(key);
+  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.address;
   try {
     ...
-    return parts.length > 0 ? parts.join(' ') : (data.display_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
+    const address = parts.length > 0 ? parts.join(' ') : (data.display_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
+    CACHE.set(key, { ts: Date.now(), address });
+    return address;
   } ...
```

```diff
+++ src/hooks/useSentraCore.ts
+const REGEOCODE_MIN_DISTANCE_M = 25;
+const REGEOCODE_MIN_INTERVAL_MS = 5_000;
+let lastRegeoTs = 0;
+let lastRegeoLat: number | null = null;
+let lastRegeoLon: number | null = null;

 geoWatchId.current = navigator.geolocation.watchPosition(
   (pos) => {
     const { latitude, longitude, accuracy } = pos.coords;
     setGeo((prev) => ({ ...prev, latitude, longitude, accuracy }));
-    geoWorker.current?.postMessage({ type: 'REVERSE_GEOCODE', lat: latitude, lon: longitude });
+    const now = Date.now();
+    const dist = lastRegeoLat !== null
+      ? haversine(latitude, longitude, lastRegeoLat, lastRegeoLon!) : Infinity;
+    if (now - lastRegeoTs >= REGEOCODE_MIN_INTERVAL_MS && dist >= REGEOCODE_MIN_DISTANCE_M) {
+      geoWorker.current?.postMessage({ type: 'REVERSE_GEOCODE', lat: latitude, lon: longitude });
+      lastRegeoTs = now; lastRegeoLat = latitude; lastRegeoLon = longitude;
+    }
     mesh.emit('GEO_UPDATE', { latitude, longitude, accuracy, timestamp: Date.now() });
   },
   ...
 );
```

(Función `haversine` inline o reusar la del worker exportándola.)

---

## Diff #4 — 🟠 Migrar `dispatchInteraction` a `mesh.emit`

**Archivos:** `src/components/SentraHUD.tsx`, `src/pages/Operations.tsx`, `src/lib/SentraMesh.ts`
**Impacto:** −50 % POSTs en arm/disarm/resolve.

1. Agregar el tipo:
```diff
+++ src/lib/SentraMesh.ts
 export type MeshEventType =
   | 'SYSTEM_ARMED'
   | 'SYSTEM_DISARMED'
+  | 'USER_INTERACTION'   // resolver alertas, acciones manuales del operador
   | 'VISION_ALERT'
   ...
```

2. Reemplazar las 3 llamadas:
```diff
-      pipedreamOrchestrator.dispatchInteraction({
-        action: 'SYSTEM_ARMED', phase: 'ARMED', ...
-      });
+      // ya emitido por mesh.emit('SYSTEM_ARMED') dentro de arm()
```
```diff
-      pipedreamOrchestrator.dispatchInteraction({
-        action: 'SYSTEM_DISARMED', phase: 'STANDBY', ...
-      });
+      // ya emitido por mesh.emit('SYSTEM_DISARMED') dentro de disarm()
```
```diff
-    await pipedreamOrchestrator.dispatchInteraction({
-      action: 'RESOLVE_ALERT', event_id: log.id, severity: log.severity, ...
-    });
+    await mesh.emit('USER_INTERACTION', { action: 'RESOLVE_ALERT', event_id: log.id, severity: log.severity, source: log.source, timestamp: Date.now(), operator: 'Matías' });
```

3. (Opcional fase 2) marcar `pipedreamOrchestrator` como `@deprecated` o moverlo a `lib/legacy/`.

---

## Diff #5 — 🟠 Quitar emisión doble en `SentraVisionPanel`

**Archivo:** `src/components/SentraVisionPanel.tsx:189-204`
**Impacto:** −2× a −5× `VISION_ALERT` por frame con amenaza.

```diff
       if (type === 'MODEL_READY') {
         setModelReady(true);
       } else if (type === 'DETECTIONS') {
         setDetections(e.data.predictions ?? []);
         setThreats(e.data.threats ?? []);
-        for (const t of (e.data.threats ?? [])) onThreat(t.class, t.score);
+        // NO emitir VISION_ALERT acá: el worker ya postea THREAT_DETECTED (rate-limited 10s/clase).
       } else if (type === 'THREAT_DETECTED') {
-        // Worker-rate-limited re-post of a threat; forward to main mesh
         onThreat(e.data.detected.class, e.data.detected.score);
       }
```

**Verificación:** con una cámara apuntando a una persona durante 30 s deberías ver **1** `VISION_ALERT` (worker cooldown 10 s = max 3 en 30 s), no uno por frame.

---

## Diff #6 — 🟠 Cachear el `user.id` en `sensorPipeline`

**Archivo:** `src/lib/sensorPipeline.ts`

```diff
+import { supabase } from './supabase';
+
+let cachedUserId: string | null = null;
+supabase.auth.onAuthStateChange((_event, session) => {
+  cachedUserId = session?.user?.id ?? null;
+});
+(async () => {
+  const { data: { user } } = await supabase.auth.getUser();
+  cachedUserId = user?.id ?? null;
+})();
@@
   private persistAlert(_reading: SensorReading, alerts: string[]) {
     (async () => {
       try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (!user) return;
-        await supabase.from('security_logs').insert({
-          user_id: user.id,
+        if (!cachedUserId) return;
+        await supabase.from('security_logs').insert({
+          user_id: cachedUserId,
           severity: alerts.includes('HIGH_HR') || alerts.includes('STRESS_DETECTED') ? 'critical' : 'warning',
           source: 'sensor',
           message: `Alerta biométrica: ${alerts.join(', ')}`,
         });
       } catch (_e) { /* offline */ }
     })();
   }
```

---

## Diff #7 — 🟡 Pausar polling de `Operations` cuando la tab no es visible

**Archivo:** `src/pages/Operations.tsx`

```diff
   useEffect(() => {
     poll();
-    const interval = setInterval(() => poll(), POLL_INTERVAL_MS);
+    const interval = setInterval(() => {
+      if (document.visibilityState === 'visible') poll();
+    }, POLL_INTERVAL_MS);
+    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
+    document.addEventListener('visibilitychange', onVisible);
     return () => {
       clearInterval(interval);
+      document.removeEventListener('visibilitychange', onVisible);
       highlightTimers.current.forEach(clearTimeout);
     };
   }, []);
```

---

## Diff #8 — 🟠 Unificar `SpeechRecognition` (sólo una instancia)

**Archivos:** `src/components/AudioEngine.tsx`, `src/components/SentraIAPanel.tsx`
**Impacto:** evita el bucle de `onerror: no-speech`/restart entre las dos instancias y baja CPU.

Propuesta concreta (2 opciones, votar una):

- **Opción A (mínima, recomendada):** dejar el `SpeechRecognition` **sólo** en `SentraIAPanel` (es el que tiene worker con análisis de coerción), y en `AudioEngine` mantener únicamente el análisis FFT (cristales/estruendos). Las palabras clave (`auxilio`, `peligro`, etc.) se mueven al `sentraIA.worker.ts` (ya tiene `COERCION_KEYWORDS` con un set casi idéntico → consolidar).

- **Opción B:** crear un módulo singleton `src/lib/speech.ts` que mantenga *una* recognition, multiplexa los transcripts por callbacks. Más prolijo pero +50 LOC.

(Solicito tu preferencia antes de mostrar el diff completo.)

---

## Cómo confirmar

Respondé con uno o más de:

- `aplicá #1, #2, #3` (lista a la carta)
- `aplicá todos los XS/S` (sólo los de menor riesgo)
- `aplicá todo` (los 8)
- `mostrame primero los tests del #1` (te genero los unitarios sin tocar nada)
- `descartá #X porque ...` (con tu razón)

No tocaré nada hasta tu confirmación explícita.
