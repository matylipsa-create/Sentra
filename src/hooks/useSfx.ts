import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'sentra_sfx_enabled';

// Sonidos por evento: [freq, dur, type, gain]
type Tone = [number, number, OscillatorType, number];

const SOUND_MAP: Record<string, Tone[]> = {
  fall:      [[880, 0.09, 'square',   0.18], [440, 0.18, 'square',   0.16]],
  motion:    [[620, 0.10, 'triangle', 0.14], [780, 0.10, 'triangle', 0.14]],
  emergency: [[1046, 0.10, 'sawtooth', 0.20], [784, 0.10, 'sawtooth', 0.20], [1046, 0.14, 'sawtooth', 0.20]],
  observe:   [[420, 0.24, 'sine',      0.12]],
  assist:    [[520, 0.06, 'sine', 0.08], [780, 0.10, 'sine', 0.08]],
  vision:    [[740, 0.12, 'triangle', 0.16], [620, 0.10, 'triangle', 0.12]],
  audio:     [[300, 0.14, 'sawtooth', 0.18]],
  keyword:   [[988, 0.08, 'square', 0.20], [1318, 0.12, 'square', 0.20]],
  coercion:  [[110, 0.40, 'sawtooth', 0.22]],
  dispatch:  [[880, 0.06, 'sine', 0.10], [1108, 0.06, 'sine', 0.10], [1318, 0.10, 'sine', 0.10]],
};

export function useSfx() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) !== 'false'; } catch { return true; }
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureAudio = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch { ctxRef.current = null; }
    }
    if (ctxRef.current?.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playSequence = useCallback((seq: Tone[]) => {
    if (!enabled) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    let t = ctx.currentTime + 0.01;
    seq.forEach(([freq, dur, type, gain]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur + 0.03;
    });
  }, [enabled, ensureAudio]);

  const play = useCallback((event: string) => {
    const seq = SOUND_MAP[event];
    if (seq) playSequence(seq);
  }, [playSequence]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
      if (next) {
        const ctx = ensureAudio();
        if (ctx) playSequence(SOUND_MAP.assist);
      }
      return next;
    });
  }, [ensureAudio, playSequence]);

  useEffect(() => {
    return () => { ctxRef.current?.close(); ctxRef.current = null; };
  }, []);

  return { enabled, toggle, play, ensureAudio };
}
