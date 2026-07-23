import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Power } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSimulationMode } from '../hooks/useSimulationMode';
import { mesh } from '../lib/SentraMesh';

interface HudStatus {
  sensor: boolean;
  camera: boolean;
  network: boolean;
  armed: boolean;
  geo: string;
}

const QRS_W = 160;
const QRS_H = 22;
const CY = QRS_H / 2;

const cycle = [
  [0,    CY],
  [0.24, CY],
  [0.28, CY - 7],
  [0.32, CY + 9],
  [0.36, CY - 9],
  [0.40, CY],
  [0.46, CY - 1],
  [0.50, CY + 3],
  [0.54, CY],
  [1.00, CY],
].map(([x, y]) => `${(x * QRS_W).toFixed(1)},${y.toFixed(1)}`).join(' ');

const points2 = `${cycle} ${cycle.replace(/(\d+\.?\d*),/g, (_m, n) => `${parseFloat(n) + QRS_W},`)}`;

function EcgTrace({ color, active }: { color: string; active: boolean }) {
  return (
    <div style={{ width: QRS_W, height: QRS_H, overflow: 'hidden', flexShrink: 0, opacity: active ? 1 : 0.3 }}>
      <svg width={QRS_W * 2} height={QRS_H} style={{ animation: active ? `sentraEcgScroll 1.2s linear infinite` : 'none' }}>
        <polyline points={points2} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"
          style={{ filter: active ? `drop-shadow(0 0 3px ${color})` : 'none' }} />
      </svg>
    </div>
  );
}

function StatusIcon({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {ok ? <CheckCircle size={9} style={{ color: '#00E5FF' }} /> : <XCircle size={9} style={{ color: '#FF00A060' }} />}
      <span className="font-mono uppercase tracking-wider"
        style={{ fontSize: '8px', color: ok ? 'rgba(0,229,255,0.5)' : 'rgba(255,0,160,0.4)' }}>
        {label}
      </span>
    </div>
  );
}

const MODE_COLORS: Record<string, string> = {
  ASSIST: '#00E5FF',
  STABILIZE: '#FF00A0',
  SOFT_WARN: '#FF00A0',
  OBSERVE: '#10b981',
};

export default function TopBar() {
  const { state, setDrawer } = useApp();
  const accentColor = MODE_COLORS[state.daemonMode] ?? '#00E5FF';
  const sim = useSimulationMode();

  const [hud, setHud] = useState<HudStatus>({
    sensor: false, camera: false, network: navigator.onLine, armed: false, geo: '—',
  });

  useEffect(() => {
    const unsubs = [
      mesh.on('HARDWARE_DIAG', (e) => {
        const d = e.payload as { camera: boolean; microphone: boolean; geolocation: boolean };
        setHud((h) => ({ ...h, sensor: d.microphone && d.geolocation, camera: d.camera }));
      }),
      mesh.on('GEO_UPDATE', (e) => {
        const { latitude, longitude } = e.payload as { latitude: number; longitude: number };
        setHud((h) => ({ ...h, geo: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }));
      }),
      mesh.on('SYSTEM_ARMED', () => setHud((h) => ({ ...h, armed: true }))),
      mesh.on('SYSTEM_DISARMED', () => setHud((h) => ({ ...h, armed: false }))),
    ];

    const onOnline = () => setHud((h) => ({ ...h, network: true }));
    const onOffline = () => setHud((h) => ({ ...h, network: false }));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const C = '#00E5FF';

  return (
    <>
      <style>{`@keyframes sentraEcgScroll { from { transform: translateX(0); } to { transform: translateX(-${QRS_W}px); } }`}</style>

      <header
        className="fixed top-0 left-0 right-0 z-30 flex flex-col transition-deep"
        style={{
          background: 'linear-gradient(180deg, rgba(10,12,18,0.98) 0%, rgba(10,12,18,0.92) 100%)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${hud.armed ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.08)'}`,
          boxShadow: hud.armed ? '0 4px 20px rgba(0,229,255,0.1)' : 'none',
        }}
      >
        <div className="flex items-center gap-2 px-3 transition-deep" style={{ height: 30 }}>
          <EcgTrace color={hud.armed ? C : accentColor} active={hud.armed} />

          <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: 1 }}>
            <span className="font-mono font-bold tracking-[0.18em] leading-none transition-deep"
              style={{ fontSize: '10px', color: hud.armed ? C : 'rgba(255,255,255,0.85)' }}>
              MATÍAS
            </span>
            <span className="font-mono leading-none truncate transition-deep"
              style={{ fontSize: '8px', color: hud.armed ? `${C}55` : 'rgba(255,255,255,0.3)' }}>
              {hud.geo}
            </span>
          </div>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border flex-shrink-0 transition-deep"
            style={{ background: `${accentColor}12`, borderColor: `${accentColor}35` }}>
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: accentColor }} />
            <span className="text-xs font-bold tracking-widest leading-none transition-deep"
              style={{ color: accentColor, fontSize: '8px' }}>
              {state.daemonMode}
            </span>
          </div>

          <button
            onClick={sim.toggle}
            aria-label={sim.active ? 'Desactivar modo simulación' : 'Activar modo simulación'}
            aria-pressed={sim.active}
            title={sim.active ? 'Simulación activa' : 'Modo simulación'}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-deep active:scale-90"
            style={{
              background: sim.active ? 'rgba(255,0,160,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${sim.active ? 'rgba(255,0,160,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: sim.active ? '#FF00A0' : 'rgba(156,163,175,0.6)',
              boxShadow: sim.active ? '0 0 10px rgba(255,0,160,0.3)' : 'none',
            }}
          >
            <Power size={12} />
          </button>

          <button
            onClick={() => setDrawer(true)}
            aria-label="Centro de Emergencias"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-deep active:scale-90"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171',
            }}
          >
            <AlertTriangle size={12} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-3 transition-deep"
          style={{
            height: 26,
            borderTop: '1px solid rgba(0,229,255,0.05)',
            background: hud.armed ? `${C}06` : 'transparent',
          }}>
          <StatusIcon label="SENSOR" ok={hud.sensor} />
          <StatusIcon label="CAM" ok={hud.camera} />
          <StatusIcon label="NET" ok={hud.network} />

          <div className="ml-auto flex items-center gap-1">
            <span className={hud.armed ? 'animate-pulse' : ''}
              style={{
                display: 'block', width: 5, height: 5, borderRadius: '50%',
                background: hud.armed ? C : 'rgba(255,255,255,0.15)',
                boxShadow: hud.armed ? `0 0 5px ${C}` : 'none',
              }} />
            <span className="font-mono tracking-widest transition-deep"
              style={{ fontSize: '8px', color: hud.armed ? `${C}80` : 'rgba(255,255,255,0.2)' }}>
              {hud.armed ? 'ARMED' : 'STANDBY'}
            </span>
          </div>
        </div>
      </header>
    </>
  );
}
