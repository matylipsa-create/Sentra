import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Home, AlertTriangle, Send } from 'lucide-react';

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

const MODE_KEY       = 'sentra_mode';
const REMOTE_URL_KEY = 'sentra_remote_url';
const DEFAULT_REMOTE = 'http://192.168.1.50:8080/video';
const RETRY_DELAY_MS = 5000;

export default function SentraVisionPanel({ onThreat, onCameraBlocked, location }: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const workerRef     = useRef<Worker | null>(null);
  const captureRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const retryRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether this effect instance is still mounted to avoid stale retries
  const mountedRef    = useRef(true);

  const [mode, setMode]           = useState<'LOCAL' | 'REMOTE'>(
    () => (localStorage.getItem(MODE_KEY) as 'LOCAL' | 'REMOTE') || 'LOCAL'
  );
  const [modelReady, setModelReady]   = useState(false);
  const [detections, setDetections]   = useState<Detection[]>([]);
  const [threats, setThreats]         = useState<Detection[]>([]);
  const [status, setStatus]           = useState<'CONNECTING' | 'ACTIVE' | 'ERROR'>('CONNECTING');
  const [lastAlert, setLastAlert]     = useState<string | null>(null);

  // ── Worker ────────────────────────────────────────────────────────────────
  const teardownWorker = useCallback(() => {
    if (captureRef.current) { clearInterval(captureRef.current); captureRef.current = null; }
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

  // ── Capture loop (3 FPS) ──────────────────────────────────────────────────
  const startCapture = useCallback(() => {
    if (captureRef.current) clearInterval(captureRef.current);

    captureRef.current = setInterval(() => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !modelReady || video.readyState < 2) return;

      canvas.width  = video.videoWidth  || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);

      createImageBitmap(canvas)
        .then((bitmap) =>
          workerRef.current?.postMessage({ type: 'DETECT', payload: { bitmap } }, [bitmap])
        )
        .catch(() => {});
    }, 333);
  }, [modelReady]);

  // ── Stream: schedule retry ─────────────────────────────────────────────────
  const scheduleRetry = useCallback((initFn: () => void) => {
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      if (mountedRef.current) initFn();
    }, RETRY_DELAY_MS);
  }, []);

  // ── Stream: LOCAL (device camera) ─────────────────────────────────────────
  const initLocal = useCallback(async () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const vid = videoRef.current;
    if (vid) { vid.srcObject = null; vid.src = ''; }

    setStatus('CONNECTING');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      streamRef.current = stream;
      if (vid) {
        vid.srcObject = stream;

        // Auto-recover on stream interruption
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

  // ── Stream: REMOTE (IP camera / MJPEG) ────────────────────────────────────
  const initRemote = useCallback(async () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const remoteUrl = localStorage.getItem(REMOTE_URL_KEY) || DEFAULT_REMOTE;
    setStatus('CONNECTING');

    // Validate URL
    try { new URL(remoteUrl); } catch {
      setStatus('ERROR');
      return;
    }

    const vid = videoRef.current;
    if (!vid) return;

    vid.srcObject = null;
    vid.src = remoteUrl;

    vid.onloadeddata = () => { if (mountedRef.current) setStatus('ACTIVE'); };
    vid.onstalled    = () => scheduleRetry(initRemote);
    vid.onerror      = () => {
      if (!mountedRef.current) return;
      setStatus('ERROR');
      scheduleRetry(initRemote);
    };

    try { await vid.play(); } catch { /* onerror handles it */ }
  }, [scheduleRetry]);

  // ── Toggle mode ────────────────────────────────────────────────────────────
  const toggleMode = useCallback((next: 'LOCAL' | 'REMOTE') => {
    if (next === mode) return;
    setMode(next);
    localStorage.setItem(MODE_KEY, next);
    setDetections([]);
    setThreats([]);
    // Re-init worker for clean slate
    initWorker();
  }, [mode, initWorker]);

  // ── Forward GPS to worker ──────────────────────────────────────────────────
  useEffect(() => {
    if (location && workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_LOCATION',
        payload: { latitude: location.latitude, longitude: location.longitude },
      });
    }
  }, [location?.latitude, location?.longitude]);

  // ── Bootstrap worker once ──────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    initWorker();
    return () => {
      mountedRef.current = false;
      teardownWorker();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-init stream on mode change ─────────────────────────────────────────
  useEffect(() => {
    if (mode === 'LOCAL') initLocal();
    else                  initRemote();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start capture when model is ready ─────────────────────────────────────
  useEffect(() => {
    if (modelReady) startCapture();
    return () => { if (captureRef.current) clearInterval(captureRef.current); };
  }, [modelReady, startCapture]);

  // ── Colours ────────────────────────────────────────────────────────────────
  const hasThreat   = threats.length > 0;
  const accentGreen = '#00FF00';
  const accentRed   = '#FF4400';
  const accentCyan  = '#00BFFF';
  const borderColor = hasThreat ? accentRed : status === 'ERROR' ? '#FF000060' : `${accentGreen}40`;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        muted
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-cover opacity-80"
        style={{ filter: 'brightness(0.9) hue-rotate(90deg) saturate(0.3)' }}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── HUD overlay (pointer-events-none except buttons) ─────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Border */}
        <div className="absolute inset-0 border" style={{ borderColor }} />

        {/* Corner brackets */}
        {['top-1 left-1', 'top-1 right-1', 'bottom-1 left-1', 'bottom-1 right-1'].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-3 h-3`}
            style={{
              borderTop:    i < 2       ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
              borderBottom: i >= 2      ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
              borderLeft:   i % 2 === 0 ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
              borderRight:  i % 2 === 1 ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
            }}
          />
        ))}

        {/* Top-centre status label */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2">
          <span style={{ color: accentGreen, fontSize: '8px', opacity: 0.7, fontFamily: 'monospace' }}>
            {status === 'CONNECTING'
              ? 'CONECTANDO...'
              : !modelReady
                ? 'CARGANDO MODELO...'
                : `${detections.length} OBJ · ${mode}`}
          </span>
        </div>

        {/* Threat badge */}
        {hasThreat && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-1 px-2 py-1 animate-pulse"
              style={{ background: 'rgba(255,68,0,0.3)', border: `1px solid ${accentRed}` }}>
              <AlertTriangle size={10} style={{ color: accentRed }} />
              <span style={{ color: accentRed, fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                {threats[0].class.toUpperCase()} {(threats[0].score * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* Alert-sent flash */}
        {lastAlert && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1 px-2 py-0.5"
              style={{ background: 'rgba(0,191,255,0.2)', border: `1px solid ${accentCyan}` }}>
              <Send size={8} style={{ color: accentCyan }} />
              <span style={{ color: accentCyan, fontSize: '8px', fontFamily: 'monospace' }}>
                {lastAlert}
              </span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {status === 'ERROR' && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)' }}>
            <p style={{ color: '#FF4400', fontSize: '10px', fontFamily: 'monospace' }}>
              [STREAM ERROR — REINTENTANDO...]
            </p>
          </div>
        )}
      </div>

      {/* ── Mode buttons + status dot (pointer-events enabled) ───────────── */}
      <div className="absolute top-2 left-2 z-50 flex items-center gap-1">
        {/* LOCAL */}
        <button
          onClick={() => toggleMode('LOCAL')}
          title="Cámara local"
          className="p-1.5 border transition-all"
          style={{
            background:  mode === 'LOCAL' ? 'rgba(0,255,0,0.15)'  : 'rgba(0,0,0,0.7)',
            borderColor: mode === 'LOCAL' ? accentGreen            : `${accentGreen}25`,
          }}
        >
          <Camera size={12} style={{ color: mode === 'LOCAL' ? accentGreen : `${accentGreen}35` }} />
        </button>

        {/* REMOTE */}
        <button
          onClick={() => toggleMode('REMOTE')}
          title="Cámara IP remota"
          className="p-1.5 border transition-all"
          style={{
            background:  mode === 'REMOTE' ? 'rgba(0,191,255,0.15)' : 'rgba(0,0,0,0.7)',
            borderColor: mode === 'REMOTE' ? accentCyan              : `${accentCyan}25`,
          }}
        >
          <Home size={12} style={{ color: mode === 'REMOTE' ? accentCyan : `${accentCyan}35` }} />
        </button>

        {/* Status dot */}
        <span
          className={status === 'ACTIVE' ? 'animate-pulse' : ''}
          style={{
            display: 'block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            marginLeft: 2,
            background: status === 'ACTIVE'
              ? accentGreen
              : status === 'CONNECTING'
                ? '#F59E0B'
                : '#EF4444',
            boxShadow: status === 'ACTIVE'
              ? `0 0 6px ${accentGreen}`
              : status === 'ERROR'
                ? '0 0 6px #EF4444'
                : 'none',
          }}
        />
      </div>
    </div>
  );
}
