import { Mic, MicOff } from 'lucide-react';

/**
 * SentraIAPanel — HUD del bridge de voz.
 *
 * Fase 2 (auditoría 2026-01): este componente ya NO instancia
 * SpeechRecognition ni Web Worker. Toda esa lógica vive en el hook
 * `useSpeechBridge` (main thread) + `sentraIA.worker` (matching).
 *
 * Aquí solo se pinta el transcript actual y el LED de escucha. Los datos
 * vienen del padre (SentraHUD) que ya suscribió el bridge global.
 */

interface Props {
  listening:      boolean;
  lastTranscript: string;
}

export default function SentraIAPanel({ listening, lastTranscript }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t" style={{ borderColor: '#00FF0020' }}>
      {listening
        ? <Mic size={10} style={{ color: '#00FF00' }} className="animate-pulse" />
        : <MicOff size={10} style={{ color: '#FF440050' }} />}
      <span
        style={{ color: '#00FF0060', fontSize: '9px', fontFamily: 'monospace' }}
        className="truncate"
      >
        {lastTranscript || (listening ? 'Escuchando...' : 'IA inactiva')}
      </span>
    </div>
  );
}
