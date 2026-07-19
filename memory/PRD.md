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
- Sonido opcional por evento (WebAudio, sin assets)
- Auto-return a ASSIST tras N segundos
- Export/import del log (JSON)
- Vista de estadísticas (conteo por modo)
- Modo simulación (secuencia de eventos aleatorios)
