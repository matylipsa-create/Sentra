import {
  useState, useEffect, useRef, useCallback, lazy, Suspense,
} from 'react';
import {
  Radio, Shield, Eye, EyeOff, Mic, MicOff, MapPin, Activity,
  AlertTriangle, CheckCircle, XCircle, Wifi, WifiOff, Database,
  Cpu, Lock, Unlock, Zap, Terminal,
} from 'lucide-react';
import { useSentraCore } from '../hooks/useSentraCore';
import { mesh } from '../lib/SentraMesh';

// ── Lazy-loaded heavy modules (only after ARM) ──────────────────────────────
const SentraVisionPanel = lazy(() => import('./SentraVisionPanel'));
const SentraIAPanel = lazy(() => import('./SentraIAPanel'));

// ── Types ───────────────────────────────────────────────────────────────────
type Phase =
  | 'BOOT'        // Initial diagnostics
  | 'STANDBY'     // Armed=false, radar idle
  | 'ARMED'       // Active monitoring
  | 'ALERT'       // Threat detected
  | 'CODE_RED'    // Silent coercion protocol
  | 'LOCKDOWN';   // Post-dispatch cooldown

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
  sys:  '#00FF00',
  ok:   '#22c55e',
  warn: '#F59E0B',
  crit: '#EF4444',
  net:  '#00BFFF',
};

// ── Radar ring animation ─────────────────────────────────────────────────────
function RadarRings({ armed, phase }: { armed: boolean; phase: Phase }) {
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    if (!armed) return;
    const id = requestAnimationFrame(function tick() {
      setAngle((a) => (a + 1.2) % 360);
      requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [armed]);

  const color = PHASE_COLOR[phase];
  const r1 = 44, r2 = 80, r3 = 120;
  const cx = 150, cy = 150;

  return (
    <svg
      viewBox="0 0 300 300"
      className="w-full h-full"
      style={{ filter: `drop-shadow(0 0 12px ${color})` }}
    >
      {/* Crosshair */}
      <line x1={cx} y1={0} x2={cx} y2={300} stroke={color} strokeWidth="0.4" strokeOpacity="0.3" />
      <line x1={0} y1={cy} x2={300} y2={cy} stroke={color} strokeWidth="0.4" strokeOpacity="0.3" />

      {/* Rings */}
      {[r1, r2, r3].map((r) => (
        <circle
          key={r} cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          strokeOpacity={armed ? 0.6 : 0.2}
        />
      ))}

      {/* Sweep */}
      {armed && (
        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <defs>
            <radialGradient id="sweep">
              <stop offset="0%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d={`M${cx},${cy} L${cx},${cy - r3} A${r3},${r3} 0 0,1 ${cx + r3 * Math.sin((50 * Math.PI) / 180)},${cy - r3 * Math.cos((50 * Math.PI) / 180)} Z`}
            fill="url(#sweep)"
          />
        </g>
      )}

      {/* Blips — shown in ARMED/ALERT */}
      {phase === 'ALERT' && (
        <>
          <circle cx={cx + 55} cy={cy - 30} r="4" fill="#FF4400"
            style={{ animation: 'ping 1s infinite' }} />
          <circle cx={cx - 20} cy={cy + 65} r="3" fill="#FF4400"
            style={{ animation: 'ping 1.3s infinite' }} />
        </>
      )}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <circle cx={cx} cy={cy} r="10" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}

// ── Diag row ─────────────────────────────────────────────────────────────────
function DiagRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs font-mono" style={{ color: '#00FF0088' }}>{label}</span>
      {ok
        ? <CheckCircle size={12} style={{ color: '#00FF00' }} />
        : <XCircle size={12} style={{ color: '#FF4400' }} />}
    </div>
  );
}

// ── Main HUD ─────────────────────────────────────────────────────────────────
export default function SentraHUD() {
  const { geo, diag, armed, arm, disarm, triggerHaptic, pendingMessages, rtt } = useSentraCore();
  const [phase, setPhase] = useState<Phase>('BOOT');
  const [logs, setLogs] = useState<TacticalLog[]>([]);
  const [showVision, setShowVision] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [arming, setArming] = useState(false);
  const logIdRef = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, level: TacticalLog['level'] = 'sys') => {
    setLogs((prev) => [
      ...prev.slice(-149),
      { id: ++logIdRef.current, ts: new Date(), msg, level },
    ]);
  }, []);

  // Scroll console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Boot sequence
  useEffect(() => {
    const boot = async () => {
      addLog('SENTRA v3.0 boot iniciado...', 'sys');
      await new Promise((r) => setTimeout(r, 400));
      addLog('SentraMesh: IndexedDB inicializada', 'ok');
      await new Promise((r) => setTimeout(r, 300));
      addLog('Ejecutando autodiagnóstico de hardware...', 'sys');
      await new Promise((r) => setTimeout(r, 600));
      addLog(`Cámara: ${diag.camera ? 'OK' : 'NO DETECTADA'}`, diag.camera ? 'ok' : 'warn');
      addLog(`Micrófono: ${diag.microphone ? 'OK' : 'NO DETECTADO'}`, diag.microphone ? 'ok' : 'warn');
      addLog(`Geolocalización: ${diag.geolocation ? 'OK' : 'FALLO'}`, diag.geolocation ? 'ok' : 'crit');
      addLog(`IndexedDB: ${diag.indexeddb ? 'OK' : 'FALLO'}`, diag.indexeddb ? 'ok' : 'crit');
      addLog(`Web Workers: ${diag.webWorker ? 'OK' : 'FALLO'}`, diag.webWorker ? 'ok' : 'crit');
      await new Promise((r) => setTimeout(r, 400));
      addLog(diag.ready ? 'Sistema listo. En espera de armado.' : 'ADVERTENCIA: Sistema degradado.', diag.ready ? 'ok' : 'warn');
      setPhase('STANDBY');
    };
    if (diag.indexeddb !== undefined) boot();
  }, [diag.ready]);

  // Subscribe to mesh events
  useEffect(() => {
    const unsubs = [
      mesh.on('VISION_ALERT', (e) => {
        const { label, confidence } = e.payload as { label: string; confidence: number };
        setPhase('ALERT');
        addLog(`VISION: Amenaza detectada — ${label} (${(confidence * 100).toFixed(0)}%)`, 'crit');
        triggerHaptic([200, 100, 200, 100, 400]);
      }),
      mesh.on('SPEECH_COERCION', (e) => {
        const { isSilentTrigger } = e.payload as { isSilentTrigger: boolean };
        setPhase('CODE_RED');
        addLog(isSilentTrigger ? 'IA: CÓDIGO ROJO SILENCIOSO activado' : 'IA: Palabras de coacción detectadas', 'crit');
        triggerHaptic([500, 200, 500, 200, 1000]);
      }),
      mesh.on('EMERGENCY_DISPATCH', () => {
        addLog('DISPATCH: Payload enviado a Pipedream', 'net');
        setPhase('LOCKDOWN');
        setTimeout(() => setPhase(armed ? 'ARMED' : 'STANDBY'), 10_000);
      }),
      mesh.on('GEO_UPDATE', () => {
        if (phase !== 'ALERT' && phase !== 'CODE_RED') {
          addLog(`GEO: ${geo.address || 'actualizando...'}`, 'net');
        }
      }),
      mesh.on('FALLBACK_QUEUED', () => addLog('NET: Mensaje encolado en IndexedDB', 'warn')),
      mesh.on('FALLBACK_FLUSHED', () => addLog('NET: Cola vaciada correctamente', 'ok')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [armed, phase, geo.address, triggerHaptic, addLog]);

  // Handle ARM toggle
  const handleArmToggle = useCallback(async () => {
    if (arming) return;
    setArming(true);

    if (!armed) {
      addLog('Iniciando secuencia de armado...', 'sys');
      await new Promise((r) => setTimeout(r, 500));
      await arm();
      setPhase('ARMED');
      setShowVision(true);
      setShowIA(true);
      addLog('Sistema ARMADO — SentraVision + SentraIA activos', 'ok');
      triggerHaptic([100, 50, 100]);
    } else {
      addLog('Desarmando sistema...', 'warn');
      await disarm();
      setPhase('STANDBY');
      setShowVision(false);
      setShowIA(false);
      addLog('Sistema DESARMADO', 'sys');
      triggerHaptic([300]);
    }
    setArming(false);
  }, [armed, arming, arm, disarm, addLog, triggerHaptic]);

  const color = PHASE_COLOR[phase];

  return (
    <div
      className="flex flex-col h-full overflow-hidden font-mono select-none"
      style={{ background: '#000000', color: '#00FF00' }}
    >
      {/* ── Top status bar ────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b text-xs"
        style={{ borderColor: `${color}30`, background: `${color}08` }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-[0.2em]" style={{ color }}>SENTRA</span>
          <span className="opacity-50">v3.0</span>
        </div>
        <div className="flex items-center gap-3">
          {/* RTT indicator */}
          <div className="flex items-center gap-1">
            {rtt > 0 && rtt < 200
              ? <Wifi size={11} style={{ color: '#00FF00' }} />
              : <WifiOff size={11} style={{ color: '#F59E0B' }} />}
            <span style={{ color: rtt > 200 ? '#F59E0B' : '#00FF00', fontSize: 10 }}>
              {rtt > 0 ? `${Math.round(rtt)}ms` : '—'}
            </span>
          </div>
          {/* Pending queue */}
          {pendingMessages > 0 && (
            <div className="flex items-center gap-1">
              <Database size={11} style={{ color: '#F59E0B' }} />
              <span style={{ color: '#F59E0B', fontSize: 10 }}>{pendingMessages}</span>
            </div>
          )}
          {/* Phase badge */}
          <span
            className="px-1.5 py-0.5 rounded text-xs font-bold tracking-widest"
            style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}
          >
            {phase}
          </span>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden min-h-0">
        {/* Left column: RADAR + ARM */}
        <div
          className="flex flex-col items-center justify-between py-4 px-2 border-r"
          style={{ borderColor: `${color}20` }}
        >
          {/* Radar */}
          <div className="relative w-full aspect-square max-w-[220px]">
            <RadarRings armed={armed} phase={phase} />
            {/* ARM button overlay */}
            <button
              onClick={handleArmToggle}
              disabled={arming}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full transition-all active:scale-95"
              style={{ background: 'transparent' }}
            >
              <Radio
                size={32}
                style={{ color, filter: `drop-shadow(0 0 8px ${color})` }}
                className={armed ? 'animate-pulse' : ''}
              />
              <span className="text-xs font-bold tracking-[0.25em]" style={{ color }}>
                {arming ? '...' : armed ? 'ARMADO' : 'RADAR'}
              </span>
            </button>
          </div>

          {/* ARM / DISARM button */}
          <button
            onClick={handleArmToggle}
            disabled={arming}
            className="w-full py-2 rounded border font-bold text-xs tracking-widest transition-all active:scale-95"
            style={{
              borderColor: color,
              background: armed ? `${color}20` : 'transparent',
              color,
              boxShadow: armed ? `0 0 12px ${color}40` : 'none',
            }}
          >
            {armed ? (
              <><Lock size={12} className="inline mr-1" />DESARMAR</>
            ) : (
              <><Unlock size={12} className="inline mr-1" />ARMAR</>
            )}
          </button>

          {/* Diag panel */}
          <div className="w-full mt-2 px-1">
            <p className="text-xs opacity-40 mb-1 tracking-widest">HARDWARE</p>
            <DiagRow label="CAM" ok={diag.camera} />
            <DiagRow label="MIC" ok={diag.microphone} />
            <DiagRow label="GEO" ok={diag.geolocation} />
            <DiagRow label="IDB" ok={diag.indexeddb} />
            <DiagRow label="SW" ok={diag.serviceWorker} />
            <DiagRow label="WRK" ok={diag.webWorker} />
          </div>
        </div>

        {/* Right column: Info + Vision preview */}
        <div className="flex flex-col overflow-hidden min-h-0">
          {/* Geo info */}
          <div className="p-3 border-b" style={{ borderColor: `${color}20` }}>
            <div className="flex items-center gap-1 mb-1">
              <MapPin size={11} style={{ color }} />
              <span className="text-xs opacity-50 tracking-widest">POSICIÓN</span>
            </div>
            <p className="text-xs" style={{ color, fontSize: '10px' }}>
              {geo.latitude !== null
                ? `${geo.latitude.toFixed(5)}, ${geo.longitude?.toFixed(5)}`
                : armed ? 'Adquiriendo...' : '— no armado —'}
            </p>
            <p className="text-xs opacity-60 mt-0.5 leading-tight" style={{ fontSize: '9px' }}>
              {geo.address}
            </p>
          </div>

          {/* BPM display (from biometric monitor) */}
          <div className="p-3 border-b" style={{ borderColor: `${color}20` }}>
            <div className="flex items-center gap-1 mb-1">
              <Activity size={11} style={{ color }} />
              <span className="text-xs opacity-50 tracking-widest">OPERADOR</span>
            </div>
            <p className="text-xs font-bold" style={{ color }}>Matías</p>
            <p className="text-xs opacity-60" style={{ fontSize: '10px' }}>
              {armed ? 'Sensores activos' : 'En espera'}
            </p>
          </div>

          {/* Vision panel (lazy loaded) */}
          <div className="flex-1 overflow-hidden min-h-0 border-b" style={{ borderColor: `${color}20` }}>
            {showVision ? (
              <Suspense fallback={
                <div className="h-full flex items-center justify-center">
                  <div className="text-xs animate-pulse" style={{ color }}>
                    Cargando SentraVision...
                  </div>
                </div>
              }>
                <SentraVisionPanel onThreat={(label, confidence) => {
                  mesh.emit('VISION_ALERT', { label, confidence });
                }} />
              </Suspense>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <EyeOff size={20} style={{ color: `${color}40` }} />
                <p className="text-xs opacity-30 tracking-widest">VISIÓN INACTIVA</p>
              </div>
            )}
          </div>

          {/* IA panel (lazy loaded) */}
          {showIA && (
            <div className="overflow-hidden" style={{ maxHeight: '60px' }}>
              <Suspense fallback={null}>
                <SentraIAPanel onCoercion={(transcript, isSilent) => {
                  mesh.emit('SPEECH_COERCION', { transcript, isSilentTrigger: isSilent });
                }} />
              </Suspense>
            </div>
          )}
        </div>
      </div>

      {/* ── Tactical console ──────────────────────────────────────────────── */}
      <div
        className="border-t"
        style={{ borderColor: `${color}20`, background: '#000000' }}
      >
        <div className="flex items-center gap-2 px-3 py-1 border-b" style={{ borderColor: `${color}15` }}>
          <Terminal size={10} style={{ color: `${color}80` }} />
          <span className="text-xs opacity-40 tracking-widest">TACTICAL LOG</span>
          <span className="ml-auto text-xs opacity-30">{logs.length}</span>
        </div>
        <div
          ref={consoleRef}
          className="overflow-y-auto px-3 py-1 space-y-0.5"
          style={{ height: '88px' }}
        >
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-xs leading-tight">
              <span style={{ color: '#00FF0040', fontSize: '9px', flexShrink: 0 }}>
                {log.ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
              <span style={{ color: LEVEL_COLOR[log.level], fontSize: '10px' }}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── CODE RED overlay ─────────────────────────────────────────────── */}
      {phase === 'CODE_RED' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(255, 0, 0, 0.08)' }}
        >
          <div
            className="border-2 px-8 py-4 text-center animate-pulse"
            style={{ borderColor: '#FF0000', background: 'rgba(0,0,0,0.95)' }}
          >
            <AlertTriangle size={32} style={{ color: '#FF0000', margin: '0 auto 8px' }} />
            <p className="text-lg font-bold tracking-[0.3em]" style={{ color: '#FF0000' }}>
              CÓDIGO ROJO
            </p>
            <p className="text-xs opacity-60 mt-1">Protocolo silencioso activo</p>
          </div>
        </div>
      )}
    </div>
  );
}
