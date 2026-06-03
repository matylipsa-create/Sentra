import { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, AlertTriangle, Send, Camera, Home } from 'lucide-react';

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

const REMOTE_URL_KEY = 'sentra_remote_url';
const MODE_KEY = 'sentra_mode';
const DEFAULT_REMOTE = 'http://192.168.1.50:8080/video';
const RECONNECT_DELAY_MS = 3000;

export default function SentraVisionPanel({ onThreat, onCameraBlocked, location }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const workerRef  = useRef<Worker | null>(null);
  const captureRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sourceMode, setSourceMode] = useState<'LOCAL' | 'REMOTE'>(
    () => (localStorage.getItem(MODE_KEY) as 'LOCAL' | 'REMOTE') || 'LOCAL'
  );
  const [modelReady, setModelReady]     = useState(false);
  const [detections, setDetections]     = useState<Detection[]>([]);
  const [threats, setThreats]           = useState<Detection[]>([]);
  const [cameraError, setCameraError]   = useState('');
  const [lastAlertSent, setLastAlertSent] = useState<string | null>(null);
  const [connecting, setConnecting]     = useState(false);

  // ── Worker init ────────────────────────────────────────────────────────────
  const initWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'DESTROY' });
      workerRef.current.terminate();
    }

    workerRef.current = new Worker(
      new URL('../workers/sentraVision.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e) => {
      const { type } = e.data;
      if (type === 'MODEL_READY') {
        setModelReady(true);
      } else if (type === 'DETECTIONS') {
        setDetections(e.data.predictions);
        setThreats(e.data.threats);
        for (const t of e.data.threats) onThreat(t.class, t.score);
      } else if (type === 'ALERT_SENT') {
        setLastAlertSent(`${e.data.detected.class} → Pipedream`);
        setTimeout(() => setLastAlertSent(null), 3000);
      } else if (type === 'ALERT_FAILED') {
        onThreat(e.data.detected.class, e.data.detected.score);
      } else if (type === 'UI_ACTION_REQUEST' && e.data.action === 'SHOW_CAMERA_MODAL') {
        onCameraBlocked?.(e.data.message);
      }
    };

    workerRef.current.postMessage({ type: 'INIT' });
  }, [onThreat, onCameraBlocked]);

  // ── Frame capture loop ─────────────────────────────────────────────────────
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
    }, 333); // 3 FPS cap
  }, [modelReady]);

  // ── Stream init — LOCAL (device camera) ───────────────────────────────────
  const initLocal = useCallback(async () => {
    // Release any previous stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.src = '';
        await videoRef.current.play();
      }
      setCameraError('');
      setConnecting(false);
    } catch (e) {
      const err = e as DOMException;
      setConnecting(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        workerRef.current?.postMessage({ type: 'CAMERA_DENIED' });
        onCameraBlocked?.('Permiso de cámara denegado. Habilitalo en ajustes del sitio.');
      } else {
        setCameraError('Cámara no disponible');
      }
    }
  }, [onCameraBlocked]);

  // ── Stream init — REMOTE (IP camera / MJPEG stream) ───────────────────────
  const initRemote = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const remoteUrl = localStorage.getItem(REMOTE_URL_KEY) || DEFAULT_REMOTE;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    try {
      // Validate URL before assigning
      new URL(remoteUrl);
    } catch {
      setCameraError(`URL inválida: ${remoteUrl}`);
      setConnecting(false);
      return;
    }

    if (videoRef.current) {
      videoRef.current.src = remoteUrl;

      const onError = () => {
        setCameraError(`Sin señal: ${remoteUrl}`);
        setConnecting(false);
        // Auto-reconnect after delay
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          if (localStorage.getItem(MODE_KEY) === 'REMOTE') initRemote();
        }, RECONNECT_DELAY_MS);
      };

      videoRef.current.onerror = onError;
      videoRef.current.onloadeddata = () => {
        setCameraError('');
        setConnecting(false);
      };

      try {
        await videoRef.current.play();
      } catch {
        // play() rejection is handled by onerror above
      }
    }
  }, []);

  // ── Unified stream init ────────────────────────────────────────────────────
  const initStream = useCallback(async () => {
    if (captureRef.current) clearInterval(captureRef.current);
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    setCameraError('');
    setConnecting(true);

    if (sourceMode === 'LOCAL') {
      await initLocal();
    } else {
      await initRemote();
    }
  }, [sourceMode, initLocal, initRemote]);

  // ── Toggle mode ────────────────────────────────────────────────────────────
  const toggleMode = useCallback((mode: 'LOCAL' | 'REMOTE') => {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    localStorage.setItem(MODE_KEY, mode);
    setModelReady(false);
    setDetections([]);
    setThreats([]);
  }, [sourceMode]);

  // ── Forward GPS to worker ──────────────────────────────────────────────────
  useEffect(() => {
    if (location && workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_LOCATION',
        payload: { latitude: location.latitude, longitude: location.longitude },
      });
    }
  }, [location?.latitude, location?.longitude]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    initWorker();
  }, []);

  useEffect(() => {
    initStream();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (captureRef.current)  clearInterval(captureRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [initStream]);

  useEffect(() => {
    if (modelReady) startCapture();
    return () => { if (captureRef.current) clearInterval(captureRef.current); };
  }, [modelReady, startCapture]);

  // ── Cleanup worker on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      workerRef.current?.postMessage({ type: 'DESTROY' });
      workerRef.current?.terminate();
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasThreat   = threats.length > 0;
  const accentGreen = '#00FF00';
  const accentRed   = '#FF4400';
  const accentCyan  = '#00BFFF';
  const borderColor = hasThreat ? accentRed : `${accentGreen}40`;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">

      {/* Video element — shared between LOCAL and REMOTE modes */}
      <video
        ref={videoRef}
        muted
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-cover opacity-80"
        style={{ filter: 'brightness(0.9) hue-rotate(90deg) saturate(0.3)' }}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── HUD overlay ──────────────────────────────────────────────────── */}
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

        {/* Top-centre status */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2">
          <span style={{ color: accentGreen, fontSize: '8px', opacity: 0.7, fontFamily: 'monospace' }}>
            {connecting
              ? 'CONECTANDO...'
              : !modelReady
                ? 'CARGANDO MODELO...'
                : `${detections.length} OBJ · ${sourceMode}`}
          </span>
        </div>

        {/* Threat badge */}
        {hasThreat && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="flex items-center gap-1 px-2 py-1 animate-pulse"
              style={{ background: 'rgba(255,68,0,0.3)', border: `1px solid ${accentRed}` }}
            >
              <AlertTriangle size={10} style={{ color: accentRed }} />
              <span style={{ color: accentRed, fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                {threats[0].class.toUpperCase()} {(threats[0].score * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* Alert-sent flash */}
        {lastAlertSent && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1 px-2 py-0.5"
              style={{ background: 'rgba(0,191,255,0.2)', border: `1px solid ${accentCyan}` }}>
              <Send size={8} style={{ color: accentCyan }} />
              <span style={{ color: accentCyan, fontSize: '8px', fontFamily: 'monospace' }}>
                {lastAlertSent}
              </span>
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && !connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <Eye size={18} style={{ color: `${accentGreen}30` }} />
            <p style={{ color: `${accentGreen}60`, fontSize: '9px', fontFamily: 'monospace', textAlign: 'center', padding: '0 8px' }}>
              {cameraError}
            </p>
          </div>
        )}
      </div>

      {/* ── Source mode toggle (pointer-events enabled) ───────────────────── */}
      <div className="absolute top-2 left-2 z-50 flex gap-1">
        {/* LOCAL — device camera */}
        <button
          onClick={() => toggleMode('LOCAL')}
          title="Cámara local (dispositivo)"
          className="p-1.5 border transition-all"
          style={{
            background: sourceMode === 'LOCAL' ? 'rgba(0,255,0,0.15)' : 'rgba(0,0,0,0.6)',
            borderColor: sourceMode === 'LOCAL' ? accentGreen : `${accentGreen}30`,
          }}
        >
          <Camera size={12} style={{ color: sourceMode === 'LOCAL' ? accentGreen : `${accentGreen}40` }} />
        </button>

        {/* REMOTE — IP camera */}
        <button
          onClick={() => toggleMode('REMOTE')}
          title="Cámara remota (IP)"
          className="p-1.5 border transition-all"
          style={{
            background: sourceMode === 'REMOTE' ? 'rgba(0,191,255,0.15)' : 'rgba(0,0,0,0.6)',
            borderColor: sourceMode === 'REMOTE' ? accentCyan : `${accentCyan}30`,
          }}
        >
          <Home size={12} style={{ color: sourceMode === 'REMOTE' ? accentCyan : `${accentCyan}40` }} />
        </button>
      </div>
    </div>
  );
}
