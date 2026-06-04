import {
  useState, useEffect, useRef, useCallback, lazy, Suspense,
} from 'react';
import {
  MapPin, Activity, AlertTriangle, CheckCircle, XCircle,
  Wifi, WifiOff, Database, Lock, Unlock, Terminal, Camera,
  Radio, Power,
} from 'lucide-react';
import { useSentraCore } from '../hooks/useSentraCore';
import { mesh } from '../lib/SentraMesh';
import AudioEngine from './AudioEngine';
import type { AudioAlertLog } from './AudioEngine';

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

// ── Colour map ───────────────────────────────────────────────────────────────
const PHASE_COLOR: Record<Phase, string> = {
  BOOT:     '#00FF00',
  STANDBY:  '#00FF00',
  ARMED:    '#00FF00',
  ALERT:    '#FF4400',
  CODE_RED: '#FF0000',
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
  const [v, setV] = useState<T>(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// ── Diag row ─────────────────────────────────────────────────────────────────
function DiagRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="font-mono" style={{ color: '#00FF0070', fontSize: '9px' }}>{label}</span>
      {ok
        ? <CheckCircle size={10} style={{ color: '#00FF00' }} />
        : <XCircle    size={10} style={{ color: '#FF440060' }} />}
    </div>
  );
}

// ── ARM button ───────────────────────────────────────────────────────────────
function ArmButton({
  armed, arming, disabled: dis, phase, color, onClick,
}: {
  armed: boolean; arming: boolean; disabled: boolean;
  phase: Phase; color: string; onClick: () => void;
}) {
  const isAlert = phase === 'ALERT' || phase === 'CODE_RED';
  return (
    <button
      onClick={onClick}
      disabled={dis}
      aria-label={armed ? 'Desarmar SENTRA' : 'Armar SENTRA'}
      className="relative flex flex-col items-center justify-center transition-all active:scale-95 focus:outline-none flex-shrink-0"
      style={{
        width: 108, height: 108, borderRadius: '50%',
        background:  armed ? `${color}0e` : 'rgba(0,0,0,0.9)',
        border:      `2px solid ${armed ? color : `${color}35`}`,
        boxShadow:   armed
          ? `0 0 24px ${color}45, 0 0 48px ${color}18, inset 0 0 16px ${color}08`
          : 'none',
        cursor: dis ? 'not-allowed' : 'pointer',
        opacity: dis ? 0.4 : 1,
      }}
    >
      {/* Outer ring ping when armed */}
      {armed && !isAlert && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ border: `1px solid ${color}20` }}
        />
      )}
      {/* Alert flash ring */}
      {isAlert && (
        <span
          className="absolute inset-0 rounded-full animate-pulse"
          style={{ border: `2px solid ${color}80` }}
        />
      )}

      <Radio
        size={24}
        style={{ color, filter: armed ? `drop-shadow(0 0 6px ${color})` : 'none' }}
        className={armed ? 'animate-pulse' : ''}
      />
      <span
        className="font-bold tracking-[0.18em] mt-1"
        style={{ color, fontSize: '9px' }}
      >
        {arming ? '···' : armed ? phase : 'ARMAR'}
      </span>
    </button>
  );
}

// ── Camera permission modal ───────────────────────────────────────────────────
function CameraModal({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 px-6">
      <div
        className="border rounded-lg p-6 max-w-xs w-full text-center"
        style={{ borderColor: '#F59E0B', background: '#080800' }}
      >
        <Camera size={28} style={{ color: '#F59E0B', margin: '0 auto 12px' }} />
        <p className="text-sm font-bold mb-2" style={{ color: '#F59E0B' }}>Cámara Bloqueada</p>
        <p className="text-xs mb-5" style={{ color: '#F59E0B80' }}>{msg}</p>
        <button
          onClick={onDismiss}
          className="w-full py-2 rounded border text-xs font-bold tracking-widest transition-all active:scale-95"
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

  const [phase, setPhase]       = useState<Phase>('BOOT');
  const [rawLogs, setRawLogs]   = useState<TacticalLog[]>([]);
  const [showVision, setShowVision] = useState(false);
  const [showIA, setShowIA]     = useState(false);
  const [arming, setArming]     = useState(false);
  const [cameraModal, setCameraModal] = useState<string | null>(null);

  const logs       = useDebounce(rawLogs, 500);
  const logIdRef   = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);
  const booted     = useRef(false);

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

  // Emit IA_STATUS to TopBar whenever showIA changes
  useEffect(() => {
    mesh.emit('IA_STATUS', { active: showIA });
  }, [showIA]);

  // Boot sequence
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
      addLog(`CAM: ${diag.camera      ? 'OK' : 'NO DETECTADA'}`,  diag.camera      ? 'ok' : 'warn');
      addLog(`MIC: ${diag.microphone  ? 'OK' : 'NO DETECTADO'}`,  diag.microphone  ? 'ok' : 'warn');
      addLog(`GEO: ${diag.geolocation ? 'OK' : 'FALLO'}`,         diag.geolocation ? 'ok' : 'crit');
      addLog(`IDB: ${diag.indexeddb   ? 'OK' : 'FALLO'}`,         diag.indexeddb   ? 'ok' : 'crit');
      addLog(`WRK: ${diag.webWorker   ? 'OK' : 'FALLO'}`,         diag.webWorker   ? 'ok' : 'crit');
      await new Promise((r) => setTimeout(r, 300));
      addLog(
        diag.ready ? 'Sistema listo. Esperando armado.' : 'Sistema degradado — revisar permisos.',
        diag.ready ? 'ok' : 'warn',
      );
      setPhase('STANDBY');
    };
    seq();
  }, [diag.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mesh subscriptions
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
      mesh.on('FALLBACK_QUEUED',  ()  => addLog('NET: Evento encolado en IDB', 'warn')),
      mesh.on('FALLBACK_FLUSHED', (e) => {
        const { count } = e.payload as { count: number };
        addLog(`NET: ${count} evento(s) enviados desde cola`, 'ok');
      }),
      mesh.on('CAMERA_PERMISSION_DENIED', (e) => {
        const { message } = e.payload as { message: string };
        setCameraModal(message);
      }),
      mesh.on('AUDIO_ALERT', (e) => {
        const { alerta } = e.payload as { alerta: string };
        addLog(`AUDIO: ${alerta}`, 'crit');
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
      addLog('SentraVision + SentraIA + AudioEngine ONLINE', 'ok');
      triggerHaptic([100, 50, 100]);
    } else {
      addLog('Desarmando...', 'warn');
      await disarm();
      setPhase('STANDBY');
      setShowVision(false);
      setShowIA(false);
      addLog('Sistema DESARMADO', 'sys');
      triggerHaptic([300]);
    }
    setArming(false);
  }, [armed, arming, arm, disarm, addLog, triggerHaptic]);

  const handleAudioAlert = useCallback((log: AudioAlertLog) => {
    addLog(`AUDIO: ${log.alerta}`, 'crit');
    triggerHaptic([150, 80, 150]);
    if (phase !== 'CODE_RED' && phase !== 'LOCKDOWN') setPhase('ALERT');
  }, [addLog, triggerHaptic, phase]);

  const color = PHASE_COLOR[phase];

  return (
    <div
      className="flex flex-col h-full overflow-hidden font-mono select-none"
      style={{ background: '#000000', color: '#00FF00' }}
    >
      {/* ── Compact status bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1 border-b flex-shrink-0"
        style={{ borderColor: `${color}25`, background: `${color}06` }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-[0.2em]" style={{ color, fontSize: '10px' }}>SENTRA</span>
          <span style={{ color: `${color}50`, fontSize: '9px' }}>v3.0</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {rtt > 0 && rtt < 200
              ? <Wifi    size={10} style={{ color: '#00FF00' }} />
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
          <span
            className="px-1.5 py-0.5 rounded font-bold tracking-widest"
            style={{ color, background: `${color}12`, border: `1px solid ${color}35`, fontSize: '9px' }}
          >
            {phase}
          </span>
        </div>
      </div>

      {/* ── Top section: ARM + Info ─────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 gap-0 min-h-0 flex-shrink-0"
        style={{ maxHeight: 'calc(50dvh - 80px)', overflow: 'hidden' }}
      >
        {/* LEFT — ARM control panel (no radar SVG) */}
        <div
          className="flex flex-col items-center justify-between py-3 px-2 border-r overflow-hidden"
          style={{ borderColor: `${color}18` }}
        >
          {/* ARM circle button */}
          <ArmButton
            armed={armed} arming={arming}
            disabled={arming || phase === 'LOCKDOWN'}
            phase={phase} color={color}
            onClick={handleArmToggle}
          />

          {/* Arm/Disarm text button */}
          <button
            onClick={handleArmToggle}
            disabled={arming || phase === 'LOCKDOWN'}
            className="w-full py-1.5 rounded border font-bold tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1"
            style={{
              borderColor: color, color,
              background:  armed ? `${color}18` : 'transparent',
              boxShadow:   armed ? `0 0 10px ${color}30` : 'none',
              opacity:     phase === 'LOCKDOWN' ? 0.4 : 1,
              fontSize:    '9px',
            }}
          >
            {armed
              ? <><Lock   size={10} />DESARMAR</>
              : <><Unlock size={10} />ARMAR</>}
          </button>

          {/* Hardware diag */}
          <div className="w-full px-1">
            <p className="tracking-widest mb-0.5" style={{ color: `${color}40`, fontSize: '8px' }}>HW</p>
            <DiagRow label="CAM" ok={diag.camera} />
            <DiagRow label="MIC" ok={diag.microphone} />
            <DiagRow label="GEO" ok={diag.geolocation} />
            <DiagRow label="IDB" ok={diag.indexeddb} />
          </div>
        </div>

        {/* RIGHT — Geo + Operator + IA + AudioEngine */}
        <div className="flex flex-col overflow-hidden min-h-0">

          {/* Geo */}
          <div className="p-2 border-b" style={{ borderColor: `${color}18` }}>
            <div className="flex items-center gap-1 mb-0.5">
              <MapPin size={9} style={{ color }} />
              <span style={{ color: `${color}55`, fontSize: '8px' }} className="tracking-widest">POSICIÓN</span>
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

          {/* Operator */}
          <div className="p-2 border-b" style={{ borderColor: `${color}18` }}>
            <div className="flex items-center gap-1 mb-0.5">
              <Activity size={9} style={{ color }} />
              <span style={{ color: `${color}55`, fontSize: '8px' }} className="tracking-widest">OPERADOR</span>
            </div>
            <p className="font-bold" style={{ color, fontSize: '10px' }}>Matías</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Power size={8} style={{ color: showIA ? '#00FF00' : `${color}30` }} />
              <span style={{ color: showIA ? '#00FF0070' : `${color}25`, fontSize: '8px' }}>
                {showIA ? 'IA conectada' : 'IA en espera'}
              </span>
            </div>
          </div>

          {/* IA panel */}
          {showIA && (
            <Suspense fallback={null}>
              <SentraIAPanel
                onCoercion={(transcript, isSilent) =>
                  mesh.emit('SPEECH_COERCION', { transcript, isSilentTrigger: isSilent })}
              />
            </Suspense>
          )}

          {/* AudioEngine — zero UI, pure side-effect */}
          {armed && <AudioEngine geo={geo} onAlert={handleAudioAlert} />}
        </div>
      </div>

      {/* ── Vision panel — 50dvh full-width ─────────────────────────────────── */}
      <div
        className="w-full overflow-hidden border-t flex-shrink-0"
        style={{ height: '50dvh', borderColor: `${color}20` }}
      >
        {showVision ? (
          <Suspense fallback={
            <div className="h-full flex items-center justify-center" style={{ background: '#000' }}>
              <p className="animate-pulse" style={{ color: `${color}70`, fontSize: '10px' }}>
                Cargando SentraVision...
              </p>
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
            <p className="tracking-widest" style={{ color: `${color}25`, fontSize: '10px' }}>VISIÓN</p>
            <p style={{ color: `${color}20`, fontSize: '8px' }}>inactiva — armar para activar</p>
          </div>
        )}
      </div>

      {/* ── Tactical log ─────────────────────────────────────────────────────── */}
      <div className="border-t flex-shrink-0" style={{ borderColor: `${color}18` }}>
        <div className="flex items-center gap-2 px-3 py-0.5 border-b" style={{ borderColor: `${color}12` }}>
          <Terminal size={9} style={{ color: `${color}60` }} />
          <span className="tracking-widest" style={{ color: `${color}40`, fontSize: '8px' }}>LOG</span>
          <span className="ml-auto" style={{ color: `${color}30`, fontSize: '9px' }}>{logs.length}</span>
        </div>
        <div
          ref={consoleRef}
          className="overflow-y-auto px-3 py-1 space-y-0.5"
          style={{ height: '60px' }}
        >
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
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(255,0,0,0.06)' }}
        >
          <div
            className="border-2 px-8 py-5 text-center animate-pulse"
            style={{ borderColor: '#FF0000', background: 'rgba(0,0,0,0.96)' }}
          >
            <AlertTriangle size={30} style={{ color: '#FF0000', margin: '0 auto 8px' }} />
            <p className="text-lg font-bold tracking-[0.3em]" style={{ color: '#FF0000' }}>CÓDIGO ROJO</p>
            <p className="text-xs mt-1" style={{ color: '#FF000060' }}>Protocolo silencioso activo</p>
          </div>
        </div>
      )}

      {cameraModal && (
        <CameraModal msg={cameraModal} onDismiss={() => setCameraModal(null)} />
      )}
    </div>
  );
}
