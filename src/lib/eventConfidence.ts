import type { MeshEventType } from './SentraMesh';

const REPEAT_WINDOW_MS = 5_000;

interface TrackEntry {
  count: number;
  firstSeen: number;
  lastSeen: number;
}

const recent = new Map<string, TrackEntry>();

function eventKey(type: MeshEventType, payload: unknown): string {
  if (type === 'VISION_ALERT' || type === 'ADVERSARIAL_GARMENT') {
    const p = payload as { label?: string; anomalyType?: string };
    return `${type}:${p.label ?? p.anomalyType ?? ''}`;
  }
  if (type === 'AUDIO_ALERT') {
    const p = payload as { alerta?: string };
    return `${type}:${p.alerta ?? ''}`;
  }
  if (type === 'KEYWORD_DETECTED') {
    const p = payload as { keyword?: string };
    return `${type}:${p.keyword ?? ''}`;
  }
  return type;
}

export function computeConfidence(type: MeshEventType, payload: unknown): number {
  const key = (payload as { confidence?: number })?.confidence;
  if (typeof key === 'number') return key;

  const k = eventKey(type, payload);
  const now = Date.now();
  const entry = recent.get(k);

  if (!entry || now - entry.lastSeen > REPEAT_WINDOW_MS) {
    recent.set(k, { count: 1, firstSeen: now, lastSeen: now });
    return 0.5;
  }

  entry.count += 1;
  entry.lastSeen = now;
  return 0.9;
}

export function isHighConfidence(confidence: number): boolean {
  return confidence >= 0.7;
}

export function resetConfidenceTracker(): void {
  recent.clear();
}
