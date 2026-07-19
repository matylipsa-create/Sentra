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

// --- Boot
applyModeStyles('ASSIST');
renderLog();
renderMetrics();
tickUptime();
setInterval(tickUptime, 1000);

