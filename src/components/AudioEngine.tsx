import { useEffect, useRef } from 'react';
import { mesh } from '../lib/SentraMesh';
import type { GeoState } from '../hooks/useSentraCore';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  geo:     GeoState;
  onAlert: (log: AudioAlertLog) => void;
}

export interface AudioAlertLog {
  timestamp: string;
  alerta:    string;
  ubicacion: {
    latitude:  number | null;
    longitude: number | null;
    address:   string;
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

const KEYWORDS = ['ayuda', 'peligro', 'auxilio', 'emergencia'];

// Pipedream endpoint — swap for production URL
const AUDIO_ALERT_ENDPOINT = 'https://eo4xot0qo22mfqm.m.pipedream.net/audio_alert';

// Ambient noise thresholds
const GLASS_RMS_MIN      = 0.35;   // minimum loudness for glass/impact
const GLASS_HF_RATIO_MIN = 0.45;   // high-freq (>4kHz) energy fraction
const BOOM_RMS_MIN       = 0.55;   // minimum loudness for explosion
const BOOM_LF_RATIO_MIN  = 0.50;   // low-freq (<200Hz) energy fraction

// Analysis interval — 500ms keeps CPU/battery impact minimal
const ANALYSIS_INTERVAL_MS = 500;

// ── Audio analysis helpers ─────────────────────────────────────────────────

function calcRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

// Fraction of total FFT energy in a frequency band
function bandEnergyFraction(
  fftData:     Uint8Array,
  sampleRate:  number,
  fftSize:     number,
  lowHz:       number,
  highHz:      number,
): number {
  const binHz    = sampleRate / fftSize;
  const binLow   = Math.floor(lowHz  / binHz);
  const binHigh  = Math.min(Math.ceil(highHz / binHz), fftData.length - 1);

  let bandEnergy  = 0;
  let totalEnergy = 0;

  for (let i = 0; i < fftData.length; i++) {
    const v = fftData[i];
    totalEnergy += v;
    if (i >= binLow && i <= binHigh) bandEnergy += v;
  }

  return totalEnergy > 0 ? bandEnergy / totalEnergy : 0;
}

// ── Dispatch to Pipedream (fire-and-forget) ────────────────────────────────

function dispatchAudioAlert(log: AudioAlertLog): void {
  fetch(AUDIO_ALERT_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sentra-Source': 'AudioEngine-v1' },
    body:    JSON.stringify(log),
    signal:  AbortSignal.timeout(5000),
  }).catch(() => {
    // Queue for later via mesh fallback
    mesh.emit('FALLBACK_QUEUED', { type: 'AUDIO_ALERT', log });
  });
}

// ── Component (renders nothing — pure side-effect engine) ─────────────────

export default function AudioEngine({ geo, onAlert }: Props) {
  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef      = useRef<SpeechRecognition | null>(null);
  const mountedRef  = useRef(true);

  // Cooldown per alert type to avoid spam
  const cooldownRef = useRef<Record<string, number>>({});
  const COOLDOWN_MS = 8_000;

  const geoRef = useRef(geo);
  geoRef.current = geo;

  // ── Emit an alert ──────────────────────────────────────────────────────

  const emitAlert = (alerta: string) => {
    const now   = Date.now();
    const last  = cooldownRef.current[alerta] ?? 0;
    if (now - last < COOLDOWN_MS) return;
    cooldownRef.current[alerta] = now;

    const log: AudioAlertLog = {
      timestamp: new Date().toISOString(),
      alerta,
      ubicacion: {
        latitude:  geoRef.current.latitude,
        longitude: geoRef.current.longitude,
        address:   geoRef.current.address,
      },
    };

    onAlert(log);
    mesh.emit('AUDIO_ALERT', log);
    dispatchAudioAlert(log);
  };

  // ── Ambient noise analysis ─────────────────────────────────────────────

  const startAmbient = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 },
      });
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      streamRef.current = stream;
      const ctx      = new AudioContext();
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize         = 2048;
      analyser.smoothingTimeConstant = 0.3; // fast response to transients
      analyserRef.current = analyser;

      ctx.createMediaStreamSource(stream).connect(analyser);

      const timeData = new Float32Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      timerRef.current = setInterval(() => {
        // Pause when tab is hidden — battery efficiency
        if (document.hidden) return;

        analyser.getFloatTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        const rms        = calcRMS(timeData);
        const sampleRate = ctx.sampleRate;

        // Glass breaking: high amplitude + dominant high-frequency energy
        const hfRatio = bandEnergyFraction(freqData, sampleRate, analyser.fftSize, 4000, 20000);
        if (rms > GLASS_RMS_MIN && hfRatio > GLASS_HF_RATIO_MIN) {
          emitAlert('CRISTALES ROTOS');
          return;
        }

        // Explosion / estruendo: high amplitude + dominant low-frequency energy
        const lfRatio = bandEnergyFraction(freqData, sampleRate, analyser.fftSize, 20, 200);
        if (rms > BOOM_RMS_MIN && lfRatio > BOOM_LF_RATIO_MIN) {
          emitAlert('ESTRUENDO');
        }
      }, ANALYSIS_INTERVAL_MS);

    } catch { /* Mic denied — ambient analysis unavailable */ }
  };

  // ── Keyword speech recognition ─────────────────────────────────────────

  const startSpeech = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec: SpeechRecognition = new SpeechRec();
    rec.lang             = 'es-AR';
    rec.continuous       = true;
    rec.interimResults   = true;
    rec.maxAlternatives  = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript.toLowerCase())
        .join(' ');

      for (const kw of KEYWORDS) {
        if (transcript.includes(kw)) {
          emitAlert(`PALABRA CLAVE: ${kw.toUpperCase()}`);
          break; // only one alert per recognition result
        }
      }
    };

    // Auto-restart — SpeechRecognition stops after silence
    rec.onend = () => {
      if (mountedRef.current) rec.start();
    };

    rec.onerror = (e) => {
      // 'no-speech' is benign; other errors log and retry after 2s
      if (e.error !== 'no-speech' && mountedRef.current) {
        setTimeout(() => { if (mountedRef.current) rec.start(); }, 2000);
      }
    };

    try { rec.start(); } catch { /* already started */ }
    recRef.current = rec;
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    startAmbient();
    startSpeech();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // no UI — events flow through mesh + onAlert callback
}
