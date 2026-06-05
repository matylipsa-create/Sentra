import {
  useState, useEffect, useRef, useCallback, lazy, Suspense,
} from 'react';
import {
  Radio, MapPin, Activity, AlertTriangle, CheckCircle, XCircle,
  Wifi, WifiOff, Database, Lock, Unlock, Terminal, Camera,
} from 'lucide-react';
import { useSentraCore } from '../hooks/useSentraCore';
import { mesh } from '../lib/SentraMesh';
import AudioEngine from './AudioEngine';
import type { AudioAlertLog } from './AudioEngine';
import { pipedreamOrchestrator } from '../lib/pipedream';

const SentraVisionPanel = lazy(() => import('./SentraVisionPanel'));
const SentraIAPanel     = lazy(() => import('./SentraIAPanel'));

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = 'BOOT' | 'STANDBY' | 'ARMED' | 'ALERT' | 'CODE_RED' | 'LOCKDOWN';

interface TacticalLog {
  id: number;
  ts: Date;
  msg: string;
  level: 'sys' | 'warn' | 'crit' | 'ok' | 'net';
}

// ── Colour map ───────────────────────────────────────────────────────────────
const PHASE_COLOR: Record<Phase, string> = {
  BOOT:     '#00FF00',
  STANDBY:  '#00FF00',
  ARMED:    '#00FF00',
  ALERT:    '#FF4400',
  CODE_RED:  '#FF0000',
  LOCKDOWN: '#F59E0B',
};

const LEVEL_COLOR: Record<TacticalLog['level'], string> = {
  sys: '#00FF00',
  ok:  '#22c55e',
  warn:'#F59E0B',
  crit:'#EF4444',
  net: '#00BFFF',
};

// ── Debounce utility ─────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Radar SVG ────────────────────────────────────────────────────────────────
function RadarRings({ armed, phase }: { armed: boolean; phase: Phase }) {
  const [angle, setAngle] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!armed) { setAngle(0); return; }
    const tick = () => {
      setAngle((a) => (a + 1.2) % 360);
      rafRef.current = requestAnimationFrame(tick);
    };
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

// ── Diag row ─────────────────────────────────────────────────────────────────
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

// ── Camera permission modal ───────────────────────────────────────────────────
function CameraModal({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-6">
      <div className="border rounded-lg p-6 max-w-xs w-full text-center"
        style={{ borderColor: '#F59E0B', background: '#0a0a00' }}>
        <Camera size={28} style={{ color: '#F59E0B', margin: '0 auto 12px' }} />
        <p className="text-sm font-bold mb-2" style={{ color: '#F59E0B' }}>Cámara Bloqueada</p>
        <p className="text-xs mb-5" style={{ color: '#F59E0B90' }}>{msg}</p>
        <button
          onClick={onDismiss}
          className="w-full py-2 rounded border text-xs font-bold tracking-widest transition-all"
          style={{ borderColor: '#F59E0B', color: '#F59E0B', background: '#F59E0B10' }}
        >
          ENTENDIDO
        </button>
      </div>
    </div>
  );
}

// ── Main HUD ─────────────────────────────────────────────────────────────────
export default function SentraHUD() {
  const { geo, diag, armed, arm, disarm, triggerHaptic, pendingMessages, rtt } = useSentraCore();

  const [phase, setPhase]         = useState<Phase>('BOOT');
  const [rawLogs, setRawLogs]     = useState<TacticalLog[]>([]);
  const [showVision, setShowVision] = useState(false);
  const [showIA, setShowIA]       = useState(false);
  const [arming, setArming]       = useState(false);
  const [cameraModal, setCameraModal] = useState<string | null>(null);

  // 500ms debounce on logs → prevents flooding the main thread render
  const logs = useDebounce(rawLogs, 500);

  const logIdRef   = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, level: TacticalLog['level'] = 'sys') => {
    setRawLogs((prev) => [
      ...prev.slice(-149),
      { id: ++logIdRef.current, ts: new Date(), msg, level },
    ]);
  }, []);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // Boot sequence — runs once diagnostics land
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || diag.indexeddb === undefined) return;
    booted.current = true;

    const seq = async () => {
      addLog('SENTRA v3.0 iniciando...', 'sys');
      await new Promise((r) => setTimeout(r, 350));
      addLog('SentraMesh: IndexedDB OK', 'ok');
      await new Promise((r) => setTimeout(r, 250));
      addLog('Autodiagnóstico de hardware...', 'sys');
      await new Promise((r) => setTimeout(r, 500));
      addLog(`CAM: ${diag.camera ? 'OK' : 'NO DETECTADA'}`, diag.camera ? 'ok' : 'warn');
      addLog(`MIC: ${diag.microphone ? 'OK' : 'NO DETECTADO'}`, diag.microphone ? 'ok' : 'warn');
      addLog(`GEO: ${diag.geolocation ? 'OK' : 'FALLO'}`, diag.geolocation ? 'ok' : 'crit');
      addLog(`IDB: ${diag.indexeddb ? 'OK' : 'FALLO'}`, diag.indexeddb ? 'ok' : 'crit');
      addLog(`WORKERS: ${diag.webWorker ? 'OK' : 'FALLO'}`, diag.webWorker ? 'ok' : 'crit');
      await new Promise((r) => setTimeout(r, 300));
      addLog(diag.ready ? 'Sistema listo. Esperando armado.' : 'Sistema degradado — revisar permisos.', diag.ready ? 'ok' : 'warn');
      setPhase('STANDBY');
    };
    seq();
  }, [diag.ready]);

  // Mesh event subscriptions
  useEffect(() => {
    const unsubs = [
      mesh.on('VISION_ALERT', (e) => {
        const { label, confidence } = e.payload as { label: string; confidence: number };
        setPhase('ALERT');
        addLog(`VISION: ${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`, 'crit');
        triggerHaptic([200, 100, 200, 100, 400]);
      }),
      mesh.on('SPEECH_COERCION', (e) => {
        const { isSilentTrigger } = e.payload as { isSilentTrigger: boolean };
        setPhase('CODE_RED');
        addLog(isSilentTrigger ? 'IA: CÓDIGO ROJO SILENCIOSO' : 'IA: Coacción detectada', 'crit');
        triggerHaptic([500, 200, 500, 200, 1000]);
      }),
      mesh.on('EMERGENCY_DISPATCH', () => {
        addLog('DISPATCH → Pipedream OK', 'net');
        setPhase('LOCKDOWN');
        setTimeout(() => setPhase(armed ? 'ARMED' : 'STANDBY'), 10_000);
      }),
      mesh.on('GEO_UPDATE', () => {
        if (phase === 'ARMED') addLog(`GEO: ${geo.address}`, 'net');
      }),
      mesh.on('FALLBACK_QUEUED', () => addLog('NET: Evento encolado en IDB', 'warn')),
      mesh.on('FALLBACK_FLUSHED', (e) => {
        const { count } = e.payload as { count: number };
        addLog(`NET: ${count} evento(s) enviados desde cola`, 'ok');
      }),
      mesh.on('CAMERA_PERMISSION_DENIED', (e) => {
        const { message } = e.payload as { message: string };
        setCameraModal(message);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [armed, phase, geo.address, triggerHaptic, addLog]);

  // ARM toggle
  const handleArmToggle = useCallback(async () => {
    if (arming) return;
    setArming(true);
    if (!armed) {
      addLog('Armando sistema...', 'sys');
      await arm();
      setPhase('ARMED');
      setShowVision(true);
      setShowIA(true);
      addLog('SentraVision + SentraIA + AudioEngine cargados', 'ok');
      triggerHaptic([100, 50, 100]);
      pipedreamOrchestrator.dispatchInteraction({
        action: 'SYSTEM_ARMED',
        phase: 'ARMED',
        geo: { latitude: geo.latitude, longitude: geo.longitude ?? null, address: geo.address },
        timestamp: Date.now(),
        operator: 'Matías',
      });
    } else {
      addLog('Desarmando...', 'warn');
      await disarm();
      setPhase('STANDBY');
      setShowVision(false);
      setShowIA(false);
      addLog('Sistema DESARMADO', 'sys');
      triggerHaptic([300]);
      pipedreamOrchestrator.dispatchInteraction({
        action: 'SYSTEM_DISARMED',
        phase: 'STANDBY',
        geo: { latitude: geo.latitude, longitude: geo.longitude ?? null, address: geo.address },
        timestamp: Date.now(),
        operator: 'Matías',
      });
    }
    setArming(false);
  }, [armed, arming, arm, disarm, addLog, triggerHaptic, geo]);

  const color = PHASE_COLOR[phase];

  // Handler for AudioEngine alerts → inject into tactical log
  const handleAudioAlert = useCallback((log: AudioAlertLog) => {
    addLog(`AUDIO: ${log.alerta}`, 'crit');
    triggerHaptic([150, 80, 150]);
    setPhase('ALERT');
  }, [addLog, triggerHaptic]);

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono select-none"
      style={{ background: '#000000', color: '#00FF00' }}>

      {/* ── Compact status bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 border-b text-xs flex-shrink-0"
        style={{ borderColor: `${color}25`, background: `${color}06` }}>
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-[0.2em]" style={{ color }}>SENTRA</span>
          <span style={{ color: `${color}50` }}>v3.0</span>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* ── Top section: Radar + Info (shrinks to give Video room) ─────── */}
      <div className="grid grid-cols-2 gap-0 overflow-hidden min-h-0" style={{ flex: '0 0 auto', maxHeight: 'calc(50dvh - 80px)' }}>

        {/* Left: Radar + ARM */}
        <div className="flex flex-col items-center justify-between py-3 px-2 border-r overflow-hidden"
          style={{ borderColor: `${color}18` }}>

          <div className="relative w-full aspect-square max-w-[180px]">
            <RadarRings armed={armed} phase={phase} />
            <button
              onClick={handleArmToggle}
              disabled={arming || phase === 'LOCKDOWN'}
              aria-label={armed ? 'Desarmar SENTRA' : 'Armar SENTRA'}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full transition-all active:scale-95 focus:outline-none"
              style={{ background: 'transparent', cursor: arming || phase === 'LOCKDOWN' ? 'not-allowed' : 'pointer' }}
            >
              <Radio
                size={26}
                style={{ color, filter: `drop-shadow(0 0 8px ${color})` }}
                className={armed ? 'animate-pulse' : ''}
              />
              <span className="text-xs font-bold tracking-[0.22em]" style={{ color }}>
                {arming ? '···' : armed ? 'ARMADO' : 'RADAR'}
              </span>
            </button>
          </div>

          <button
            onClick={handleArmToggle}
            disabled={arming || phase === 'LOCKDOWN'}
            className="w-full py-1.5 rounded border font-bold text-xs tracking-widest transition-all active:scale-95"
            style={{
              borderColor: color, color,
              background:  armed ? `${color}18` : 'transparent',
              boxShadow:   armed ? `0 0 10px ${color}35` : 'none',
              opacity:     phase === 'LOCKDOWN' ? 0.4 : 1,
            }}
          >
            {armed
              ? <><Lock size={11} className="inline mr-1" />DESARMAR</>
              : <><Unlock size={11} className="inline mr-1" />ARMAR</>}
          </button>

          <div className="w-full px-1">
            <p className="text-xs mb-0.5 tracking-widest" style={{ color: `${color}40` }}>HW</p>
            <DiagRow label="CAM"  ok={diag.camera} />
            <DiagRow label="MIC"  ok={diag.microphone} />
            <DiagRow label="GEO"  ok={diag.geolocation} />
            <DiagRow label="IDB"  ok={diag.indexeddb} />
          </div>
        </div>

        {/* Right: Geo + Operator + IA */}
        <div className="flex flex-col overflow-hidden min-h-0">

          <div className="p-2 border-b" style={{ borderColor: `${color}18` }}>
            <div className="flex items-center gap-1 mb-0.5">
              <MapPin size={9} style={{ color }} />
              <span className="text-xs tracking-widest" style={{ color: `${color}55`, fontSize: 8 }}>POSICIÓN</span>
            </div>
            <p className="font-mono leading-tight" style={{ color, fontSize: '9px' }}>
              {geo.latitude !== null
                ? `${geo.latitude.toFixed(5)}, ${geo.longitude?.toFixed(5)}`
                : armed ? 'Adquiriendo...' : '— no armado —'}
            </p>
            <p className="leading-tight mt-0.5 truncate" style={{ color: `${color}60`, fontSize: '8px' }}>
              {geo.address}
            </p>
          </div>

          <div className="p-2 border-b" style={{ borderColor: `${color}18` }}>
            <div className="flex items-center gap-1 mb-0.5">
              <Activity size={9} style={{ color }} />
              <span className="tracking-widest" style={{ color: `${color}55`, fontSize: 8 }}>OPERADOR</span>
            </div>
            <p className="text-xs font-bold" style={{ color }}>Matías</p>
            <p style={{ color: `${color}50`, fontSize: '8px' }}>
              {armed ? 'Sensores activos' : 'En espera'}
            </p>
          </div>

          {/* IA strip */}
          {showIA && (
            <Suspense fallback={null}>
              <SentraIAPanel
                onCoercion={(transcript, isSilent) =>
                  mesh.emit('SPEECH_COERCION', { transcript, isSilentTrigger: isSilent })}
              />
            </Suspense>
          )}

          {/* AudioEngine — silent side-effect component */}
          {armed && <AudioEngine geo={geo} onAlert={handleAudioAlert} />}
        </div>
      </div>

      {/* ── Vision panel — 50dvh full-width ─────────────────────────────── */}
      <div className="w-full overflow-hidden border-t flex-shrink-0"
        style={{ height: '50dvh', borderColor: `${color}20` }}>
        {showVision ? (
          <Suspense fallback={
            <div className="h-full flex items-center justify-center" style={{ background: '#000' }}>
              <p className="text-xs animate-pulse" style={{ color: `${color}70` }}>Cargando SentraVision...</p>
            </div>
          }>
            <SentraVisionPanel
              onThreat={(label, confidence) => mesh.emit('VISION_ALERT', { label, confidence })}
              onCameraBlocked={(msg) => mesh.emit('CAMERA_PERMISSION_DENIED', { message: msg })}
              location={geo.latitude !== null ? { latitude: geo.latitude, longitude: geo.longitude! } : null}
            />
          </Suspense>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1" style={{ background: '#000' }}>
            <p className="text-xs tracking-widest" style={{ color: `${color}25` }}>VISIÓN</p>
            <p style={{ color: `${color}20`, fontSize: '9px' }}>inactiva</p>
          </div>
        )}
      </div>

      {/* ── Tactical console ─────────────────────────────────────────────── */}
      <div className="border-t flex-shrink-0" style={{ borderColor: `${color}18` }}>
        <div className="flex items-center gap-2 px-3 py-0.5 border-b" style={{ borderColor: `${color}12` }}>
          <Terminal size={9} style={{ color: `${color}60` }} />
          <span className="text-xs tracking-widest" style={{ color: `${color}40` }}>LOG</span>
          <span className="ml-auto" style={{ color: `${color}30`, fontSize: '9px' }}>{logs.length}</span>
        </div>
        <div ref={consoleRef} className="overflow-y-auto px-3 py-1 space-y-0.5" style={{ height: '60px' }}>
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-tight">
              <span className="flex-shrink-0" style={{ color: '#00FF0035', fontSize: '9px' }}>
                {log.ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
              <span style={{ color: LEVEL_COLOR[log.level], fontSize: '10px' }}>{log.msg}</span>
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
