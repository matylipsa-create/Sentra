// SentraIA Web Worker — SpeechRecognition (es-AR) + coercion filter
// Runs entirely off the main thread via SharedWorker pattern.

// Coercion / distress keyword bank (Spanish — Argentine dialect)
const COERCION_KEYWORDS = [
  'ayuda', 'auxilio', 'socorro', 'peligro', 'amenaza',
  'arma', 'cuchillo', 'pistola', 'disparo', 'bala',
  'secuestro', 'rehén', 'robo', 'asalto', 'golpe',
  'código rojo', 'emergencia', 'me están', 'no puedo',
  'tengo miedo', 'están aquí', 'nos están',
];

// Neutral-seeming phrases that actually signal distress (safeword protocol)
const SILENT_TRIGGERS = [
  'el clima está muy lindo', 'todo bien por acá', 'mañana llueve',
  'sentra código rojo', 'código verde sentra',
];

function detectCoercion(transcript: string): { isCoercion: boolean; isSilentTrigger: boolean; matched: string[] } {
  const lower = transcript.toLowerCase();
  const matched: string[] = [];

  for (const kw of COERCION_KEYWORDS) {
    if (lower.includes(kw)) matched.push(kw);
  }

  const isSilentTrigger = SILENT_TRIGGERS.some((t) => lower.includes(t));

  return {
    isCoercion: matched.length >= 2 || isSilentTrigger,
    isSilentTrigger,
    matched,
  };
}

// SpeechRecognition is a main-thread API, but we simulate the worker bridge
// by posting back results. The actual recognition must be proxied from main.
// This worker handles the NLP/coercion analysis.

self.onmessage = (e: MessageEvent<{ type: string; transcript?: string }>) => {
  const { type, transcript } = e.data;

  if (type === 'ANALYZE_TRANSCRIPT' && transcript) {
    const result = detectCoercion(transcript);

    if (result.isSilentTrigger) {
      self.postMessage({
        type: 'SILENT_TRIGGER',
        transcript,
        timestamp: Date.now(),
      });
    } else if (result.isCoercion) {
      self.postMessage({
        type: 'COERCION_DETECTED',
        transcript,
        matched: result.matched,
        timestamp: Date.now(),
      });
    } else {
      self.postMessage({
        type: 'TRANSCRIPT',
        transcript,
        timestamp: Date.now(),
      });
    }
  }
};
