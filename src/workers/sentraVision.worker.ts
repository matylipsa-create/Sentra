// SentraVision Web Worker — TF.js COCO-SSD, 3 FPS cap, WebGPU preferred
// Includes sendAlert() with 10-second cooldown to prevent Telegram spam.

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { PIPEDREAM_ENDPOINT, TELEGRAM_CHANNEL_ID } from '../config';

let model: cocoSsd.ObjectDetection | null = null;
let lastFrameTime = 0;
const MIN_FRAME_INTERVAL = 333; // 3 FPS cap

// ── Alert state ──────────────────────────────────────────────────────────────
const ALERT_COOLDOWN_MS = 10_000; // 10-second anti-spam window
const lastAlertTime: Record<string, number> = {}; // per-class cooldown tracking

interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number];
  timestamp: number;
}

// lastKnownLocation is set via 'UPDATE_LOCATION' messages from the main thread
let lastKnownLocation: { latitude: number; longitude: number } | null = null;

// ── sendAlert ─────────────────────────────────────────────────────────────────
async function sendAlert(detected: DetectedObject): Promise<void> {
  const now = Date.now();
  const lastSent = lastAlertTime[detected.class] ?? 0;

  // Cooldown gate — one alert per class per 10 seconds
  if (now - lastSent < ALERT_COOLDOWN_MS) return;
  lastAlertTime[detected.class] = now;

  const payload = {
    type: 'SECURITY_ALERT',
    object: detected,
    location: lastKnownLocation,
    timestamp: now,
    // Telegram routing metadata forwarded to Pipedream step
    telegram_channel_id: TELEGRAM_CHANNEL_ID,
    message: `🚨 SENTRA ALERTA: ${detected.class.toUpperCase()} detectado (${(detected.score * 100).toFixed(0)}% confianza)${lastKnownLocation ? ` — ${lastKnownLocation.latitude.toFixed(5)}, ${lastKnownLocation.longitude.toFixed(5)}` : ''}`,
  };

  try {
    await fetch(PIPEDREAM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SENTRA-Version': '3.0',
        'X-Alert-Class': detected.class,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    self.postMessage({ type: 'ALERT_SENT', detected, timestamp: now });
  } catch {
    // Notify main thread so SentraMesh can queue it in IndexedDB
    self.postMessage({ type: 'ALERT_FAILED', detected, timestamp: now });
  }
}

// ── Model init ────────────────────────────────────────────────────────────────
async function loadModel() {
  try {
    await tf.setBackend('webgpu');
    await tf.ready();
  } catch {
    await tf.setBackend('webgl');
    await tf.ready();
  }

  model = await cocoSsd.load({ base: 'mobilenet_v2' });
  self.postMessage({ type: 'MODEL_READY' });
}

// ── Frame detection ───────────────────────────────────────────────────────────
async function detectObjects(imageBitmap: ImageBitmap): Promise<void> {
  if (!model) return;

  const now = performance.now();
  if (now - lastFrameTime < MIN_FRAME_INTERVAL) return;
  lastFrameTime = now;

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tensor = tf.browser.fromPixels({
      data: imageData.data,
      width: canvas.width,
      height: canvas.height,
    });

    const predictions = await model.detect(tensor as tf.Tensor3D);
    tensor.dispose();

    const timestamp = Date.now();

    // Threat classes that trigger Pipedream alert
    const ALERT_CLASSES = new Set(['person', 'knife', 'scissors']);
    const MIN_CONFIDENCE = 0.55;

    const threats = predictions.filter(
      (p) => ALERT_CLASSES.has(p.class) && p.score >= MIN_CONFIDENCE
    );

    // Post all detections back for HUD overlay
    self.postMessage({ type: 'DETECTIONS', predictions, threats, timestamp });

    // Fire sendAlert for each unique threat class (cooldown handles dedup)
    for (const t of threats) {
      const detected: DetectedObject = {
        class: t.class,
        score: t.score,
        bbox: t.bbox as [number, number, number, number],
        timestamp,
      };
      await sendAlert(detected);
    }
  } catch (e) {
    self.postMessage({ type: 'ERROR', error: String(e) });
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      await loadModel();
      break;

    case 'DETECT':
      if (payload?.bitmap) await detectObjects(payload.bitmap);
      break;

    // Main thread forwards GPS updates so alerts include location
    case 'UPDATE_LOCATION':
      if (payload?.latitude !== undefined && payload?.longitude !== undefined) {
        lastKnownLocation = { latitude: payload.latitude, longitude: payload.longitude };
      }
      break;

    case 'CAMERA_DENIED':
      self.postMessage({
        type: 'UI_ACTION_REQUEST',
        action: 'SHOW_CAMERA_MODAL',
        message: 'Permiso de cámara denegado. Habilitalo en ajustes del sitio.',
      });
      break;

    case 'DESTROY':
      model?.dispose();
      model = null;
      break;
  }
};
