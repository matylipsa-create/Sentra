import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera, Home, AlertTriangle, Send,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface Props {
  onThreat: (label: string, confidence: number) => void;
  onCameraBlocked?: (msg: string) => void;
  location?: { latitude: number; longitude: number } | null;
}

type PtzDir = 'up' | 'down' | 'left' | 'right' | 'zoom_in' | 'zoom_out';

// ── Constants ──────────────────────────────────────────────────────────────

const MODE_KEY       = 'sentra_mode';
const REMOTE_URL_KEY = 'sentra_remote_url';
const DEFAULT_REMOTE = 'http://192.168.1.50:8080/video';
const RETRY_MS       = 5000;

// ── PTZ hook — completely isolated from the video stream ───────────────────

function usePTZ(mode: 'LOCAL' | 'REMOTE') {
  const holdRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef  = useRef<PtzDir | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendCommand = useCallback((direction: PtzDir) => {
    if (mode !== 'REMOTE') return;
    const base = localStorage.getItem(REMOTE_URL_KEY) || DEFAULT_REMOTE;
    // Strip trailing stream path so PTZ endpoint is always at the camera root
    const origin = base.replace(/\/video$/, '').replace(/\/$/, '');
    const url    = `${origin}/ptz?direction=${direction}`;
    fetch(url, { method: 'GET', signal: AbortSignal.timeout(1500) }).catch(() => {});
  }, [mode]);

  const press = useCallback((dir: PtzDir) => {
    if (mode !== 'REMOTE') return;
    sendCommand(dir);
    activeRef.current = dir;
    holdRef.current = setInterval(() => sendCommand(dir), 300);
  }, [mode, sendCommand]);

  const release = useCallback(() => {
    if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; }
    activeRef.current = null;
  }, []);

  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 3500);
  }, []);

  useEffect(() => () => {
    if (holdRef.current) clearInterval(holdRef.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return { visible, showControls, press, release, active: activeRef };
}

// ── Swipe detection ────────────────────────────────────────────────────────

function useSwipe(
  ref: React.RefObject<HTMLElement>,
  onSwipe: (dir: PtzDir) => void,
  onTap: () => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0, startY = 0, startT = 0;

    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    };

    const onEnd = (e: TouchEvent) => {
      const dx   = e.changedTouches[0].clientX - startX;
      const dy   = e.changedTouches[0].clientY - startY;
      const dist = Math.hypot(dx, dy);
      const dt   = Date.now() - startT;

      // Tap — reveal controls
      if (dist < 12 && dt < 300) { onTap(); return; }
      // Swipe threshold
      if (dist < 30) return;

      const dir: PtzDir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down'  : 'up');
      onSwipe(dir);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [ref, onSwipe, onTap]);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SentraVisionPanel({ onThreat, onCameraBlocked, location }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const videoWrap   = useRef<HTMLDivElement>(null);
  const workerRef   = useRef<Worker | null>(null);
  const captureRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(true);

  const [mode, setMode]         = useState<'LOCAL' | 'REMOTE'>(
    () => (localStorage.getItem(MODE_KEY) as 'LOCAL' | 'REMOTE') || 'LOCAL'
  );
  const [modelReady, setModelReady]   = useState(false);
  const [detections, setDetections]   = useState<Detection[]>([]);
  const [threats, setThreats]         = useState<Detection[]>([]);
  const [status, setStatus]           = useState<'CONNECTING' | 'ACTIVE' | 'ERROR'>('CONNECTING');
  const [lastAlert, setLastAlert]     = useState<string | null>(null);

  const ptz = usePTZ(mode);

  useSwipe(
    videoWrap as React.RefObject<HTMLElement>,
    (dir) => { ptz.showControls(); ptz.press(dir); setTimeout(ptz.release, 250); },
    ptz.showControls,
  );

  // ── Helpers ──────────────────────────────────────────────────────────────
  const clearRetry = () => { if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; } };
  const scheduleRetry = useCallback((fn: () => void) => {
    clearRetry();
    retryRef.current = setTimeout(() => { if (mountedRef.current) fn(); }, RETRY_MS);
  }, []);
  const stopCapture = () => { if (captureRef.current) { clearInterval(captureRef.current); captureRef.current = null; } };
  const stopStream  = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  // ── Worker ────────────────────────────────────────────────────────────────
  const teardownWorker = useCallback(() => {
    stopCapture();
    workerRef.current?.postMessage({ type: 'DESTROY' });
    workerRef.current?.terminate();
    workerRef.current = null;
    setModelReady(false);
  }, []);

  const initWorker = useCallback(() => {
    teardownWorker();
    const worker = new Worker(
      new URL('../workers/sentraVision.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === 'MODEL_READY') {
        setModelReady(true);
      } else if (type === 'DETECTIONS') {
        setDetections(e.data.predictions ?? []);
        setThreats(e.data.threats ?? []);
        for (const t of (e.data.threats ?? [])) onThreat(t.class, t.score);
      } else if (type === 'ALERT_SENT') {
        setLastAlert(`${e.data.detected.class} → Pipedream`);
        setTimeout(() => setLastAlert(null), 3000);
      } else if (type === 'ALERT_FAILED') {
        onThreat(e.data.detected.class, e.data.detected.score);
      } else if (type === 'UI_ACTION_REQUEST' && e.data.action === 'SHOW_CAMERA_MODAL') {
        onCameraBlocked?.(e.data.message);
      }
    };
    worker.postMessage({ type: 'INIT' });
    workerRef.current = worker;
  }, [teardownWorker, onThreat, onCameraBlocked]);

  // ── Capture loop (3 FPS) ─────────────────────────────────────────────────
  const startCapture = useCallback(() => {
    stopCapture();
    captureRef.current = setInterval(() => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !modelReady || video.readyState < 2) return;
      canvas.width  = video.videoWidth  || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      createImageBitmap(canvas)
        .then((bmp) => workerRef.current?.postMessage({ type: 'DETECT', payload: { bitmap: bmp } }, [bmp]))
        .catch(() => {});
    }, 333);
  }, [modelReady]);

  // ── Stream: LOCAL ────────────────────────────────────────────────────────
  const initLocal = useCallback(async () => {
    clearRetry();
    stopStream();
    const vid = videoRef.current;
    if (vid) { vid.srcObject = null; vid.src = ''; vid.onerror = null; vid.onstalled = null; }
    setStatus('CONNECTING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (vid) {
        vid.srcObject = stream;
        vid.onstalled = () => scheduleRetry(initLocal);
        vid.onerror   = () => { setStatus('ERROR'); scheduleRetry(initLocal); };
        await vid.play();
      }
      setStatus('ACTIVE');
    } catch (e) {
      if (!mountedRef.current) return;
      const err = e as DOMException;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        workerRef.current?.postMessage({ type: 'CAMERA_DENIED' });
        onCameraBlocked?.('Permiso de cámara denegado. Habilitalo en ajustes del sitio.');
      }
      setStatus('ERROR');
      scheduleRetry(initLocal);
    }
  }, [onCameraBlocked, scheduleRetry]);

  // ── Stream: REMOTE ───────────────────────────────────────────────────────
  const initRemote = useCallback(async () => {
    clearRetry();
    stopStream();
    const vid = videoRef.current;
    if (!vid) return;
    const url = localStorage.getItem(REMOTE_URL_KEY) || DEFAULT_REMOTE;
    try { new URL(url); } catch { setStatus('ERROR'); return; }
    setStatus('CONNECTING');
    vid.srcObject    = null;
    vid.src          = url;
    vid.onloadeddata = () => { if (mountedRef.current) setStatus('ACTIVE'); };
    vid.onstalled    = () => scheduleRetry(initRemote);
    vid.onerror      = () => { if (!mountedRef.current) return; setStatus('ERROR'); scheduleRetry(initRemote); };
    try { await vid.play(); } catch { /* handled by onerror */ }
  }, [scheduleRetry]);

  // ── Mode toggle ──────────────────────────────────────────────────────────
  const switchMode = useCallback((next: 'LOCAL' | 'REMOTE') => {
    if (next === mode) return;
    setMode(next);
    localStorage.setItem(MODE_KEY, next);
    setDetections([]);
    setThreats([]);
    initWorker();
  }, [mode, initWorker]);

  // ── GPS forwarding ───────────────────────────────────────────────────────
  useEffect(() => {
    if (location && workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_LOCATION',
        payload: { latitude: location.latitude, longitude: location.longitude },
      });
    }
  }, [location?.latitude, location?.longitude]);

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    initWorker();
    return () => {
      mountedRef.current = false;
      teardownWorker();
      stopStream();
      clearRetry();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'LOCAL') initLocal();
    else                  initRemote();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (modelReady) startCapture();
    return stopCapture;
  }, [modelReady, startCapture]);

  // ── Visual constants ─────────────────────────────────────────────────────
  const hasThreat   = threats.length > 0;
  const G           = '#00FF00';
  const R           = '#FF4400';
  const C           = '#00BFFF';
  const borderColor = hasThreat ? R : status === 'ERROR' ? '#FF000060' : `${G}40`;
  const dotColor    = status === 'ACTIVE' ? G : status === 'CONNECTING' ? '#F59E0B' : '#EF4444';

  // PTZ button helper
  const PtzBtn = ({
    dir, icon: Icon, style,
  }: {
    dir: PtzDir;
    icon: React.ElementType;
    style?: React.CSSProperties;
  }) => {
    const isActive = ptz.active.current === dir;
    return (
      <button
        onPointerDown={(e) => { e.preventDefault(); ptz.press(dir); }}
        onPointerUp={ptz.release}
        onPointerLeave={ptz.release}
        className="flex items-center justify-center transition-all select-none"
        style={{
          width: 36, height: 36,
          background: isActive ? `${C}25` : `rgba(0,0,0,0.55)`,
          border: `1px solid ${isActive ? C : `${C}40`}`,
          color: isActive ? C : `${C}80`,
          backdropFilter: 'blur(4px)',
          touchAction: 'none',
          ...style,
        }}
      >
        <Icon size={14} />
      </button>
    );
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">

      {/* ── Video area: 80% height ──────────────────────────────────────── */}
      <div ref={videoWrap} className="relative w-full" style={{ flex: '0 0 80%', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          crossOrigin="anonymous"
          className="w-full h-full object-cover opacity-80"
          style={{ filter: 'brightness(0.9) hue-rotate(90deg) saturate(0.3)' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* HUD overlay — pointer-events-none */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 border" style={{ borderColor }} />

          {/* Corner brackets */}
          {(['top-1 left-1', 'top-1 right-1', 'bottom-1 left-1', 'bottom-1 right-1'] as const).map((pos, i) => (
            <div key={i} className={`absolute ${pos} w-3 h-3`} style={{
              borderTop:    i < 2       ? `2px solid ${hasThreat ? R : G}` : 'none',
              borderBottom: i >= 2      ? `2px solid ${hasThreat ? R : G}` : 'none',
              borderLeft:   i % 2 === 0 ? `2px solid ${hasThreat ? R : G}` : 'none',
              borderRight:  i % 2 === 1 ? `2px solid ${hasThreat ? R : G}` : 'none',
            }} />
          ))}

          {/* Top-centre status */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2">
            <span style={{ color: G, fontSize: '8px', opacity: 0.7, fontFamily: 'monospace' }}>
              {status === 'CONNECTING' ? 'CONECTANDO...' : !modelReady ? 'CARGANDO MODELO...' : `${detections.length} OBJ · ${mode}`}
            </span>
          </div>

          {/* Threat badge */}
          {hasThreat && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-1 px-2 py-1 animate-pulse"
                style={{ background: 'rgba(255,68,0,0.3)', border: `1px solid ${R}` }}>
                <AlertTriangle size={10} style={{ color: R }} />
                <span style={{ color: R, fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {threats[0].class.toUpperCase()} {(threats[0].score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {/* Alert-sent flash */}
          {lastAlert && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-1 px-2 py-0.5"
                style={{ background: 'rgba(0,191,255,0.2)', border: `1px solid ${C}` }}>
                <Send size={8} style={{ color: C }} />
                <span style={{ color: C, fontSize: '8px', fontFamily: 'monospace' }}>{lastAlert}</span>
              </div>
            </div>
          )}

          {/* Stream error overlay */}
          {status === 'ERROR' && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
              <p style={{ color: R, fontSize: '10px', fontFamily: 'monospace' }}>
                [STREAM ERROR — REINTENTANDO EN 5s...]
              </p>
            </div>
          )}

          {/* Swipe hint — shown only once until first tap */}
          {mode === 'REMOTE' && !ptz.visible && status === 'ACTIVE' && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
              <span style={{ color: `${C}50`, fontSize: '8px', fontFamily: 'monospace' }}>
                TAP PARA CONTROLES PTZ
              </span>
            </div>
          )}
        </div>

        {/* Mode buttons + status dot — interactive, sit on top of HUD */}
        <div className="absolute top-2 left-2 z-50 flex items-center gap-1">
          <button
            onClick={() => switchMode('LOCAL')}
            title="Cámara local"
            className="p-1.5 border transition-all"
            style={{
              background:  mode === 'LOCAL' ? 'rgba(0,255,0,0.15)'  : 'rgba(0,0,0,0.7)',
              borderColor: mode === 'LOCAL' ? G                      : `${G}25`,
            }}
          >
            <Camera size={12} style={{ color: mode === 'LOCAL' ? G : `${G}35` }} />
          </button>

          <button
            onClick={() => switchMode('REMOTE')}
            title="Cámara IP remota"
            className="p-1.5 border transition-all"
            style={{
              background:  mode === 'REMOTE' ? 'rgba(0,191,255,0.15)' : 'rgba(0,0,0,0.7)',
              borderColor: mode === 'REMOTE' ? C                       : `${C}25`,
            }}
          >
            <Home size={12} style={{ color: mode === 'REMOTE' ? C : `${C}35` }} />
          </button>

          <span
            className={status === 'ACTIVE' ? 'animate-pulse' : ''}
            style={{
              display: 'block', width: 6, height: 6, borderRadius: '50%', marginLeft: 2,
              background: dotColor,
              boxShadow: status !== 'CONNECTING' ? `0 0 6px ${dotColor}` : 'none',
            }}
          />
        </div>
      </div>

      {/* ── PTZ control zone: 20% height ───────────────────────────────── */}
      <div
        className="relative w-full flex items-center justify-center"
        style={{ flex: '0 0 20%', background: 'rgba(0,0,0,0.85)', borderTop: `1px solid ${C}15` }}
      >
        {mode === 'LOCAL' ? (
          /* Local mode — no PTZ, show label */
          <p style={{ color: `${G}25`, fontFamily: 'monospace', fontSize: '9px', letterSpacing: '0.2em' }}>
            PTZ · SOLO MODO CÁMARA IP
          </p>
        ) : (
          /* REMOTE mode — joystick + zoom */
          <div
            className="flex items-center justify-center gap-6"
            style={{
              transition: 'opacity 0.3s',
              opacity: ptz.visible ? 1 : 0.25,
            }}
          >
            {/* D-pad */}
            <div className="relative" style={{ width: 108, height: 108 }}>
              {/* Up */}
              <div className="absolute" style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}>
                <PtzBtn dir="up" icon={ChevronUp} />
              </div>
              {/* Left */}
              <div className="absolute" style={{ top: '50%', left: 0, transform: 'translateY(-50%)' }}>
                <PtzBtn dir="left" icon={ChevronLeft} />
              </div>
              {/* Centre dot */}
              <div
                className="absolute"
                style={{
                  top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                  width: 10, height: 10, borderRadius: '50%',
                  background: `${C}30`, border: `1px solid ${C}50`,
                }}
              />
              {/* Right */}
              <div className="absolute" style={{ top: '50%', right: 0, transform: 'translateY(-50%)' }}>
                <PtzBtn dir="right" icon={ChevronRight} />
              </div>
              {/* Down */}
              <div className="absolute" style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)' }}>
                <PtzBtn dir="down" icon={ChevronDown} />
              </div>
            </div>

            {/* Zoom column */}
            <div className="flex flex-col gap-2">
              <PtzBtn dir="zoom_in"  icon={ZoomIn}  />
              <div style={{ height: 1, background: `${C}20` }} />
              <PtzBtn dir="zoom_out" icon={ZoomOut} />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
