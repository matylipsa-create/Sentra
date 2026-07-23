import { useEffect, useRef, useState } from 'react';
import { Crosshair, Zap, MapPin, Video, Activity, Lock, Unlock } from 'lucide-react';
import { biometricMonitor, type BiometricSnapshot } from '../lib/biometricMonitor';
import { hardwareIntegration, type LocationData } from '../lib/hardwareIntegration';
import { pipedreamOrchestrator, type EmergencyPayload } from '../lib/pipedream';

type SystemState = 'SECURE' | 'DEPLOYED' | 'COOLDOWN' | 'SAFE_LOCK' | 'FALLBACK';

interface TacticalLog {
  timestamp: Date;
  event: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

const STRESS_COLOR = (stress: string): string => {
  const colors = {
    low: '#10b981',
    moderate: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
  };
  return colors[stress as keyof typeof colors] || '#10b981';
};

function SafeLockModal({
  countdownSeconds,
  onExecute,
  onCancel,
}: {
  countdownSeconds: number;
  onExecute: () => void;
  onCancel: () => void;
}) {
  const progress = ((3 - countdownSeconds) / 3) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div
        className="rounded-2xl border-2 p-8 max-w-sm text-center"
        style={{ borderColor: '#EF4444', background: 'rgba(239, 68, 68, 0.05)' }}
      >
        <div className="mb-6 flex justify-center">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="2" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeDasharray={`${progress * 2.83} 283`}
                style={{ transition: 'stroke-dasharray 0.3s linear', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold text-red-500">{countdownSeconds}</span>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-red-500 mb-2">SAFE-LOCK ACTIVO</h2>
        <p className="text-gray-400 mb-6">Confirma la emergencia. Presiona CANCELAR dentro de 3 segundos para abortar.</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg border-2 border-green-500 bg-green-500/10 text-green-400 font-bold hover:bg-green-500/20 transition-all"
          >
            <Unlock size={16} className="inline mr-2" />
            CANCELAR
          </button>
          <button
            onClick={onExecute}
            className="flex-1 py-3 rounded-lg border-2 border-red-500 bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-all"
            disabled
          >
            <Lock size={16} className="inline mr-2" />
            CONFIRMADO
          </button>
        </div>
      </div>
    </div>
  );
}

function TacticalLogsPane({ logs }: { logs: TacticalLog[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const levelColors = {
    info: 'text-blue-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    success: 'text-emerald-400',
  };

  const levelBg = {
    info: 'bg-blue-500/10',
    warning: 'bg-amber-500/10',
    error: 'bg-red-500/10',
    success: 'bg-emerald-500/10',
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/5">
        <Activity size={14} className="text-cyan-400 animate-pulse" />
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Tactical Events Log</span>
        <span className="ml-auto text-xs text-gray-600">{logs.length} eventos</span>
      </div>

      <div ref={scrollRef} className="h-32 overflow-y-auto space-y-1 p-2 text-xs font-mono">
        {logs.length === 0 ? (
          <p className="text-gray-600">Esperando eventos...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`px-2 py-1 rounded text-xs ${levelBg[log.level]} ${levelColors[log.level]}`}>
              <span className="text-gray-600">[{log.timestamp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
              {' '}
              {log.event}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function EmergencyCommandCenter() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [systemState, setSystemState] = useState<SystemState>('SECURE');
  const [biometrics, setBiometrics] = useState<BiometricSnapshot | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [safeLockActive, setSafeLockActive] = useState(false);
  const [safeLockCountdown, setSafeLockCountdown] = useState(3);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [tacticalLogs, setTacticalLogs] = useState<TacticalLog[]>([]);

  // Initialize hardware
  useEffect(() => {
    const initializeHardware = async () => {
      // Start biometric monitor
      biometricMonitor.start();
      const unsubscribeBio = biometricMonitor.subscribe((snapshot) => {
        setBiometrics(snapshot);
      });

      // Initialize camera
      if (videoRef.current) {
        const cameraOk = await hardwareIntegration.initializeCamera(videoRef.current);
        setCameraActive(cameraOk);
        if (cameraOk) {
          addLog('Cámara inicializada correctamente', 'success');
        }
      }

      // Initialize geolocation
      const geoOk = await hardwareIntegration.initializeGeolocation();
      const unsubscribeGeo = hardwareIntegration.subscribeToLocation((loc) => {
        setLocation(loc);
      });

      if (geoOk) {
        addLog('Geolocalización activa con alta precisión', 'success');
      } else {
        addLog('Advertencia: Geolocalización no disponible', 'warning');
      }

      return () => {
        unsubscribeBio();
        unsubscribeGeo();
        biometricMonitor.stop();
        hardwareIntegration.shutdown();
      };
    };

    initializeHardware();
  }, []);

  // Handle safe-lock countdown
  useEffect(() => {
    if (!safeLockActive) return;

    if (safeLockCountdown <= 0) {
      executeEmergencyDispatch();
      setSafeLockActive(false);
      return;
    }

    const timer = setTimeout(() => {
      setSafeLockCountdown((c) => c - 1);
      addLog(`Safe-Lock countdown: ${safeLockCountdown - 1}s`, 'warning');
    }, 1000);

    return () => clearTimeout(timer);
  }, [safeLockActive, safeLockCountdown]);

  // Handle cooldown lockout
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setTimeout(() => {
      setCooldownRemaining((c) => c - 1);
      if (cooldownRemaining - 1 === 0) {
        setSystemState('SECURE');
        addLog('Cooldown finalizado. Sistema desbloqueado', 'success');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldownRemaining]);

  const addLog = (event: string, level: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setTacticalLogs((prev) => [...prev.slice(-99), { timestamp: new Date(), event, level }]);
  };

  const handleActionButtonPress = () => {
    if (systemState === 'COOLDOWN') {
      addLog('Sistema en cooldown. Espera antes de nuevo dispatch', 'warning');
      return;
    }

    addLog('Iniciando secuencia de emergencia...', 'warning');
    setSafeLockActive(true);
    setSafeLockCountdown(3);
    setSystemState('SAFE_LOCK');
    biometricMonitor.setSystemStress(0.9); // Increase stress
  };

  const handleSafeLockCancel = () => {
    setSafeLockActive(false);
    setSystemState('SECURE');
    biometricMonitor.setSystemStress(0.5); // Reset stress
    addLog('Emergencia cancelada por operador', 'info');
  };

  const executeEmergencyDispatch = async () => {
    if (!location) {
      addLog('Conectando...', 'warning');
      return;
    }

    setSafeLockActive(false);
    setSystemState('DEPLOYED');
    addLog('Dispatch ejecutándose...', 'warning');

    const payload: EmergencyPayload = {
      camera_sector: 'global',
      latitude: location.latitude,
      longitude: location.longitude,
      image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9',
      camera_active: cameraActive,
      operator_biometrics: {
        name: 'Matías',
        bpm: biometrics?.bpm || 75,
      },
    };

    try {
      const result = await pipedreamOrchestrator.dispatchEmergency(payload);

      if (result.success) {
        addLog(`Dispatch exitoso vía ${result.source.toUpperCase()}`, 'success');
      } else {
        addLog('Reintentando conexión...', 'warning');
        setSystemState('FALLBACK');
      }
    } catch (e) {
      addLog('Reintentando conexión...', 'warning');
    }

    // Activate 10-second cooldown
    addLog('Iniciando cooldown de 10 segundos...', 'warning');
    setSystemState('COOLDOWN');
    setCooldownRemaining(10);
    biometricMonitor.setSystemStress(0.3); // Decrease stress
  };

  const statusColor = {
    SECURE: '#10b981',
    DEPLOYED: '#ef4444',
    COOLDOWN: '#f59e0b',
    SAFE_LOCK: '#dc2626',
    FALLBACK: '#dc2626',
  }[systemState];

  return (
    <div className="flex flex-col h-full gap-3 select-none" style={{ background: '#0a0e1a' }}>
      {/* Top tactical bar */}
      <div
        className="px-4 py-2 rounded-lg border flex items-center justify-between"
        style={{ borderColor: statusColor, background: `${statusColor}15` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: statusColor }} />
          <span className="text-xs font-bold tracking-widest text-gray-200 uppercase">
            SYSTEM STATUS: {systemState}
          </span>
          {cooldownRemaining > 0 && <span className="text-xs font-mono text-amber-400">{cooldownRemaining}s LOCKOUT</span>}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Crosshair size={12} />
          <span>TACTICAL HUD v2.0</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
        {/* Left column: Camera + Biometrics */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* Camera feed */}
          <div className="rounded-lg border border-white/10 overflow-hidden bg-black relative flex-1">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"
              style={{
                background: cameraActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                color: cameraActive ? '#22c55e' : '#9ca3af',
                borderColor: cameraActive ? '#22c55e' : '#9ca3af',
                borderWidth: 1,
              }}>
              <Video size={12} />
              {cameraActive ? 'ACTIVA' : 'INACTIVA'}
            </div>
            <div className="absolute bottom-2 left-2 text-xs font-mono text-gray-600">
              {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Sin ubicación'}
            </div>
          </div>

          {/* Biometric card */}
          {biometrics && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase font-bold">Operador: Matías</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded`}
                  style={{
                    color: STRESS_COLOR(biometrics.stress),
                    background: `${STRESS_COLOR(biometrics.stress)}20`,
                  }}>
                  {biometrics.stress.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold" style={{ color: STRESS_COLOR(biometrics.stress) }}>
                      {biometrics.bpm}
                    </span>
                    <span className="text-sm text-gray-600">BPM</span>
                  </div>
                  <p className="text-xs text-gray-600 capitalize">{biometrics.trend}</p>
                </div>
                <Activity size={32} style={{ color: STRESS_COLOR(biometrics.stress), animation: `pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite` }} />
              </div>
            </div>
          )}
        </div>

        {/* Right column: Map + Action + Logs */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* Tactical map */}
          <div className="rounded-lg border border-white/10 bg-black/40 p-4 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-cyan-400" />
              <span className="text-xs font-bold text-gray-300 uppercase">Tactical Map</span>
            </div>
            {location ? (
              <div className="space-y-1 text-xs font-mono">
                <p className="text-gray-400">LAT: <span className="text-cyan-400">{location.latitude.toFixed(6)}</span></p>
                <p className="text-gray-400">LON: <span className="text-cyan-400">{location.longitude.toFixed(6)}</span></p>
                <p className="text-gray-400">ACC: <span className="text-cyan-400">{location.accuracy.toFixed(1)}m</span></p>
                <p className="text-gray-400">SECTOR: <span className="text-cyan-400">GLOBAL</span></p>
              </div>
            ) : (
              <p className="text-xs text-gray-600">Adquiriendo posición...</p>
            )}
          </div>

          {/* ACTION button */}
          <button
            onClick={handleActionButtonPress}
            disabled={systemState === 'COOLDOWN' || systemState === 'SAFE_LOCK'}
            className={`py-4 rounded-lg font-bold text-sm uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-2 ${
              systemState === 'COOLDOWN'
                ? 'opacity-50 cursor-not-allowed border-amber-500/30 bg-amber-500/5 text-amber-600'
                : 'border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95'
            }`}
          >
            <Zap size={18} />
            {systemState === 'COOLDOWN' ? `COOLDOWN ${cooldownRemaining}s` : 'ACTION'}
          </button>

          {/* Logs */}
          <TacticalLogsPane logs={tacticalLogs} />
        </div>
      </div>

      {/* Safe-lock modal */}
      {safeLockActive && (
        <SafeLockModal
          countdownSeconds={safeLockCountdown}
          onExecute={executeEmergencyDispatch}
          onCancel={handleSafeLockCancel}
        />
      )}
    </div>
  );
}
