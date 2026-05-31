import { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, AlertTriangle, Send } from 'lucide-react';

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

export default function SentraVisionPanel({ onThreat, onCameraBlocked, location }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const workerRef   = useRef<Worker | null>(null);
  const captureRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [modelReady, setModelReady] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [threats, setThreats]       = useState<Detection[]>([]);
  const [cameraError, setCameraError] = useState('');
  const [lastAlertSent, setLastAlertSent] = useState<string | null>(null);

  // Forward GPS location to worker whenever it changes
  useEffect(() => {
    if (location && workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_LOCATION',
        payload: { latitude: location.latitude, longitude: location.longitude },
      });
    }
  }, [location?.latitude, location?.longitude]);

  const initWorker = useCallback(() => {
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
        for (const t of e.data.threats) {
          onThreat(t.class, t.score);
        }
      } else if (type === 'ALERT_SENT') {
        setLastAlertSent(`${e.data.detected.class} → Pipedream`);
        setTimeout(() => setLastAlertSent(null), 3000);
      } else if (type === 'ALERT_FAILED') {
        // Bubble up so SentraMesh can queue it
        onThreat(e.data.detected.class, e.data.detected.score);
      } else if (type === 'UI_ACTION_REQUEST' && e.data.action === 'SHOW_CAMERA_MODAL') {
        onCameraBlocked?.(e.data.message);
      }
    };

    workerRef.current.postMessage({ type: 'INIT' });
  }, [onThreat, onCameraBlocked]);

  const startCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;

    captureRef.current = setInterval(() => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !modelReady) return;

      canvas.width  = video.videoWidth  || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);

      createImageBitmap(canvas)
        .then((bitmap) => workerRef.current?.postMessage({ type: 'DETECT', payload: { bitmap } }, [bitmap]))
        .catch(() => {});
    }, 333); // 3 FPS
  }, [modelReady]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        initWorker();
      } catch (e) {
        const err = e as DOMException;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          workerRef.current?.postMessage({ type: 'CAMERA_DENIED' });
          onCameraBlocked?.('Permiso de cámara denegado. Habilitalo en ajustes del sitio.');
        } else {
          setCameraError('Cámara no disponible');
        }
      }
    };

    init();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (captureRef.current) clearInterval(captureRef.current);
      workerRef.current?.postMessage({ type: 'DESTROY' });
      workerRef.current?.terminate();
    };
  }, [initWorker, onCameraBlocked]);

  useEffect(() => {
    if (modelReady) startCapture();
  }, [modelReady, startCapture]);

  const hasThreat  = threats.length > 0;
  const accentGreen = '#00FF00';
  const accentRed   = '#FF4400';
  const borderColor = hasThreat ? accentRed : `${accentGreen}40`;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {cameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Eye size={20} style={{ color: `${accentGreen}30` }} />
          <p style={{ color: `${accentGreen}50`, fontSize: '10px', fontFamily: 'monospace' }}>{cameraError}</p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover opacity-80"
            style={{ filter: 'brightness(0.9) hue-rotate(90deg) saturate(0.3)' }}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* HUD overlay */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Border */}
            <div className="absolute inset-0 border" style={{ borderColor }} />

            {/* Corner brackets */}
            {[
              'top-1 left-1',
              'top-1 right-1',
              'bottom-1 left-1',
              'bottom-1 right-1',
            ].map((pos, i) => (
              <div key={i} className={`absolute ${pos} w-3 h-3`}
                style={{
                  borderTop:    i < 2      ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
                  borderBottom: i >= 2     ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
                  borderLeft:   i % 2 === 0 ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
                  borderRight:  i % 2 === 1 ? `2px solid ${hasThreat ? accentRed : accentGreen}` : 'none',
                }}
              />
            ))}

            {/* Top-center status */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2">
              <span style={{ color: accentGreen, fontSize: '8px', opacity: 0.7, fontFamily: 'monospace' }}>
                {!modelReady ? 'CARGANDO MODELO...' : `${detections.length} OBJ`}
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

            {/* Alert-sent confirmation (3s flash) */}
            {lastAlertSent && (
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-1 px-2 py-0.5"
                  style={{ background: 'rgba(0,191,255,0.2)', border: '1px solid #00BFFF' }}>
                  <Send size={8} style={{ color: '#00BFFF' }} />
                  <span style={{ color: '#00BFFF', fontSize: '8px', fontFamily: 'monospace' }}>
                    {lastAlertSent}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
