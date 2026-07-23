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
//
// Fase 2 (auditoría 2026-01):
//   - Eliminada TODA la lógica de SpeechRecognition (movida a `useSpeechBridge`
//     + `sentraIA.worker`). AudioEngine ahora es UNICAMENTE análisis FFT del
//     entorno acústico (cristales rotos, estruendos).
//   - Las palabras clave (`ayuda`, `peligro`, etc.) ya no viven en el main
//     thread — el worker las detecta y emite `KEYWORD_DETECTED` al mesh.

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

// ── Component (renders nothing — pure side-effect engine) ─────────────────

export default function AudioEngine({ geo, onAlert }: Props) {
  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    startAmbient();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // no UI — events flow through mesh + onAlert callback
}
