/* ==========================================================
   Sentinel — Demo (lógica de modos)
   ========================================================== */

const states = {
    ASSIST:    { label: 'ASSIST',    color: '#00e676', desc: 'Sistema en asistencia activa' },
    STABILIZE: { label: 'STABILIZE', color: '#ffb300', desc: 'Estabilizando lectura anómala' },
    SOFT_WARN: { label: 'SOFT_WARN', color: '#ff6b35', desc: 'Alerta suave · verificación requerida' },
    OBSERVE:   { label: 'OBSERVE',   color: '#6b7fd7', desc: 'Modo observación pasiva' }
};

const eventMap = {
    fall:      { mode: 'SOFT_WARN', label: 'Caída detectada' },
    motion:    { mode: 'STABILIZE', label: 'Movimiento sospechoso' },
    emergency: { mode: 'SOFT_WARN', label: 'Emergencia' },
    observe:   { mode: 'OBSERVE',   label: 'Observación pasiva' }
};

// Auto-return timeout per mode (segundos). ASSIST no cuenta.
const autoReturnSecs = {
    STABILIZE: 6,
    SOFT_WARN: 10,
    OBSERVE:   8
};

// Sonidos por evento: [ [freq, dur, type, gain], ... ] secuencia de tonos.
const soundMap = {
    fall:      [[880, 0.09, 'square',   0.18], [440, 0.18, 'square',   0.16]],
    motion:    [[620, 0.10, 'triangle', 0.14], [780, 0.10, 'triangle', 0.14]],
    emergency: [[1046, 0.10, 'sawtooth', 0.20], [784, 0.10, 'sawtooth', 0.20], [1046, 0.14, 'sawtooth', 0.20]],
    observe:   [[420, 0.24, 'sine',      0.12]],
    assist:    [[520, 0.06, 'sine', 0.08], [780, 0.10, 'sine', 0.08]]
};

let currentMode = 'ASSIST';
let history = [];
let metrics = { ASSIST: 0, STABILIZE: 0, SOFT_WARN: 0, OBSERVE: 0 };
let bootTime = Date.now();
let soundOn = true;
let autoTimer = null;
let autoRemaining = 0;
let autoInterval = null;

// --- DOM refs
const displayEl = document.getElementById('mode-display');
const descEl    = document.getElementById('mode-desc');
const logEl     = document.getElementById('event-log');
const uptimeEl  = document.getElementById('uptime');
const countEl   = document.getElementById('event-count');
const clearBtn  = document.getElementById('clear-btn');
const buttons   = document.querySelectorAll('[data-event]');
const soundBtn  = document.getElementById('sound-toggle');
const autoWrap  = document.getElementById('auto-return');
const autoCount = document.getElementById('ar-count');
const metricsGrid  = document.getElementById('metrics-grid');
const metricsTotal = document.getElementById('metrics-total');
const exportJsonBtn = document.getElementById('export-json');
const exportPngBtn  = document.getElementById('export-png');

// --- Helpers
function pad(n) { return n.toString().padStart(2, '0'); }

function formatTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tickUptime() {
    const s = Math.floor((Date.now() - bootTime) / 1000);
    uptimeEl.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// --- WebAudio synth ----------------------------------------
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playSequence(seq) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    let t = ctx.currentTime + 0.01;
    seq.forEach(([freq, dur, type, gain]) => {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        t += dur + 0.03;
    });
}

// --- Mode / UI ---------------------------------------------
function applyModeStyles(mode) {
    const state = states[mode];
    document.documentElement.style.setProperty('--mode-color', state.color);
    displayEl.textContent = state.label;
    displayEl.dataset.mode = mode;
    descEl.textContent = state.desc;

    displayEl.style.animation = 'none';
    void displayEl.offsetWidth;
    displayEl.style.animation = '';
}

function renderLog() {
    if (history.length === 0) {
        logEl.innerHTML = '<div class="log-empty">Esperando eventos...</div>';
        countEl.textContent = '0 eventos';
        return;
    }
    logEl.innerHTML = history.map(entry => `
        <div class="log-entry" style="--mode-color:${entry.color};--entry-color:${entry.color}">
            <span class="log-time">[${entry.time}]</span>
            <span class="log-mode">${entry.mode}</span>
            <span class="log-text">${entry.label}</span>
        </div>
    `).join('');
    logEl.scrollTop = logEl.scrollHeight;
    countEl.textContent = `${history.length} evento${history.length === 1 ? '' : 's'}`;
}

function renderMetrics() {
    const total = Object.values(metrics).reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...Object.values(metrics));
    metricsTotal.textContent = `TOTAL ${total}`;
    metricsGrid.innerHTML = Object.entries(metrics).map(([mode, count]) => {
        const pct = Math.round((count / max) * 100);
        const color = states[mode].color;
        return `
            <div class="metric" data-testid="metric-${mode}" style="--m-color:${color}">
                <div class="metric-head">
                    <span class="metric-name">${mode}</span>
                    <span class="metric-count" data-testid="metric-${mode}-count">${count}</span>
                </div>
                <div class="metric-bar"><div class="metric-bar-fill" style="width:${pct}%"></div></div>
            </div>
        `;
    }).join('');
}

// --- Auto-return -------------------------------------------
function clearAutoTimer() {
    if (autoTimer)    { clearTimeout(autoTimer);   autoTimer = null; }
    if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
    autoWrap.hidden = true;
}

function startAutoTimer(mode) {
    clearAutoTimer();
    const secs = autoReturnSecs[mode];
    if (!secs) return;
    autoRemaining = secs;
    autoWrap.hidden = false;
    autoCount.textContent = `${autoRemaining}s`;
    autoInterval = setInterval(() => {
        autoRemaining -= 1;
        if (autoRemaining <= 0) {
            clearAutoTimer();
            returnToAssist();
        } else {
            autoCount.textContent = `${autoRemaining}s`;
        }
    }, 1000);
}

function returnToAssist() {
    currentMode = 'ASSIST';
    applyModeStyles('ASSIST');
    buttons.forEach(b => b.dataset.active = 'false');
    metrics.ASSIST += 1;
    renderMetrics();
    playSequence(soundMap.assist);
    history.push({
        time: formatTime(new Date()),
        mode: 'ASSIST',
        label: 'Retorno automático',
        color: states.ASSIST.color
    });
    if (history.length > 50) history.shift();
    renderLog();
}

// --- Event handling ----------------------------------------
function pushEvent(eventType) {
    const cfg = eventMap[eventType];
    if (!cfg) return;

    const state = states[cfg.mode];
    currentMode = cfg.mode;

    applyModeStyles(currentMode);
    playSequence(soundMap[eventType]);

    history.push({
        time: formatTime(new Date()),
        mode: state.label,
        label: cfg.label,
        color: state.color
    });
    if (history.length > 50) history.shift();

    metrics[cfg.mode] = (metrics[cfg.mode] || 0) + 1;

    renderLog();
    renderMetrics();

    buttons.forEach(b => b.dataset.active = (b.dataset.event === eventType ? 'true' : 'false'));

    startAutoTimer(cfg.mode);
}

// --- Bindings
buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        ensureAudio();
        pushEvent(btn.dataset.event);
    });
});

clearBtn.addEventListener('click', () => {
    history = [];
    metrics = { ASSIST: 0, STABILIZE: 0, SOFT_WARN: 0, OBSERVE: 0 };
    currentMode = 'ASSIST';
    clearAutoTimer();
    applyModeStyles(currentMode);
    buttons.forEach(b => b.dataset.active = 'false');
    renderLog();
    renderMetrics();
});

soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn) {
        ensureAudio();
        playSequence(soundMap.assist);
    }
});

// --- Session report export --------------------------------
function buildSessionData() {
    const now = new Date();
    const durationSec = Math.floor((Date.now() - bootTime) / 1000);
    return {
        product: 'Sentinel',
        version: 'demo_v0.2',
        session_id: `SNT-${bootTime.toString(36).toUpperCase()}`,
        generated_at: now.toISOString(),
        duration_sec: durationSec,
        current_mode: currentMode,
        metrics,
        total_events: Object.values(metrics).reduce((a, b) => a + b, 0),
        history
    };
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

function fmtDur(s) {
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function exportJSON() {
    const data = buildSessionData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `sentinel-report-${data.session_id}.json`);
}

async function exportPNG() {
    const data = buildSessionData();

    // Ensure custom fonts are loaded before painting to canvas
    try {
        await Promise.all([
            document.fonts.load('700 40px "JetBrains Mono"'),
            document.fonts.load('700 20px "JetBrains Mono"'),
            document.fonts.load('500 22px "Space Grotesk"')
        ]);
    } catch (e) { /* fallback fonts will be used */ }

    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const mono = '"JetBrains Mono", ui-monospace, Menlo, monospace';
    const sans = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#06080d');
    grad.addColorStop(1, '#0a0e18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Grid overlay
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Radial vignette in top area
    const rad = ctx.createRadialGradient(W/2, 300, 50, W/2, 300, 700);
    rad.addColorStop(0, 'rgba(0, 229, 255, 0.08)');
    rad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, 700);

    const PAD = 64;

    // Header: shield + SENTINEL
    ctx.fillStyle = '#00e5ff';
    // shield glyph
    ctx.save();
    ctx.translate(PAD, 100);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, 4);
    ctx.lineTo(4, 12);
    ctx.lineTo(4, 30);
    ctx.quadraticCurveTo(4, 52, 24, 60);
    ctx.quadraticCurveTo(44, 52, 44, 30);
    ctx.lineTo(44, 12);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 30); ctx.lineTo(22, 36); ctx.lineTo(34, 22);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#dfe4ee';
    ctx.font = `700 56px ${mono}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SENTINEL', PAD + 72, 132);

    ctx.fillStyle = '#7a8399';
    ctx.font = `500 20px ${sans}`;
    ctx.fillText('Soberanía Sobre tu Seguridad', PAD + 72, 172);

    // Report chip (top-right)
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
    roundRect(ctx, W - PAD - 220, 108, 220, 44, 22);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#00e5ff';
    ctx.font = `700 18px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText('SESSION REPORT', W - PAD - 110, 132);
    ctx.textAlign = 'left';

    // Divider
    ctx.strokeStyle = '#1e2536';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, 220); ctx.lineTo(W - PAD, 220);
    ctx.stroke();

    // Session meta row
    const metaY = 264;
    drawKV(ctx, PAD,          metaY, 'SESSION ID',   data.session_id, mono);
    drawKV(ctx, PAD + 340,     metaY, 'GENERADO',     new Date(data.generated_at).toLocaleString(), mono);
    drawKV(ctx, PAD,           metaY + 90, 'DURACIÓN',     fmtDur(data.duration_sec), mono);
    drawKV(ctx, PAD + 340,     metaY + 90, 'MODO ACTUAL',  data.current_mode, mono, states[data.current_mode].color);
    drawKV(ctx, PAD + 680,     metaY + 90, 'EVENTOS TOTALES', String(data.total_events), mono);

    // Big total number
    ctx.fillStyle = '#dfe4ee';
    ctx.font = `700 120px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(data.total_events), W - PAD, 316);
    ctx.textAlign = 'left';

    // Section label: metrics
    sectionLabel(ctx, PAD, 460, '// MÉTRICAS POR MODO', mono);

    // Bars
    const modeOrder = ['ASSIST', 'STABILIZE', 'SOFT_WARN', 'OBSERVE'];
    const maxCount = Math.max(1, ...Object.values(data.metrics));
    let by = 500;
    const barX = PAD + 220;
    const barW = W - PAD - barX - 90;
    modeOrder.forEach(mode => {
        const count = data.metrics[mode] || 0;
        const color = states[mode].color;
        const pct = count / maxCount;

        ctx.fillStyle = color;
        ctx.font = `700 24px ${mono}`;
        ctx.fillText(mode, PAD, by + 22);

        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        roundRect(ctx, barX, by + 4, barW, 28, 14); ctx.fill();

        // Bar fill
        const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        fillGrad.addColorStop(0, color);
        fillGrad.addColorStop(1, hexAlpha(color, 0.6));
        ctx.fillStyle = fillGrad;
        const fillW = Math.max(pct * barW, count ? 12 : 0);
        roundRect(ctx, barX, by + 4, fillW, 28, 14); ctx.fill();

        // Count
        ctx.fillStyle = '#dfe4ee';
        ctx.font = `700 28px ${mono}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(count), W - PAD, by + 26);
        ctx.textAlign = 'left';

        by += 72;
    });

    // Section label: events
    const evY = by + 30;
    sectionLabel(ctx, PAD, evY, '// ÚLTIMOS EVENTOS', mono);

    // Events list (last 8)
    const recent = data.history.slice(-8).reverse();
    let ey = evY + 44;
    if (recent.length === 0) {
        ctx.fillStyle = '#4a5266';
        ctx.font = `italic 20px ${mono}`;
        ctx.fillText('Sin eventos registrados en esta sesión', PAD, ey + 12);
    } else {
        recent.forEach(e => {
            // side stripe
            ctx.fillStyle = e.color;
            roundRect(ctx, PAD, ey - 2, 4, 32, 2); ctx.fill();

            ctx.fillStyle = '#4a5266';
            ctx.font = `500 20px ${mono}`;
            ctx.fillText(`[${e.time}]`, PAD + 18, ey + 20);

            ctx.fillStyle = e.color;
            ctx.font = `700 20px ${mono}`;
            ctx.fillText(e.mode, PAD + 160, ey + 20);

            ctx.fillStyle = '#dfe4ee';
            ctx.font = `500 20px ${sans}`;
            ctx.fillText(e.label, PAD + 330, ey + 20);

            ey += 42;
        });
    }

    // Footer band
    const foot = H - 90;
    ctx.strokeStyle = '#1e2536';
    ctx.beginPath();
    ctx.moveTo(PAD, foot - 20); ctx.lineTo(W - PAD, foot - 20);
    ctx.stroke();

    ctx.fillStyle = '#4a5266';
    ctx.font = `500 18px ${mono}`;
    ctx.fillText('SENTINEL_DEMO · sesión local · sin telemetría', PAD, foot + 12);

    ctx.fillStyle = '#7a8399';
    ctx.textAlign = 'right';
    ctx.fillText(data.session_id, W - PAD, foot + 12);
    ctx.textAlign = 'left';

    // Export
    await new Promise(resolve => canvas.toBlob(blob => {
        downloadBlob(blob, `sentinel-report-${data.session_id}.png`);
        resolve();
    }, 'image/png'));
}

// ---- canvas helpers
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
}

function drawKV(ctx, x, y, label, value, monoFont, valueColor) {
    ctx.fillStyle = '#4a5266';
    ctx.font = `500 16px ${monoFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y);
    ctx.fillStyle = valueColor || '#dfe4ee';
    ctx.font = `700 26px ${monoFont}`;
    ctx.fillText(value, x, y + 26);
}

function sectionLabel(ctx, x, y, text, monoFont) {
    ctx.fillStyle = '#4a5266';
    ctx.font = `700 18px ${monoFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
}

function hexAlpha(hex, a) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

exportJsonBtn.addEventListener('click', exportJSON);
exportPngBtn.addEventListener('click', () => { exportPNG(); });

// --- Boot
applyModeStyles('ASSIST');
renderLog();
renderMetrics();
tickUptime();
setInterval(tickUptime, 1000);

