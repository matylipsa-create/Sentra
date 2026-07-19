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
- Export/import del log (JSON)
- Modo simulación (secuencia de eventos aleatorios)
- Persistir métricas en localStorage entre sesiones

## Iteración v0.2 (Feb 2026)
- **Sonido WebAudio por evento**: síntesis con osciladores (sin assets); tonos distintos por evento (fall = alarma descendente square, motion = doble tono triangle, emergency = 3 tonos sawtooth alto, observe = sine grave, retorno automático = chime). Botón toggle `SFX` en el header.
- **Auto-retorno a ASSIST tras timeout**: STABILIZE 6s, SOFT_WARN 10s, OBSERVE 8s. Chip visible junto al modo con countdown en vivo; regreso genera entrada "Retorno automático" en el log e incrementa métrica ASSIST.
- **Panel de métricas por modo**: grid 2×2 con ASSIST/STABILIZE/SOFT_WARN/OBSERVE, contador y barra proporcional tintada por modo; header muestra "TOTAL n". Se resetea al pulsar LIMPIAR.
- `data-testid` añadidos: `sound-toggle-btn`, `auto-return`, `metrics-panel`, `metrics-total`, `metric-{MODE}`, `metric-{MODE}-count`.
- Verificado end-to-end: mode transitions, countdown visible, auto-return efectivo tras timeout, métricas correctas, toggle SFX cambia aria-pressed.
