import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Cpu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { mesh } from '../lib/SentraMesh';

// ── Types ──────────────────────────────────────────────────────────────────

interface HudStatus {
  sensor:  boolean;
  camera:  boolean;
  network: boolean;
  armed:   boolean;
  ia:      boolean;
  geo:     string;
}

// ── ECG trace — pure SVG + CSS, zero JS animation cost ────────────────────
//   One QRS complex drawn as a polyline; CSS translate scrolls it.
//   Two identical copies side-by-side → seamless loop.

const QRS_W = 160; // px per full heartbeat cycle
const QRS_H = 22;
const CY    = QRS_H / 2;

// Points for one cardiac cycle (normalized to QRS_W × QRS_H)
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

// Two cycles placed side-by-side
const points2 = `${cycle} ${cycle.replace(/(\d+\.?\d*),/g, (m, n) => `${parseFloat(n) + QRS_W},`)}`;

function EcgTrace({ color, active }: { color: string; active: boolean }) {
  return (
    <div style={{ width: QRS_W, height: QRS_H, overflow: 'hidden', flexShrink: 0, opacity: active ? 1 : 0.3 }}>
      <svg
        width={QRS_W * 2}
        height={QRS_H}
        style={{
          animation: active ? `sentraEcgScroll 1.2s linear infinite` : 'none',
        }}
      >
        <polyline
          points={points2}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          style={{
            filter: active ? `drop-shadow(0 0 3px ${color})` : 'none',
          }}
        />
      </svg>
    </div>
  );
}

// ── Status dot row ─────────────────────────────────────────────────────────

function StatusIcon({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {ok
        ? <CheckCircle size={9} style={{ color: '#00FF00' }} />
        : <XCircle    size={9} style={{ color: '#FF440060' }} />}
      <span
        className="font-mono uppercase tracking-wider"
        style={{ fontSize: '8px', color: ok ? '#00FF0080' : '#FF440040' }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Mode colours ───────────────────────────────────────────────────────────

const MODE_COLORS = { ASSIST: '#1a73e8', STABILIZE: '#f97316', OBSERVE: '#10b981' };

// ── TopBar ─────────────────────────────────────────────────────────────────

export default function TopBar() {
  const { state, setDrawer } = useApp();
  const accentColor = MODE_COLORS[state.daemonMode];

  const [hud, setHud] = useState<HudStatus>({
    sensor:  false,
    camera:  false,
    network: navigator.onLine,
    armed:   false,
    ia:      false,
    geo:     '—',
  });

  // Subscribe to mesh events — no render loops, just state patches
  useEffect(() => {
    const unsubs = [
      mesh.on('HARDWARE_DIAG', (e) => {
        const d = e.payload as { camera: boolean; microphone: boolean; geolocation: boolean };
        setHud((h) => ({
          ...h,
          sensor: d.microphone && d.geolocation,
          camera: d.camera,
        }));
      }),
      mesh.on('GEO_UPDATE', (e) => {
        const { latitude, longitude } = e.payload as { latitude: number; longitude: number };
        setHud((h) => ({
          ...h,
          geo: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        }));
      }),
      mesh.on('SYSTEM_ARMED',    () => setHud((h) => ({ ...h, armed: true  }))),
      mesh.on('SYSTEM_DISARMED', () => setHud((h) => ({ ...h, armed: false, ia: false }))),
      mesh.on('IA_STATUS', (e) => {
        const { active } = e.payload as { active: boolean };
        setHud((h) => ({ ...h, ia: active }));
      }),
    ];

    // Network status
    const onOnline  = () => setHud((h) => ({ ...h, network: true  }));
    const onOffline = () => setHud((h) => ({ ...h, network: false }));
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const G = '#00FF00';

  return (
    <>
      {/* Inject CSS keyframe once */}
      <style>{`
        @keyframes sentraEcgScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-${QRS_W}px); }
        }
      `}</style>

      <header
        className="fixed top-0 left-0 right-0 z-30 flex flex-col"
        style={{
          background:   'rgba(0,0,0,0.97)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${hud.armed ? `${G}30` : 'rgba(255,255,255,0.07)'}`,
        }}
      >
        {/* ── Row 1: ECG + identity + emergency ────────────────────────── */}
        <div className="flex items-center gap-2 px-3" style={{ height: 30 }}>

          {/* ECG trace */}
          <EcgTrace color={hud.armed ? G : accentColor} active={hud.armed} />

          {/* User + geo — flex-1 to push mode pill to the right */}
          <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: 1 }}>
            <span
              className="font-mono font-bold tracking-[0.18em] leading-none"
              style={{ fontSize: '10px', color: hud.armed ? G : 'rgba(255,255,255,0.85)' }}
            >
              MATÍAS
            </span>
            <span
              className="font-mono leading-none truncate"
              style={{ fontSize: '8px', color: hud.armed ? `${G}55` : 'rgba(255,255,255,0.3)' }}
            >
              {hud.geo}
            </span>
          </div>

          {/* Mode pill */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border flex-shrink-0"
            style={{ background: `${accentColor}12`, borderColor: `${accentColor}35` }}
          >
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: accentColor }} />
            <span className="text-xs font-bold tracking-widest leading-none" style={{ color: accentColor, fontSize: '8px' }}>
              {state.daemonMode}
            </span>
          </div>

          {/* Emergency button */}
          <button
            onClick={() => setDrawer(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
            style={{
              background:   'rgba(239,68,68,0.1)',
              border:       '1px solid rgba(239,68,68,0.3)',
              color:        '#f87171',
            }}
            title="Centro de Emergencias"
          >
            <AlertTriangle size={12} />
          </button>
        </div>

        {/* ── Row 2: status strip ───────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-3"
          style={{
            height:     26,
            borderTop:  `1px solid rgba(255,255,255,0.04)`,
            background: hud.armed ? `${G}04` : 'transparent',
          }}
        >
          <StatusIcon label="SENSOR" ok={hud.sensor}  />
          <StatusIcon label="CAM"    ok={hud.camera}   />
          <StatusIcon label="NET"    ok={hud.network}  />

          {/* IA indicator — Cpu icon glows green when connected */}
          <div className="flex items-center gap-0.5">
            <Cpu
              size={9}
              style={{
                color:  hud.ia ? '#00FF00' : 'rgba(255,255,255,0.15)',
                filter: hud.ia ? 'drop-shadow(0 0 3px #00FF00)' : 'none',
                transition: 'color 0.4s, filter 0.4s',
              }}
              className={hud.ia ? 'animate-pulse' : ''}
            />
            <span
              className="font-mono uppercase tracking-wider"
              style={{ fontSize: '8px', color: hud.ia ? '#00FF0080' : 'rgba(255,255,255,0.12)' }}
            >
              IA
            </span>
          </div>

          {/* Armed indicator — far right */}
          <div className="ml-auto flex items-center gap-1">
            <span
              className={hud.armed ? 'animate-pulse' : ''}
              style={{
                display: 'block', width: 5, height: 5, borderRadius: '50%',
                background: hud.armed ? G : 'rgba(255,255,255,0.15)',
                boxShadow:  hud.armed ? `0 0 5px ${G}` : 'none',
              }}
            />
            <span
              className="font-mono tracking-widest"
              style={{ fontSize: '8px', color: hud.armed ? `${G}80` : 'rgba(255,255,255,0.2)' }}
            >
              {hud.armed ? 'ARMED' : 'STANDBY'}
            </span>
          </div>
        </div>
      </header>
    </>
  );
}
