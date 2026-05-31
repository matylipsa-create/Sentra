import { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, AlertTriangle } from 'lucide-react';

interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface Props {
  onThreat: (label: string, confidence: number) => void;
}

const THREAT_CLASSES = new Set(['person', 'knife', 'scissors', 'gun']);

export default function SentraVisionPanel({ onThreat }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const captureRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [modelReady, setModelReady] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [threats, setThreats] = useState<Detection[]>([]);
  const [cameraError, setCameraError] = useState('');

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
      }
    };

    workerRef.current.postMessage({ type: 'INIT' });
  }, [onThreat]);

  const startCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;

    // 3 FPS — also enforced inside worker
    captureRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !modelReady) return;

      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      createImageBitmap(canvas).then((bitmap) => {
        workerRef.current?.postMessage({ type: 'DETECT', payload: { bitmap } }, [bitmap]);
      }).catch(() => {});
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
        setCameraError('Cámara no disponible');
      }
    };

    init();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (captureRef.current) clearInterval(captureRef.current);
      workerRef.current?.postMessage({ type: 'DESTROY' });
      workerRef.current?.terminate();
    };
  }, [initWorker]);

  useEffect(() => {
    if (modelReady) startCapture();
  }, [modelReady, startCapture]);

  const hasThreat = threats.length > 0;
  const borderColor = hasThreat ? '#FF4400' : '#00FF0040';

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {cameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Eye size={20} style={{ color: '#00FF0030' }} />
          <p className="text-xs" style={{ color: '#00FF0050', fontSize: '10px' }}>{cameraError}</p>
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
            <div
              className="absolute inset-0 border"
              style={{ borderColor }}
            />
            {/* Corner brackets */}
            {['top-1 left-1', 'top-1 right-1', 'bottom-1 left-1', 'bottom-1 right-1'].map((pos, i) => (
              <div key={i} className={`absolute ${pos} w-3 h-3`}
                style={{
                  borderTop: i < 2 ? `2px solid ${hasThreat ? '#FF4400' : '#00FF00'}` : 'none',
                  borderBottom: i >= 2 ? `2px solid ${hasThreat ? '#FF4400' : '#00FF00'}` : 'none',
                  borderLeft: i % 2 === 0 ? `2px solid ${hasThreat ? '#FF4400' : '#00FF00'}` : 'none',
                  borderRight: i % 2 === 1 ? `2px solid ${hasThreat ? '#FF4400' : '#00FF00'}` : 'none',
                }}
              />
            ))}

            {/* Status */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2">
              <span style={{ color: '#00FF00', fontSize: '8px', opacity: 0.7 }}>
                {!modelReady ? 'CARGANDO MODELO...' : `${detections.length} OBJ`}
              </span>
            </div>

            {/* Threat indicator */}
            {hasThreat && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="flex items-center gap-1 px-2 py-1 animate-pulse"
                  style={{ background: 'rgba(255,68,0,0.3)', border: '1px solid #FF4400' }}
                >
                  <AlertTriangle size={10} style={{ color: '#FF4400' }} />
                  <span style={{ color: '#FF4400', fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {threats[0].class.toUpperCase()} {(threats[0].score * 100).toFixed(0)}%
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
