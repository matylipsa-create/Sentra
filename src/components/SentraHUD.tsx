import {
  useState, useEffect, useRef, useCallback, lazy, Suspense,
} from 'react';
import {
  Radio, MapPin, Activity, AlertTriangle, CheckCircle, XCircle,
  Wifi, WifiOff, Database, Lock, Unlock, Terminal, Camera, Play, Loader,
} from 'lucide-react';
import { useSentraCore } from '../hooks/useSentraCore';
import { useTacticalDashboard } from '../hooks/useTacticalDashboard';
import { useDemoMode } from '../hooks/useDemoMode';
import { useSpeechBridge } from '../hooks/useSpeechBridge';
import { useApp } from '../context/AppContext';
import { mesh } from '../lib/SentraMesh';
import AudioEngine from './AudioEngine';
import type { AudioAlertLog } from './AudioEngine';
import type { MdaoAlertType } from './SentraVisionPanel';

const SentraVisionPanel = lazy(() => import('./SentraVisionPanel'));
const SentraIAPanel     = lazy(() => import('./SentraIAPanel'));

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = 'BOOT' | 'STANDBY' | 'ARMED' | 'ALERT' | 'CODE_RED' | 'LOCKDOWN';

interface TacticalLog {
  id:    number;
  ts:    Date;
  msg:   string;
  level: 'sys' | 'warn' | 'crit' | 'ok' | 'net';
}

interface Detection {
  label:      string;
  confidence: number;
  timestamp:  Date;
  eventId:    number;
}

const PHASE_COLOR: Record<Phase, string> = {
  BOOT:     '#00FF00',
  STANDBY:  '#00FF00',
  ARMED:    '#00FF00',
  ALERT:    '#FF4400',
  CODE_RED:  '#FF0000',
  LOCKDOWN: '#F59E0B',
};

const LEVEL_COLOR: Record<TacticalLog['level'], string> = {
  sys:  '#00FF00',
  ok:   '#22c55e',
  warn: '#F59E0B',
  crit: '#EF4444',
  net:  '#00BFFF',
};

// ── Debounce ─────────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms: number): T {
  const [deb, setDeb] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return deb;
}

// ── Radar SVG ────────────────────────────────────────────────────────────────
function RadarRings({ armed, phase }: { armed: boolean; phase: Phase }) {
  const [angle, setAngle] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!armed) { setAngle(0); return; }
    const tick = () => { setAngle((a) => (a + 1.2) % 360); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [armed]);

  const color = PHASE_COLOR[phase];
  const cx = 150, cy = 150;
  const rings = [44, 80, 120];

  return (
    <svg viewBox="0 0 300 300" className="w-full h-full"
      style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}>
      <line x1={cx} y1={0} x2={cx} y2={300} stroke={color} strokeWidth="0.4" strokeOpacity="0.25" />
      <line x1={0} y1={cy} x2={300} y2={cy} stroke={color} strokeWidth="0.4" strokeOpacity="0.25" />
      {rings.map((r) => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="0.8" strokeOpacity={armed ? 0.55 : 0.15} />
      ))}
      {armed && (
        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <defs>
            <radialGradient id="sweep">
              <stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d={`M${cx},${cy} L${cx},${cy - 120} A120,120 0 0,1 ${cx + 120 * Math.sin((50 * Math.PI) / 180)},${cy - 120 * Math.cos((50 * Math.PI) / 180)} Z`}
            fill="url(#sweep)"
          />
        </g>
      )}
      {phase === 'ALERT' && (
        <>
          <circle cx={cx + 55} cy={cy - 30} r="5" fill="#FF4400" opacity="0.9">
            <animate attributeName="r" values="4;7;4" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx={cx - 20} cy={cy + 65} r="4" fill="#FF4400" opacity="0.8">
            <animate attributeName="r" values="3;6;3" dur="1.3s" repeatCount="indefinite" />
          </circle>
        </>
      )}
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <circle cx={cx} cy={cy} r="11" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
    </svg>
  );
}

function DiagRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs font-mono" style={{ color: '#00FF0070' }}>{label}</span>
      {ok
        ? <CheckCircle size={11} style={{ color: '#00FF00' }} />
        : <XCircle size={11} style={{ color: '#FF4400' }} />}
    </div>
  );
}

function CameraModal({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-6">
      <div className="border rounded-lg p-6 max-w-xs w-full text-center"
        style={{ borderColor: '#F59E0B', background: '#0a0a00' }}>
        <Camera size={28} style={{ color: '#F59E0B', margin: '0 auto 12px' }} />
        <p className="text-sm font-bold mb-2" style={{ color: '#F59E0B' }}>Cámara Bloqueada</p>
        <p className="text-xs mb-5" style={{ color: '#F59E0B90' }}>{msg}</p>
        <button onClick={onDismiss}
          className="w-full py-2 rounded border text-xs font-bold tracking-widest"
          style={{ borderColor: '#F59E0B', color: '#F59E0B', background: '#F59E0B10' }}>
          ENTENDIDO
        </button>
      </div>
    </div>
  );
}

// ── Cognitive Load Ring ───────────────────────────────────────────────────────
function CognitiveRing({ value, alert }: { value: number; alert: boolean }) {
  const pct    = Math.min(100, Math.max(0, value));
  const r      = 22;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color  = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : pct >= 50 ? '#eab308' : '#00FF88';
  const label  = pct >= 90 ? 'CRÍTICO' : pct >= 70 ? 'ELEVADO' : pct >= 50 ? 'MODERADO' : 'ESTABLE';

  return (
    <div className="flex items-center gap-2 px-2">
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="#ffffff08" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 26 26)"
          style={{ transition: 'stroke-dashoffset 0.7s ease, stroke 0.5s ease' }} />
        <text x="26" y="30" textAnchor="middle" fill={color}
          fontSize="10" fontWeight="bold" fontFamily="monospace">
          {Math.round(pct)}
        </text>
      </svg>
      <div className="flex flex-col">
        <span style={{ color: '#ffffff40', fontSize: '7px', letterSpacing: '0.14em', fontFamily: 'monospace' }}>
          CARGA COG.
        </span>
        <span className={alert ? 'animate-pulse' : ''}
          style={{ color, fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace' }}>
          {label}
        </span>
        <span style={{ color: `${color}55`, fontSize: '7px', fontFamily: 'monospace' }}>
          CORE EVOLIS
        </span>
      </div>
    </div>
  );
}

// ── System Health LEDs ────────────────────────────────────────────────────────
function SystemHealth({
  diag, showIA, armed, pendingMessages,
}: {
  diag: { camera: boolean; microphone: boolean; geolocation: boolean; indexeddb: boolean; webWorker: boolean };
  showIA: boolean;
  armed: boolean;
  pendingMessages: number;
}) {
  const indicators = [
    { key: 'CAM',   ok: diag.camera },
    { key: 'AUDIO', ok: diag.microphone },
    { key: 'GPS',   ok: diag.geolocation },
    { key: 'IA',    ok: showIA && armed },
    { key: 'IDB',   ok: diag.indexeddb },
    { key: 'FIFO',  ok: pendingMessages === 0 },
  ];

  return (
    <div className="px-2 pb-1.5">
      <p style={{ color: '#ffffff20', fontSize: '7px', letterSpacing: '0.18em', fontFamily: 'monospace', marginBottom: '4px' }}>
        SYSTEM HEALTH
      </p>
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {indicators.map(({ key, ok }) => (
          <div key={key} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
              background: ok ? '#00FF00' : '#ef4444',
              boxShadow:  ok ? '0 0 5px #00FF0070' : '0 0 3px #ef444440',
            }} />
            <span style={{ color: ok ? '#00FF0060' : '#ef444460', fontSize: '8px', fontFamily: 'monospace' }}>
              {key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Evidence Card (full-width strip below vision) ─────────────────────────────
function EvidenceCard({ detection, address }: { detection: Detection; address: string }) {
  const conf      = Math.round(detection.confidence * 100);
  const confColor = conf >= 90 ? '#ef4444' : conf >= 75 ? '#f97316' : '#eab308';

  return (
    <div className="border-t flex-shrink-0" style={{ borderColor: `${confColor}30`, background: 'rgba(4,8,20,0.98)' }}>
      <div className="flex items-center justify-between px-3 py-1"
        style={{ background: `${confColor}12`, borderBottom: `1px solid ${confColor}25` }}>
        <span style={{ color: confColor, fontSize: '8px', fontWeight: 700, letterSpacing: '0.18em', fontFamily: 'monospace' }}>
          CENTRO DE EVIDENCIA
        </span>
        <div className="flex items-center gap-2">
          <span className="animate-pulse" style={{ color: '#ef4444', fontSize: '7px', fontWeight: 700, fontFamily: 'monospace' }}>
            ● ACTIVO
          </span>
          <span style={{ color: `${confColor}70`, fontSize: '8px', fontFamily: 'monospace' }}>
            EVT-{String(detection.eventId).padStart(5, '0')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-white/5">
        {[
          { label: 'OBJETIVO',  value: detection.label.toUpperCase(), hl: undefined },
          { label: 'CONFIANZA', value: `${conf}%`, hl: confColor },
          { label: 'UBICACIÓN', value: address || 'Resolviendo...' },
          {
            label: 'HORA',
            value: detection.timestamp.toLocaleTimeString('es-AR', {
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            }),
          },
        ].map(({ label, value, hl }) => (
          <div key={label} className="flex flex-col px-2.5 py-1.5">
            <span style={{ color: '#ffffff30', fontSize: '7px', fontFamily: 'monospace', letterSpacing: '0.12em' }}>
              {label}
            </span>
            {hl ? (
              <span className="font-bold px-1.5 py-0.5 rounded self-start mt-0.5"
                style={{ color: hl, background: `${hl}18`, border: `1px solid ${hl}40`, fontSize: '11px', fontFamily: 'monospace' }}>
                {value}
              </span>
            ) : (
              <span className="font-bold truncate" style={{ color: '#ffffff', fontSize: '9px', fontFamily: 'monospace' }}>
                {value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main HUD ─────────────────────────────────────────────────────────────────
export default function SentraHUD() {
  const { geo, diag, arm, disarm, triggerHaptic, pendingMessages, rtt } = useSentraCore();
  const { state, setArmed: setGlobalArmed } = useApp();
  const { metrics, stressAlert } = useTacticalDashboard();
  const demoMode = useDemoMode();

  // armed is the single source of truth — persisted in AppContext + localStorage
  const armed = state.armed;

  // Fase 2: puente único de speech. Se activa solo si el sistema está armado.
  // Reemplaza las dos instancias de SpeechRecognition que vivían en
  // AudioEngine y SentraIAPanel. El worker sentraIA hace TODO el matching
  // (keywords + coerción + silent triggers) y emite al mesh.
  const { listening: speechListening, lastTranscript } = useSpeechBridge({
    active: armed,
    geo,
  });

  const [phase,         setPhase]         = useState<Phase>(() => state.armed ? 'ARMED' : 'BOOT');
  const [rawLogs,       setRawLogs]       = useState<TacticalLog[]>([]);
  const [showVision,    setShowVision]    = useState(state.armed);
  const [showIA,        setShowIA]        = useState(state.armed);
  const [arming,        setArming]        = useState(false);
  const [cameraModal,   setCameraModal]   = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<Detection | null>(null);

  const logs       = useDebounce(rawLogs, 400);
  const logIdRef   = useRef(0);
  const eventIdRef = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, level: TacticalLog['level'] = 'sys') => {
    setRawLogs((prev) => [
      ...prev.slice(-199),
      { id: ++logIdRef.current, ts: new Date(), msg, level },
    ]);
  }, []);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // Boot sequence — skips straight to ARMED if returning from another tab
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || diag.indexeddb === undefined) return;
    booted.current = true;
    const seq = async () => {
      addLog('🟢 SENTRA v3.0 iniciando...', 'sys');
      await new Promise((r) => setTimeout(r, 350));
      addLog('🟢 SentraMesh: IndexedDB OK', 'ok');
      await new Promise((r) => setTimeout(r, 250));
      addLog('⚙️ Autodiagnóstico de hardware...', 'sys');
      await new Promise((r) => setTimeout(r, 500));
      addLog(`${diag.camera ? '🟢' : '🔴'} CAM: ${diag.camera ? 'OK' : 'NO DETECTADA'}`, diag.camera ? 'ok' : 'warn');
      addLog(`${diag.microphone ? '🟢' : '🔴'} MIC: ${diag.microphone ? 'OK' : 'NO DETECTADO'}`, diag.microphone ? 'ok' : 'warn');
      addLog(`${diag.geolocation ? '🟢' : '🔴'} GEO: ${diag.geolocation ? 'OK' : 'FALLO'}`, diag.geolocation ? 'ok' : 'crit');
      addLog(`🟢 IDB: ${diag.indexeddb ? 'OK' : 'FALLO'}`, diag.indexeddb ? 'ok' : 'crit');
      addLog(`🟢 WORKERS: ${diag.webWorker ? 'OK' : 'FALLO'}`, diag.webWorker ? 'ok' : 'crit');
      await new Promise((r) => setTimeout(r, 300));

      if (state.armed) {
        addLog('🔒 Sesión armada restaurada desde estado persistente', 'ok');
        setPhase('ARMED');
        setShowVision(true);
        setShowIA(true);
        await arm(); // re-attach geo watchers
      } else {
        addLog(
          diag.ready ? '🟢 Sistema listo. Esperando armado.' : '⚠️ Sistema degradado — revisar permisos.',
          diag.ready ? 'ok' : 'warn'
        );
        setPhase('STANDBY');
      }
    };
    seq();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diag.ready]);

  // Mesh event subscriptions
  useEffect(() => {
    const unsubs = [
      mesh.on('VISION_ALERT', (e) => {
        const { label, confidence } = e.payload as { label: string; confidence: number };
        setPhase('ALERT');
        addLog(`👁️ VISIÓN: ${label.toUpperCase()} detectado — ${(confidence * 100).toFixed(0)}% confianza`, 'crit');
        triggerHaptic([200, 100, 200, 100, 400]);
        setLastDetection({ label, confidence, timestamp: new Date(), eventId: ++eventIdRef.current });
      }),
      mesh.on('SPEECH_COERCION', (e) => {
        const { isSilentTrigger } = e.payload as { isSilentTrigger: boolean };
        setPhase('CODE_RED');
        addLog(isSilentTrigger ? '🚨 IA: CÓDIGO ROJO SILENCIOSO — protocolo activo' : '⚠️ IA: Coacción detectada', 'crit');
        triggerHaptic([500, 200, 500, 200, 1000]);
      }),
      mesh.on('EMERGENCY_DISPATCH', () => {
        addLog('📡 DISPATCH → Pipedream OK · Telegram notificado', 'net');
        setPhase('LOCKDOWN');
        setTimeout(() => setPhase(armed ? 'ARMED' : 'STANDBY'), 10_000);
      }),
      mesh.on('GEO_UPDATE', () => {
        if (armed) addLog(`📍 GEO: ${geo.address}`, 'net');
      }),
      mesh.on('AUDIO_ALERT', (e) => {
        const { alerta } = e.payload as { alerta: string };
        addLog(`🔴 AUDIO: ${alerta}`, 'crit');
        setPhase((p) => (p === 'ARMED' ? 'ALERT' : p));
        triggerHaptic([150, 80, 150]);
      }),
      // Fase 2 — palabras clave detectadas por el worker sentraIA.
      // Reemplaza la ruta AudioEngine.startSpeech → emitAlert('PALABRA CLAVE: ...').
      mesh.on('KEYWORD_DETECTED', (e) => {
        const { keyword } = e.payload as { keyword: string };
        addLog(`🎙️ IA: PALABRA CLAVE — ${keyword.toUpperCase()}`, 'crit');
        setPhase((p) => (p === 'ARMED' ? 'ALERT' : p));
        triggerHaptic([150, 80, 150]);
      }),
      mesh.on('FALLBACK_QUEUED',  () => addLog('💾 IDB: Evento encolado en FIFO', 'warn')),
      mesh.on('FALLBACK_FLUSHED', (e) => {
        const { count } = e.payload as { count: number };
        addLog(`✅ IDB: ${count} evento(s) sincronizados desde cola`, 'ok');
      }),
      mesh.on('CAMERA_PERMISSION_DENIED', (e) => {
        const { message } = e.payload as { message: string };
        setCameraModal(message);
      }),
      // ── MDAO events ──────────────────────────────────────────────────────
      mesh.on('ADVERSARIAL_GARMENT', (e) => {
        const { label, confidence } = e.payload as { label: string; confidence: number };
        setPhase('ALERT');
        addLog(`⚠️ MDAO-A: PRENDA ADVERSARIA — ${label.toUpperCase()} (${((confidence ?? 0) * 100).toFixed(0)}%)`, 'crit');
        triggerHaptic([300, 100, 300]);
        setLastDetection({
          label:      `PRENDA ADVERSARIA: ${label}`,
          confidence: confidence ?? 0.9,
          timestamp:  new Date(),
          eventId:    ++eventIdRef.current,
        });
      }),
      mesh.on('FACE_DENSITY', (e) => {
        const { count } = e.payload as { count: number };
        addLog(`🟣 MDAO-B: Saturación por Ropa Adversaria Facial — ${count} rostros solapados`, 'warn');
        setPhase((p) => (p === 'ARMED' ? 'ALERT' : p));
        triggerHaptic([100, 50, 100]);
      }),
      mesh.on('IR_SABOTAGE', (e) => {
        const { whiteness } = e.payload as { whiteness: number };
        setPhase('LOCKDOWN');
        addLog(`⚡ MDAO-C: SABOTAJE IR — saturación blanca ${((whiteness ?? 0) * 100).toFixed(0)}% — LOCKDOWN`, 'crit');
        triggerHaptic([500, 150, 500, 150, 800]);
        setTimeout(() => setPhase(armed ? 'ARMED' : 'STANDBY'), 15_000);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [armed, geo.address, triggerHaptic, addLog]);

  // ARM toggle — writes to global context for cross-tab persistence
  const handleArmToggle = useCallback(async () => {
    if (arming) return;
    setArming(true);
    if (!armed) {
      addLog('🔒 Armando sistema...', 'sys');
      await arm();
      setGlobalArmed(true);
      setPhase('ARMED');
      setShowVision(true);
      setShowIA(true);
      addLog('🟢 Sistema Inicializado y Armado', 'ok');
      addLog('🟢 SentraVision + SentraIA + AudioEngine activos', 'ok');
      triggerHaptic([100, 50, 100]);
      // Diff #4 — reemplaza pipedreamOrchestrator.dispatchInteraction.
      mesh.emit('USER_INTERACTION', {
        action: 'SYSTEM_ARMED', phase: 'ARMED',
        geo: { latitude: geo.latitude, longitude: geo.longitude ?? null, address: geo.address },
        timestamp: Date.now(), operator: 'Matías',
      });
    } else {
      addLog('🔓 Desarmando sistema...', 'warn');
      await disarm();
      setGlobalArmed(false);
      setPhase('STANDBY');
      setShowVision(false);
      setShowIA(false);
      setLastDetection(null);
      addLog('⚪ Sistema DESARMADO', 'sys');
      triggerHaptic([300]);
      // Diff #4 — reemplaza pipedreamOrchestrator.dispatchInteraction.
      mesh.emit('USER_INTERACTION', {
        action: 'SYSTEM_DISARMED', phase: 'STANDBY',
        geo: { latitude: geo.latitude, longitude: geo.longitude ?? null, address: geo.address },
        timestamp: Date.now(), operator: 'Matías',
      });
    }
    setArming(false);
  }, [armed, arming, arm, disarm, addLog, triggerHaptic, geo, setGlobalArmed]);

  const handleAudioAlert = useCallback((log: AudioAlertLog) => {
    addLog(`🔴 AUDIO: ${log.alerta}`, 'crit');
    triggerHaptic([150, 80, 150]);
    setPhase('ALERT');
  }, [addLog, triggerHaptic]);

  // MDAO callback — routes anomaly directly through mesh so BatchDispatcher + IDB handle it
  const handleMdaoAlert = useCallback((type: MdaoAlertType, detail: string) => {
    const payloads: Record<MdaoAlertType, object> = {
      ADVERSARIAL_GARMENT: { anomalyType: 'ADVERSARIAL_GARMENT', detail },
      FACE_DENSITY:        { anomalyType: 'FACE_DENSITY',        detail },
      IR_SABOTAGE:         { anomalyType: 'IR_SABOTAGE',         detail },
    };
    mesh.emit(type, payloads[type]);
  }, []);

  const color       = PHASE_COLOR[phase];
  const stressLevel = metrics.stressLevel;

  return (
    <div className="flex flex-col font-mono select-none" style={{ background: '#000000', color: '#00FF00', minHeight: '100%' }}>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 border-b flex-shrink-0"
        style={{ borderColor: `${color}25`, background: `${color}06` }}>
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-[0.2em] text-xs" style={{ color }}>SENTRA</span>
          <span className="text-xs" style={{ color: `${color}50` }}>v3.0</span>
          {state.armed && (
            <span className="text-xs font-bold tracking-widest animate-pulse" style={{ color: '#00FF00' }}>● ACTIVO</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {rtt > 0 && rtt < 200
              ? <Wifi size={10} style={{ color: '#00FF00' }} />
              : <WifiOff size={10} style={{ color: '#F59E0B' }} />}
            <span style={{ color: rtt > 200 ? '#F59E0B' : '#00FF00', fontSize: 9 }}>
              {rtt > 0 ? `${Math.round(rtt)}ms` : '—'}
            </span>
          </div>
          {pendingMessages > 0 && (
            <div className="flex items-center gap-1">
              <Database size={10} style={{ color: '#F59E0B' }} />
              <span style={{ color: '#F59E0B', fontSize: 9 }}>{pendingMessages}</span>
            </div>
          )}
          <span className="px-1.5 py-0.5 rounded text-xs font-bold tracking-widest"
            style={{ color, background: `${color}12`, border: `1px solid ${color}35` }}>
            {phase}
          </span>
          <button
            onClick={() => !demoMode.isRunning && demoMode.run({ arm, armed, addLog, geo })}
            disabled={demoMode.isRunning}
            title="Modo Demostración — secuencia táctica 30 segundos"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all"
            style={{
              background:    demoMode.isRunning ? 'rgba(234,179,8,0.18)' : 'rgba(234,179,8,0.07)',
              border:        `1px solid rgba(234,179,8,${demoMode.isRunning ? '0.55' : '0.28'})`,
              color:         demoMode.isRunning ? '#eab308' : '#eab30868',
              cursor:        demoMode.isRunning ? 'not-allowed' : 'pointer',
              fontSize:      '9px', fontWeight: 700, letterSpacing: '0.1em',
            }}
          >
            {demoMode.isRunning
              ? <Loader size={9} className="animate-spin" style={{ color: '#eab308' }} />
              : <Play size={9} />}
            <span>DEMO</span>
          </button>
        </div>
      </div>

      {/* ── Top grid: 40/60 asimétrico ─────────────────────────────────────── */}
      <div className="grid flex-shrink-0" style={{ gridTemplateColumns: '40% 60%', minHeight: '220px' }}>

        {/* LEFT — Radar + ARM + Diag */}
        <div className="flex flex-col items-center justify-between py-2 px-2 border-r"
          style={{ borderColor: `${color}18` }}>

          <div className="relative w-full" style={{ maxWidth: '160px', aspectRatio: '1' }}>
            <RadarRings armed={armed} phase={phase} />
            <button
              onClick={handleArmToggle}
              disabled={arming || phase === 'LOCKDOWN'}
              aria-label={armed ? 'Desarmar SENTRA' : 'Armar SENTRA'}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full transition-all active:scale-95 focus:outline-none"
              style={{ background: 'transparent', cursor: arming || phase === 'LOCKDOWN' ? 'not-allowed' : 'pointer' }}
            >
              <Radio size={22} style={{ color, filter: `drop-shadow(0 0 8px ${color})` }}
                className={armed ? 'animate-pulse' : ''} />
              <span className="text-xs font-bold tracking-[0.22em]" style={{ color }}>
                {arming ? '···' : armed ? 'ARMADO' : 'RADAR'}
              </span>
            </button>
          </div>

          <button onClick={handleArmToggle} disabled={arming || phase === 'LOCKDOWN'}
            className="w-full py-1 rounded border font-bold text-xs tracking-widest transition-all active:scale-95 mt-1"
            style={{
              borderColor: color, color,
              background:  armed ? `${color}18` : 'transparent',
              boxShadow:   armed ? `0 0 10px ${color}35` : 'none',
              opacity:     phase === 'LOCKDOWN' ? 0.4 : 1,
            }}>
            {armed
              ? <><Lock size={11} className="inline mr-1" />DESARMAR</>
              : <><Unlock size={11} className="inline mr-1" />ARMAR</>}
          </button>

          <div className="w-full px-1 mt-1">
            <p style={{ color: `${color}40`, fontSize: '7px', letterSpacing: '0.18em', marginBottom: '2px' }}>HW</p>
            <DiagRow label="CAM" ok={diag.camera} />
            <DiagRow label="MIC" ok={diag.microphone} />
            <DiagRow label="GEO" ok={diag.geolocation} />
            <DiagRow label="IDB" ok={diag.indexeddb} />
          </div>
        </div>

        {/* RIGHT — Info panels */}
        <div className="flex flex-col">

          {/* Geo + Operator */}
          <div className="grid grid-cols-2 border-b" style={{ borderColor: `${color}18` }}>
            <div className="p-2 border-r" style={{ borderColor: `${color}18` }}>
              <div className="flex items-center gap-1 mb-0.5">
                <MapPin size={8} style={{ color }} />
                <span style={{ color: `${color}55`, fontSize: 7, letterSpacing: '0.15em' }}>POSICIÓN</span>
              </div>
              <p className="font-mono leading-tight" style={{ color, fontSize: '8px' }}>
                {geo.latitude !== null
                  ? `${geo.latitude.toFixed(4)}, ${geo.longitude?.toFixed(4)}`
                  : armed ? 'Adquiriendo...' : '—'}
              </p>
              <p className="leading-tight mt-0.5 truncate" style={{ color: `${color}60`, fontSize: '7px' }}>
                {geo.address}
              </p>
            </div>
            <div className="p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Activity size={8} style={{ color }} />
                <span style={{ color: `${color}55`, fontSize: 7, letterSpacing: '0.15em' }}>OPERADOR</span>
              </div>
              <p className="text-xs font-bold" style={{ color }}>Matías</p>
              <p style={{ color: `${color}50`, fontSize: '8px' }}>{armed ? 'En servicio' : 'En espera'}</p>
              {state.armedAt && (
                <p style={{ color: `${color}35`, fontSize: '7px', fontFamily: 'monospace' }}>
                  desde {new Date(state.armedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>

          {/* Cognitive Load + System Health */}
          <div className="grid grid-cols-2 border-b flex-shrink-0" style={{ borderColor: `${color}18` }}>
            <div className="py-1.5 border-r" style={{ borderColor: `${color}18` }}>
              <CognitiveRing value={stressLevel} alert={stressAlert} />
            </div>
            <div className="pt-1.5">
              <SystemHealth
                diag={diag}
                showIA={showIA}
                armed={armed}
                pendingMessages={pendingMessages}
              />
            </div>
          </div>

          {showIA && (
            <Suspense fallback={null}>
              <SentraIAPanel
                listening={speechListening}
                lastTranscript={lastTranscript}
              />
            </Suspense>
          )}

          {armed && <AudioEngine geo={geo} onAlert={handleAudioAlert} />}
        </div>
      </div>

      {/* ── Vision panel ─────────────────────────────────────────────────── */}
      <div className="w-full border-t flex-shrink-0"
        style={{ height: '46vw', maxHeight: '300px', minHeight: '180px', borderColor: `${color}20` }}>
        {showVision ? (
          <Suspense fallback={
            <div className="h-full flex items-center justify-center" style={{ background: '#000' }}>
              <p className="text-xs animate-pulse" style={{ color: `${color}70` }}>Cargando SentraVision...</p>
            </div>
          }>
            <SentraVisionPanel
              onThreat={(label, confidence) => mesh.emit('VISION_ALERT', { label, confidence })}
              onCameraBlocked={(msg) => mesh.emit('CAMERA_PERMISSION_DENIED', { message: msg })}
              onMdaoAlert={handleMdaoAlert}
              location={geo.latitude !== null ? { latitude: geo.latitude, longitude: geo.longitude! } : null}
            />
          </Suspense>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1" style={{ background: '#000' }}>
            <p className="text-xs tracking-widest" style={{ color: `${color}25` }}>VISIÓN</p>
            <p style={{ color: `${color}20`, fontSize: '9px' }}>inactiva · armar sistema</p>
          </div>
        )}
      </div>

      {/* ── Centro de Evidencia — aparece debajo del feed al detectar ────── */}
      {lastDetection && (
        <EvidenceCard detection={lastDetection} address={geo.address} />
      )}

      {/* ── Línea Temporal de Eventos ─────────────────────────────────────── */}
      <div className="border-t flex flex-col flex-shrink-0" style={{ borderColor: `${color}18`, height: '120px' }}>
        <div className="flex items-center gap-2 px-3 py-0.5 border-b flex-shrink-0"
          style={{ borderColor: `${color}12` }}>
          <Terminal size={9} style={{ color: `${color}60` }} />
          <span style={{ color: `${color}40`, fontSize: '9px', letterSpacing: '0.18em' }}>LÍNEA TEMPORAL</span>
          <span className="ml-auto" style={{ color: `${color}30`, fontSize: '9px' }}>{logs.length}</span>
          {demoMode.isRunning && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded ml-1"
              style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)' }}>
              <Loader size={8} className="animate-spin" style={{ color: '#eab308' }} />
              <span style={{ color: '#eab308', fontSize: '8px', fontWeight: 700 }}>DEMO</span>
            </span>
          )}
        </div>
        <div ref={consoleRef} className="flex-1 overflow-y-auto px-3 py-1.5 space-y-0.5">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-tight">
              <span className="flex-shrink-0 tabular-nums"
                style={{ color: '#00FF0030', fontSize: '9px', minWidth: '54px' }}>
                [{log.ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}]
              </span>
              <span style={{ color: LEVEL_COLOR[log.level], fontSize: '10px', lineHeight: 1.4 }}>
                {log.msg}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CODE RED overlay */}
      {phase === 'CODE_RED' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(255,0,0,0.06)' }}>
          <div className="border-2 px-8 py-5 text-center animate-pulse"
            style={{ borderColor: '#FF0000', background: 'rgba(0,0,0,0.96)' }}>
            <AlertTriangle size={30} style={{ color: '#FF0000', margin: '0 auto 8px' }} />
            <p className="text-lg font-bold tracking-[0.3em]" style={{ color: '#FF0000' }}>CÓDIGO ROJO</p>
            <p className="text-xs mt-1" style={{ color: '#FF000060' }}>Protocolo silencioso activo</p>
          </div>
        </div>
      )}

      {cameraModal && <CameraModal msg={cameraModal} onDismiss={() => setCameraModal(null)} />}
    </div>
  );
}
