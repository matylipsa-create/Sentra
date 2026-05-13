import { useCallback, useRef } from 'react';

interface SpeechOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

export function useSpeech() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string, options: SpeechOptions = {}) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 0.85;
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;
    utterance.lang = options.lang ?? 'es-MX';

    // Prefer a Spanish voice if available
    const voices = window.speechSynthesis.getVoices();
    const spanish = voices.find(
      (v) => v.lang.startsWith('es') && (v.localService || v.name.toLowerCase().includes('es'))
    );
    if (spanish) utterance.voice = spanish;

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const isSpeaking = useCallback(() => {
    return 'speechSynthesis' in window && window.speechSynthesis.speaking;
  }, []);

  return { speak, stop, isSpeaking };
}
