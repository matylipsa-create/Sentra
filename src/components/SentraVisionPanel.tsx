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

export default function SentraVisionPanel({ onThreat, onCameraBlocked, location }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const captureRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sourceMode, setSourceMode] = useState<'LOCAL' | 'REMOTE'>(() => 
    (localStorage.getItem('sentra_mode') as 'LOCAL' | 'REMOTE') || 'LOCAL'
  );
  
  const [modelReady, setModelReady] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [threats, setThreats] = useState<Detection[]>([]);
  const [cameraError, setCameraError] = useState('');
  const [lastAlertSent, setLastAlertSent] = useState<string | null>(null);

  // Inicialización de stream táctica
  const initStream = useCallback(async () => {
    if (captureRef.current) clearInterval(captureRef.current);
    
    try {
      if (sourceMode === 'LOCAL') {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.src = "";
        }
      } else {
        // AQUÍ PONÉS LA URL DE LA CÁMARA DE TU DOMICILIO
        const remoteUrl = localStorage.getItem('sentra_remote_url') || 'http://192.168.1.50:8080/video';
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = remoteUrl;
        }
      }
      await videoRef.current?.play();
      setCameraError('');
    } catch (e) {
      setCameraError('Error de conexión');
    }
  }, [sourceMode]);

  // Manejo de cambio de modo
  const toggleMode = () => {
    const newMode = sourceMode === 'LOCAL' ? 'REMOTE' : 'LOCAL';
    setSourceMode(newMode);
    localStorage.setItem('sentra_mode', newMode);
  };

  useEffect(() => {
    initStream();
    // (Resto de la lógica de initWorker sigue igual)
  }, [initStream]);

  // Renderizado del HUD Táctico
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Botones de control rápido */}
      <div className="absolute top-2 left-2 z-50 flex gap-1">
        <button 
          onClick={toggleMode}
          className={p-1.5 border transition-all ${sourceMode === 'LOCAL' ? 'bg-green-900/40 border-green-500' : 'bg-black/60 border-green-900'}}
        >
          <Camera size={12} className={sourceMode === 'LOCAL' ? 'text-green-400' : 'text-gray-500'} />
        </button>
        <button 
          onClick={toggleMode}
          className={p-1.5 border transition-all ${sourceMode === 'REMOTE' ? 'bg-cyan-900/40 border-cyan-500' : 'bg-black/60 border-cyan-900'}}
        >
          <Home size={12} className={sourceMode === 'REMOTE' ? 'text-cyan-400' : 'text-gray-500'} />
        </button>
      </div>

      <video ref={videoRef} muted playsInline className="w-full h-full object-cover opacity-80" />
      {/* (Mantén aquí el resto del Canvas y lógica de Detección original) */}
    </div>
  );
}