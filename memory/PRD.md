# Sentinel — Demo (Esqueleto base)

## Problema original
Construir el esqueleto de la demo de Sentinel (HTML/CSS/JS puro) en carpeta `sentinel-demo`, con lógica de modos (ASSIST / STABILIZE / SOFT_WARN / OBSERVE) accionados por 3 botones (fall, motion, emergency).

## Decisiones del usuario
- Formato: HTML / CSS / JS puro (no React)
- Alcance: mejorado visualmente, misma lógica
- Backend: no (solo frontend / navegador)

## Arquitectura
- Estático. Carpeta canónica: `/app/sentinel-demo/` (index.html, style.css, app.js)
- Copia servida por el dev-server para preview en: `/app/frontend/public/sentinel-demo/`
- URL de acceso: `${REACT_APP_BACKEND_URL}/sentinel-demo/index.html`

## Implementado (Feb 2026)
- `index.html` con header (marca + status), panel de MODO OPERATIVO, log de eventos y grid de botones
- `style.css` con estética HUD ciber: fondo oscuro `#06080d`, grid animado, scanline, anillos de pulso, tipografías `JetBrains Mono` + `Space Grotesk`, glow por modo, botones con shine hover
- `app.js` con:
  - `states`: ASSIST(#00e676), STABILIZE(#ffb300), SOFT_WARN(#ff6b35), OBSERVE(#6b7fd7)
  - `eventMap`: fall→SOFT_WARN, motion→STABILIZE, emergency→SOFT_WARN, observe→OBSERVE
  - Historial (cap 50), timestamps, uptime, contador de eventos, botón LIMPIAR
- 4º botón adicional "Observación pasiva" para poder disparar el modo OBSERVE
- `data-testid` en botones interactivos (event-*-btn, clear-log-btn)

## Verificación
- Screenshot inicial: ASSIST verde + rings ✔
- Fall → SOFT_WARN naranja ✔
- Motion → STABILIZE amarillo ✔
- Observe → OBSERVE azul ✔
- Emergency → SOFT_WARN ✔
- LIMPIAR → vuelve a ASSIST, log vacío ✔

## Backlog / P1
- QR embebido en el PNG para tracking / captura de leads
- Import de sesión (drag&drop del JSON) para hacer replay
- Estadísticas globales (frecuencia por hora, secuencias más comunes)

## Iteración v0.4 (Feb 2026) — Sim, Share, Lifetime
- **Modo simulación** (`simulation-toggle-btn`): botón SIM en header con estado activo (glow naranja pulsante). Al activarse, `scheduleSimTick` dispara eventos aleatorios cada 1.4–3.8s desde `['fall','motion','emergency','observe']`. Toast confirma inicio/detención.
- **Web Share API** (`share-report-btn`): genera PNG, lo envía como File vía `navigator.share({files:[file], text, title})`. Fallback multi-nivel: si `navigator.canShare` no soporta files → descarga PNG + copia resumen al portapapeles + toast informativo. Si el usuario aborta → sin acción.
- **Persistencia lifetime** en `localStorage['sentinel_demo_v1']`: contador de sesiones, métricas históricas por modo, last_session_id. Se guarda tras cada evento y en reset. Badge `S{n} · Σ {total}` en header de métricas + sub-contador por métrica (`histórico N` en color tenue) + footer `Sesión #N · histórico M eventos en N sesiones` + botón `borrar histórico` (con confirm).
- **LIMPIAR** ahora solo resetea la sesión actual (metrics + history + autoTimer + currentMode), preservando lifetime.
- **Toast** flotante inferior para feedback (SIM iniciada/detenida, share, reset, errores).
- **Reporte PNG/JSON** actualizados: incluyen `session_number`, `lifetime_metrics`, `lifetime_total`. El PNG ahora muestra "MÉTRICAS · SESIÓN #N (histórico total: M)" y en cada barra el count actual + `Σlifetime` a la derecha.
- Bug fix: `loadLifetime()` no se llamaba en Boot (perdía sesiones anteriores), `<script>` se cargaba antes que `#toast` provocando null refs — ambos corregidos.

## Data-testids nuevos
`simulation-toggle-btn`, `share-report-btn`, `lifetime-badge`, `lifetime-summary`, `reset-lifetime-btn`, `metric-{MODE}-lifetime`, `toast`.

## Iteración v0.3 (Feb 2026) — Reporte de sesión descargable
- **Export JSON** (`export-json-btn`): descarga `sentinel-report-{SESSION_ID}.json` con `session_id`, `generated_at`, `duration_sec`, `current_mode`, `metrics`, `total_events`, `history`.
- **Export PNG** (`export-png-btn`): renderiza en canvas 1080×1350 (formato social) el reporte con branding, session id, duración, modo actual coloreado, total grande, barras por modo con degradado, últimos 8 eventos con stripe coloreada. Sin dependencias externas (canvas 2D nativo). Pre-carga fuentes JetBrains Mono + Space Grotesk antes de pintar.
- Botones ubicados en el header del panel de MÉTRICAS junto al `TOTAL`.
- Verificado: JSON 952B con estructura correcta y 5 eventos; PNG 849KB con reporte legible y compartible.

## Iteración v0.2 (Feb 2026)
- **Sonido WebAudio por evento**: síntesis con osciladores (sin assets); tonos distintos por evento (fall = alarma descendente square, motion = doble tono triangle, emergency = 3 tonos sawtooth alto, observe = sine grave, retorno automático = chime). Botón toggle `SFX` en el header.
- **Auto-retorno a ASSIST tras timeout**: STABILIZE 6s, SOFT_WARN 10s, OBSERVE 8s. Chip visible junto al modo con countdown en vivo; regreso genera entrada "Retorno automático" en el log e incrementa métrica ASSIST.
- **Panel de métricas por modo**: grid 2×2 con ASSIST/STABILIZE/SOFT_WARN/OBSERVE, contador y barra proporcional tintada por modo; header muestra "TOTAL n". Se resetea al pulsar LIMPIAR.
- `data-testid` añadidos: `sound-toggle-btn`, `auto-return`, `metrics-panel`, `metrics-total`, `metric-{MODE}`, `metric-{MODE}-count`.
- Verificado end-to-end: mode transitions, countdown visible, auto-return efectivo tras timeout, métricas correctas, toggle SFX cambia aria-pressed.
