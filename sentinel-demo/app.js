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

let currentMode = 'ASSIST';
let history = [];
let bootTime = Date.now();

// --- DOM refs
const displayEl = document.getElementById('mode-display');
const descEl    = document.getElementById('mode-desc');
const logEl     = document.getElementById('event-log');
const uptimeEl  = document.getElementById('uptime');
const countEl   = document.getElementById('event-count');
const clearBtn  = document.getElementById('clear-btn');
const buttons   = document.querySelectorAll('[data-event]');

// --- Helpers
function pad(n) { return n.toString().padStart(2, '0'); }

function formatTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tickUptime() {
    const s = Math.floor((Date.now() - bootTime) / 1000);
    uptimeEl.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function applyModeStyles(mode) {
    const state = states[mode];
    document.documentElement.style.setProperty('--mode-color', state.color);
    displayEl.textContent = state.label;
    displayEl.dataset.mode = mode;
    descEl.textContent = state.desc;

    // re-trigger entrance animation
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

function pushEvent(eventType) {
    const cfg = eventMap[eventType];
    if (!cfg) return;

    const state = states[cfg.mode];
    currentMode = cfg.mode;

    applyModeStyles(currentMode);

    history.push({
        time: formatTime(new Date()),
        mode: state.label,
        label: cfg.label,
        color: state.color
    });
    // cap history
    if (history.length > 50) history.shift();
    renderLog();

    // active button highlight
    buttons.forEach(b => b.dataset.active = (b.dataset.event === eventType ? 'true' : 'false'));
}

// --- Bindings
buttons.forEach(btn => {
    btn.addEventListener('click', () => pushEvent(btn.dataset.event));
});

clearBtn.addEventListener('click', () => {
    history = [];
    currentMode = 'ASSIST';
    applyModeStyles(currentMode);
    buttons.forEach(b => b.dataset.active = 'false');
    renderLog();
});

// --- Boot
applyModeStyles('ASSIST');
renderLog();
tickUptime();
setInterval(tickUptime, 1000);
