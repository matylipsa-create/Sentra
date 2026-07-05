# SENTRA v3.0 — Auditoría de Arquitectura

**Auditor:** E1 (Arquitecto Senior)
**Repositorio:** `matylipsa-create/Sentra`
**Commit base:** `main` (clonado en limpio)
**Objetivo:** reducir consumo de API + latencia de los agentes de monitoreo.
**Estado:** **DIAGNÓSTICO — sin cambios aplicados.** A la espera de tu confirmación.

---

## 1. Mapa de consumo

| Capa | Endpoint | Frecuencia teórica | Frecuencia real observada | Riesgo |
|---|---|---|---|---|
| `SentraMesh.dispatchToCerebro` | `PIPEDREAM_ENDPOINT` | on-demand (eventos) | **+1 POST cada 15 s por evento sin éxito** (loop infinito hasta `MAX_RETRIES=5`) | 🔴 Crítico |
| `BatchDispatcher.flush` | `PIPEDREAM_ENDPOINT` | cada 15 s o inmediato | **OK** (1 batch / 15 s) — pero no marca eventos como `sent` | 🔴 Crítico |
| `pipedreamOrchestrator.dispatchInteraction` | `INTERACTIONS_ENDPOINT` | on-arm / on-disarm | **2 POST por toggle** y duplica `mesh.emit('SYSTEM_ARMED')` | 🟠 Alto |
| `pipedreamOrchestrator.dispatchEmergency` | `PIPEDREAM_WEBHOOK` (otro) | on-emergency | Bypassa BatchDispatcher + IDB → sin dedupe ni retry | 🟠 Alto |
| `AudioEngine.dispatchAudioAlert` | `${PIPEDREAM_WEBHOOK}/audio_alert` | por alerta | **DOBLE** envío (fetch + `mesh.emit('AUDIO_ALERT')` que ya está en `CRITICAL_TYPES`) | 🔴 Crítico |
| `Operations.poll` | `OPERATIONS_ENDPOINT` | cada 15 s | Activo aun con tab oculta + sin ETag | 🟡 Medio |
| `sentraGeo.worker → Nominatim` | `nominatim.openstreetmap.org/reverse` | por cada `GEO_UPDATE` | Hasta **N req/s** (watchPosition con `maximumAge:0`) — viola la *Nominatim Usage Policy* (≤ 1 req/s) | 🔴 Crítico |
| `sensorPipeline.persistAlert` | `supabase.auth.getUser` + `insert` | por cada alerta | **`getUser()` en cada alerta** (no cacheado) | 🟠 Alto |
| `SentraVisionPanel.worker DETECTIONS` | (sin red) | 3 FPS | Re-emisión doble: `worker.threats[]` ⊕ `THREAT_DETECTED` → 2× `onThreat` ⇒ 2× `mesh.emit('VISION_ALERT')` por frame | 🟠 Alto |
| Hardcoded Telegram bot token + chat id | bundle público | — | **Token y chat ID expuestos** en `/src/config.ts` y `/src/lib/pipedream.ts` | 🛑 Seguridad |
| `SpeechRecognition` doble instancia | navegador | continuo | `AudioEngine` **y** `SentraIAPanel` abren `webkitSpeechRecognition('es-AR', continuous=true)` en paralelo → conflicto + 2× CPU | 🟠 Alto |

---

## 2. Top 5 puntos calientes (con causa raíz)

### 🔴 HOTSPOT #1 — Duplicación garantizada en el bus de eventos

**Archivos:** `src/lib/SentraMesh.ts:106-126` + `src/lib/batchDispatcher.ts:109-151`
**Síntoma:** cada evento que pasa por `BatchDispatcher.flush()` **nunca** se marca como `sent: true` en IndexedDB. El `flushLoop` (cada 15 s) lo levanta como pendiente y dispara **otra** llamada individual a Pipedream.

```
emit('VISION_ALERT')
 ├── BatchDispatcher.enqueue → POST /pipedream (batch)        ✅ enviado
 └── IDB.add({sent:false})                                    ❌ jamás se actualiza
       ↓ 15 s
     flushLoop → dispatchToCerebro → POST /pipedream          ⚠️ DUPLICADO
       ↓ falla? retries++ → loop hasta MAX_RETRIES=5
```

**Impacto:** un evento crítico = **1 batch + hasta 5 reenvíos individuales** = **6× consumo** en escenario degradado. En condiciones nominales = 2× consumo.

**Fix propuesto:** ver Diff #1 en `SENTRA_PROPOSED_DIFFS.md`.

---

### 🔴 HOTSPOT #2 — `AudioEngine` envía la misma alerta dos veces

**Archivo:** `src/components/AudioEngine.tsx:104-123`

```ts
onAlert(log);                        // UI local — OK
mesh.emit('AUDIO_ALERT', log);       // → BatchDispatcher inmediato (CRITICAL_TYPES)
dispatchAudioAlert(log);             // → fetch directo a /audio_alert    ❌ duplica
```

`AUDIO_ALERT` ya está en `CRITICAL_TYPES`, por lo que `BatchDispatcher` hace flush inmediato. El `fetch` directo es redundante y además agrega un endpoint distinto (`/audio_alert`) que el cerebro probablemente ya reciba desde el batch.

**Impacto:** 2× POST por keyword detectado en pleno disparo de pánico (peor momento posible).

---

### 🔴 HOTSPOT #3 — Nominatim sin throttle ni caché

**Archivo:** `src/hooks/useSentraCore.ts:89-98` → `src/workers/sentraGeo.worker.ts:14-38`

`watchPosition({ maximumAge: 0, enableHighAccuracy: true })` puede emitir hasta varias veces por segundo en móviles con GPS de buena cobertura. Cada `GEO_UPDATE` dispara `postMessage` al worker que hace `fetch` a Nominatim **sin caché**.

Política oficial de Nominatim: **máx. 1 req/s**, identificación clara, no usar en producción sin instancia propia. Riesgo: ban de IP.

**Fix propuesto:**
1. Caché LRU por celda (≈ 50 m).
2. Throttle a **1 reverse-geocode cada 5 s** + sólo si `Δposición > 25 m` (Haversine).

---

### 🟠 HOTSPOT #4 — Doble pipeline de dispatch coexiste

**Archivos:** `src/lib/pipedream.ts` (legacy) + `src/lib/SentraMesh.ts` (nuevo)

- `pipedreamOrchestrator` se sigue usando en:
  - `SentraHUD.handleArmToggle` → `dispatchInteraction('SYSTEM_ARMED')` **además de** `mesh.emit('SYSTEM_ARMED')`
  - `Operations.handleResolve` → `dispatchInteraction('RESOLVE_ALERT')` (sin debounce ni batch)
  - `EmergencyCommandCenter.executeEmergencyDispatch` → `dispatchEmergency` directo (con fallback Telegram, pero **bypass total** de IDB + dedupe)

**Impacto:** dos códigos paralelos para el mismo concepto, debounce/dedupe del batch dispatcher se evade. **Costo ~2×** en eventos de armado y resolución manual.

**Fix propuesto:** migrar TODO a `mesh.emit(...)` y dejar `pipedreamOrchestrator` solo como adaptador interno del batch (o eliminarlo).

---

### 🟠 HOTSPOT #5 — Detección de visión emite VISION_ALERT por frame

**Archivos:** `src/workers/sentraVision.worker.ts:213-228` + `src/components/SentraVisionPanel.tsx:189-204`

El worker hace **dos** posts por frame con amenaza:
1. `{ type: 'DETECTIONS', predictions, threats }` → el panel itera `threats[]` y llama `onThreat()` por cada uno → `mesh.emit('VISION_ALERT')` por cada uno.
2. `{ type: 'THREAT_DETECTED', detected }` (rate-limited 10 s por clase) → el panel **también** llama `onThreat()`.

Aunque `BatchDispatcher.dedupeKey` filtra por `${type}:${label}` durante 30 s, **el handler local** (`mesh.notify`) corre siempre y dispara `setLastDetection`, `triggerHaptic`, `addLog` por cada frame. Eso fuerza re-renders de SentraHUD a 3 FPS.

**Fix propuesto:** dejar **sólo** `THREAT_DETECTED` (ya tiene cooldown) como camino hacia `onThreat`. Quitar el `for (const t of threats) onThreat(t)` del manejador `DETECTIONS`.

---

## 3. Hallazgos secundarios

- **`sensorPipeline.persistAlert`** llama `supabase.auth.getUser()` en cada alerta → cachear `user.id` en módulo, refrescar al login/logout.
- **`Operations.poll`** no respeta `document.hidden` → cuando la pestaña no es visible sigue golpeando el endpoint cada 15 s.
- **`SentraIAPanel` + `AudioEngine`** ambos arrancan `webkitSpeechRecognition` con `continuous=true, lang='es-AR'`. El navegador sólo soporta **una** instancia activa: uno de los dos siempre falla (`onerror → no-speech`) y se reinicia en bucle. Hay que unificar a una sola fuente de truth (sugerencia: el worker `sentraIA` + un solo `SpeechRecognition` global).
- **`EmergencyCommandCenter.captureFrames`** corre `canvas.toDataURL('image/jpeg', 0.7)` cada **100 ms** sin enviar a ningún sitio. CPU desperdiciado.
- **Secretos en el bundle:** `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHANNEL_ID` están hardcodeados en `src/config.ts` y `src/lib/pipedream.ts`. Cualquier visitante puede inspeccionar el JS y enviar mensajes al canal o quemar la cuota del bot. → mover a un proxy serverless (Pipedream ya está); el cliente nunca debería conocer el token.
- **`firebase.ts`** y `supabase.ts` exponen `apiKey`/`anonKey` — esto es esperado para apps front, pero el `apiKey` de Firebase debería estar restringido por dominio en la consola de GCP.
- **`flushLoop` purgaOld** itera **todos** los eventos del store en cada flush (cada 15 s). Para 24 h de historial puede ser costoso en móviles. Conviene usar un índice por `timestamp` + `IDBKeyRange.upperBound(cutoff)`.

---

## 4. Quick wins (estimación de ahorro)

| # | Cambio | Esfuerzo | Reducción de POSTs |
|---|---|---|---|
| 1 | Marcar eventos como `sent:true` cuando el batch sale → elimina re-envíos del `flushLoop` | XS (≈20 LOC) | **−50 % a −83 %** (según retries) |
| 2 | Quitar `dispatchAudioAlert` y dejar sólo `mesh.emit('AUDIO_ALERT')` | XS | **−50 %** en alertas de audio |
| 3 | Cachear + throttle Nominatim (25 m / 5 s) | S | **−80 %** en geocoding |
| 4 | Migrar `pipedreamOrchestrator.dispatchInteraction` a `mesh.emit('USER_INTERACTION')` | S | **−50 %** en arm/disarm/resolve |
| 5 | Quitar `for (threats) onThreat(t)` del path `DETECTIONS` | XS (1 línea) | **−2× a −5×** en VISION_ALERT |
| 6 | Cachear `supabase user.id` | XS | 1 auth call menos por alerta |
| 7 | `Operations.poll`: pausar si `document.hidden` | XS | hasta **−100 %** mientras la tab no se ve |
| 8 | Unificar `SpeechRecognition` a una sola instancia | M | resuelve loops de error y baja CPU |

**Ahorro agregado estimado:** ~60–70 % de los POSTs salientes en operación normal y ~75 % en escenario degradado (RTT alto / offline intermitente).

---

## 5. Recomendaciones de arquitectura (medio plazo)

1. **Proxy de cerebro propio** (Cloudflare Worker o Supabase Edge Function): los clientes envían a *un* endpoint propio que firma, agrega y reenvía a Pipedream/Telegram. Esto te permite (a) ocultar el token, (b) hacer rate-limit centralizado, (c) deduplicar a nivel servidor, (d) cambiar Pipedream sin redeploy del cliente.
2. **Schema de eventos versionado** (`event_v: 1`) — hoy hay `sentra_version: '3.0'` en headers pero no en payloads. Facilitará migrar el cerebro sin romper clientes desplegados.
3. **Service Worker para batching offline-first**: el `sw.js` actual no participa del envío. Si se traslada `BatchDispatcher` al SW, el batch sobrevive a cierres de pestaña.
4. **Observabilidad de costo**: agregar un contador en `SystemHealth` con `mesh.outboundBytes / outboundRequests` desde el cliente. Lo que no se mide, no se optimiza.

---

## 6. Próximo paso

He preparado los diffs concretos para los **8 quick wins** en `SENTRA_PROPOSED_DIFFS.md`. Cada diff:

- está acotado al archivo afectado,
- preserva el contrato público (tipos, exports),
- es independiente (puedes aprobar 1 sin los otros 7),
- incluye una nota de impacto y un breve plan de verificación manual.

**Espero tu confirmación explícita** (`aplicá el diff #X`, `aplicá todos`, `descartá el #Y`, etc.) antes de tocar el repositorio. Si querés, también puedo:

- generar tests unitarios para el `BatchDispatcher` (cubrir el bug del marcado `sent`),
- proponer el diseño del proxy de cerebro (#1 de la sección 5),
- preparar un *kill-switch* runtime para deshabilitar `pipedreamOrchestrator` legacy sin borrarlo todavía.

— *Fin del reporte.*
