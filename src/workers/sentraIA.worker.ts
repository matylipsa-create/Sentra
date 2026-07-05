// SentraIA Web Worker — Speech analysis off the main thread.
//
// Fase 2 (auditoría 2026-01) — el worker es AHORA el único responsable de:
//   • Matching de KEYWORDS de audio (ayuda, peligro, auxilio, emergencia)
//   • Matching de COERCION_KEYWORDS (banco extendido de distress)
//   • Matching de SILENT_TRIGGERS (safeword protocol)
//
// La instancia de webkitSpeechRecognition sigue viviendo en el main thread
// (limitación de plataforma: Web Speech API no está disponible en Workers).
// El main thread solo hace forward de `transcript` por postMessage.
//
// Salida del worker (postMessage):
//   { type: 'KEYWORD_DETECTED',  keyword, transcript, timestamp }
//   { type: 'COERCION_DETECTED', matched, transcript, timestamp }
//   { type: 'SILENT_TRIGGER',    transcript, timestamp }
//   { type: 'TRANSCRIPT',        transcript, timestamp }
//
// Cooldown por keyword (8 s) — mismo comportamiento que tenía el AudioEngine.

// ── Banco de palabras (main thread ya no las conoce) ─────────────────────────

// Palabras clave "core" (heredadas del legacy AudioEngine.KEYWORDS)
const KEYWORDS = ['ayuda', 'peligro', 'auxilio', 'emergencia'];

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

// Cooldown por keyword para no inundar el mesh con el mismo grito repetido
const KEYWORD_COOLDOWN_MS = 8_000;
const keywordCooldown = new Map<string, number>();

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

// Devuelve la primera KEYWORD encontrada que no esté en cooldown.
function detectKeyword(transcript: string): string | null {
  const lower = transcript.toLowerCase();
  const now = Date.now();
  for (const kw of KEYWORDS) {
    if (!lower.includes(kw)) continue;
    const last = keywordCooldown.get(kw) ?? 0;
    if (now - last < KEYWORD_COOLDOWN_MS) return null;
    keywordCooldown.set(kw, now);
    return kw;
  }
  return null;
}

self.onmessage = (e: MessageEvent<{ type: string; transcript?: string }>) => {
  const { type, transcript } = e.data;

  if (type !== 'ANALYZE_TRANSCRIPT' || !transcript) return;

  // 1) KEYWORDS de emergencia (audio-alert path)
  const keyword = detectKeyword(transcript);
  if (keyword) {
    self.postMessage({
      type: 'KEYWORD_DETECTED',
      keyword,
      transcript,
      timestamp: Date.now(),
    });
  }

  // 2) Coerción / silent trigger (mantiene el path SPEECH_COERCION)
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
  } else if (!keyword) {
    // Solo notificar transcript "limpio" cuando no hubo ningún match para
    // que la UI pueda actualizar el "último transcript" sin ruido.
    self.postMessage({
      type: 'TRANSCRIPT',
      transcript,
      timestamp: Date.now(),
    });
  }
};
