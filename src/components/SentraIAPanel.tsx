import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface Props {
  onCoercion: (transcript: string, isSilentTrigger: boolean) => void;
}

export default function SentraIAPanel({ onCoercion }: Props) {
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const workerRef = useRef<Worker | null>(null);

  const initWorker = useCallback(() => {
    workerRef.current = new Worker(
      new URL('../workers/sentraIA.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e) => {
      const { type, transcript, isSilentTrigger } = e.data;
      if (type === 'COERCION_DETECTED' || type === 'SILENT_TRIGGER') {
        onCoercion(transcript, isSilentTrigger ?? type === 'SILENT_TRIGGER');
      }
    };
  }, [onCoercion]);

  const startListening = useCallback(() => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec = new SpeechRec();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      const transcript = e.results[e.results.length - 1][0].transcript;
      setLastTranscript(transcript);
      workerRef.current?.postMessage({ type: 'ANALYZE_TRANSCRIPT', transcript });
    };

    rec.onerror = () => setListening(false);
    rec.onend = () => {
      // Auto-restart for continuous monitoring
      if (listening) rec.start();
    };

    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }, [listening]);

  useEffect(() => {
    initWorker();
    startListening();

    return () => {
      recognitionRef.current?.stop();
      workerRef.current?.terminate();
    };
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t" style={{ borderColor: '#00FF0020' }}>
      {listening
        ? <Mic size={10} style={{ color: '#00FF00' }} className="animate-pulse" />
        : <MicOff size={10} style={{ color: '#FF440050' }} />}
      <span style={{ color: '#00FF0060', fontSize: '9px', fontFamily: 'monospace' }} className="truncate">
        {lastTranscript || (listening ? 'Escuchando...' : 'IA inactiva')}
      </span>
    </div>
  );
}
