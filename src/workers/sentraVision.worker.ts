/**
 * SentraVision Web Worker — TF.js COCO-SSD + MDAO (Módulo de Detección de Anomalías Adversarias)
 *
 * This worker is the sole thread where heavy ML inference runs (WebGPU → WebGL fallback).
 * It posts results back to the main thread; all HTTP dispatch is handled there by SentraMesh
 * + BatchDispatcher (this worker makes NO direct HTTP calls).
 *
 * MDAO analyses run on every frame after standard COCO-SSD detection:
 *
 *  A) Adversarial Garment — human-shaped bounding box classified as an incongruent
 *     non-human object (e.g. 'banana', 'kite') with high confidence.  This signature
 *     matches adversarial-pattern clothing designed to fool object detectors.
 *     → Posts 'ADVERSARIAL_GARMENT'
 *
 *  B) Face-Density / HyperFace — ≥3 'person' detections whose centres cluster within
 *     CLUSTER_RADIUS pixels.  Consistent with printed-face fabric that forces the
 *     classifier to fire many overlapping boxes in one small area.
 *     → Posts 'FACE_DENSITY'
 *
 *  C) IR Saturation — a sudden jump in full-white pixel fraction (>25 pp in one frame
 *     AND overall whiteness >35 %).  Matches a flash / IR floodlight used to blind the
 *     camera sensor while an adversary moves through the frame.
 *     → Posts 'IR_SABOTAGE'
 */

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let model: cocoSsd.ObjectDetection | null = null;
let lastFrameTime  = 0;
const MIN_FRAME_INTERVAL = 333; // 3 FPS cap

// Per-class cooldown so the same threat doesn't flood the main thread
const ALERT_COOLDOWN_MS = 10_000;
const lastAlertTime: Record<string, number> = {};

// MDAO cooldowns — anomalies are also rate-limited to avoid log spam
const MDAO_COOLDOWN_MS = 12_000;
const lastMdaoTime: Record<string, number> = {};

// GPS context forwarded from main thread for alert metadata
let lastKnownLocation: { latitude: number; longitude: number } | null = null;

// ── MDAO constants ────────────────────────────────────────────────────────────

// Classes that form valid human-context detections (NOT adversarial)
const HUMAN_CONTEXT_CLASSES = new Set([
  'person', 'bicycle', 'motorcycle', 'bus', 'backpack', 'handbag',
  'suitcase', 'umbrella', 'tie',
]);

// Incongruent non-human classes that, when detected in a human-shaped box,
// are strong indicators of adversarial pattern clothing
const ADVERSARIAL_INDICATOR_CLASSES = new Set([
  'banana', 'kite', 'frisbee', 'teddy bear', 'apple', 'orange',
  'sports ball', 'book', 'cup', 'bottle', 'vase', 'clock',
  'giraffe', 'zebra', 'cat', 'dog', 'bird', 'horse',
]);

// Minimum pixel-cluster radius for HyperFace detection
const CLUSTER_RADIUS = 80; // pixels

// IR saturation thresholds
const IR_WHITE_THRESHOLD = 0.35;  // 35 % of frame must be near-white
const IR_DELTA_MIN       = 0.25;  // sudden jump of ≥ 25 percentage points

let prevWhiteness = 0; // tracked across frames for IR delta calculation

// ── Detection types ───────────────────────────────────────────────────────────

interface DetectedObject {
  class:     string;
  score:     number;
  bbox:      [number, number, number, number]; // [x, y, width, height]
  timestamp: number;
}

// ── MDAO — A: Adversarial Garment ────────────────────────────────────────────

function checkAdversarialGarment(
  predictions: cocoSsd.DetectedObject[],
  imgW: number,
  imgH: number,
): cocoSsd.DetectedObject | null {
  for (const det of predictions) {
    if (HUMAN_CONTEXT_CLASSES.has(det.class)) continue;
    if (!ADVERSARIAL_INDICATOR_CLASSES.has(det.class)) continue;
    if (det.score < 0.65) continue;

    const [, , bw, bh] = det.bbox;
    const aspectRatio   = bh / bw;           // tall bbox → human silhouette
    const areaFraction  = (bw * bh) / (imgW * imgH);

    // Human silhouette: taller than wide, occupies ≥3 % of frame area
    if (aspectRatio > 1.4 && areaFraction > 0.03) {
      return det;
    }
  }
  return null;
}

// ── MDAO — B: Face Density / HyperFace ───────────────────────────────────────

function checkFaceDensity(predictions: cocoSsd.DetectedObject[]): number {
  const persons = predictions.filter(
    (d) => d.class === 'person' && d.score > 0.45,
  );
  if (persons.length < 3) return 0;

  // Compute bounding-box centres
  const centres = persons.map((p) => ({
    x: p.bbox[0] + p.bbox[2] / 2,
    y: p.bbox[1] + p.bbox[3] / 2,
  }));

  // For each detection check how many other centres are within CLUSTER_RADIUS
  for (let i = 0; i < centres.length; i++) {
    let nearby = 0;
    for (let j = 0; j < centres.length; j++) {
      if (i === j) continue;
      const dx = centres[i].x - centres[j].x;
      const dy = centres[i].y - centres[j].y;
      if (Math.hypot(dx, dy) < CLUSTER_RADIUS) nearby++;
    }
    // ≥3 persons clustered together (the pivot + 2 neighbours)
    if (nearby >= 2) return persons.length;
  }
  return 0;
}

// ── MDAO — C: IR Saturation ───────────────────────────────────────────────────

function checkIRSaturation(imageData: ImageData): boolean {
  const { data } = imageData;
  const totalPixels = data.length / 4;
  let whitePixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Near-white threshold: R, G, B all > 240
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
      whitePixels++;
    }
  }

  const whiteness = whitePixels / totalPixels;
  const delta     = whiteness - prevWhiteness;
  prevWhiteness   = whiteness;

  return whiteness > IR_WHITE_THRESHOLD && delta > IR_DELTA_MIN;
}

// ── MDAO cooldown helper ──────────────────────────────────────────────────────

function mdaoAllowed(key: string): boolean {
  const now  = Date.now();
  const last = lastMdaoTime[key] ?? 0;
  if (now - last < MDAO_COOLDOWN_MS) return false;
  lastMdaoTime[key] = now;
  return true;
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

// ── Frame detection + MDAO ────────────────────────────────────────────────────

async function detectObjects(imageBitmap: ImageBitmap): Promise<void> {
  if (!model) return;

  const now = performance.now();
  if (now - lastFrameTime < MIN_FRAME_INTERVAL) return;
  lastFrameTime = now;

  const timestamp = Date.now();

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx    = canvas.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, 0);

    // Get raw pixel data for MDAO-C (IR saturation) analysis
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Run TF tensor detection
    const tensor = tf.browser.fromPixels({
      data:   new Uint8Array(imageData.data.buffer),
      width:  canvas.width,
      height: canvas.height,
    });
    const predictions = await model.detect(tensor as tf.Tensor3D);
    tensor.dispose();

    // ── Standard threat detection ─────────────────────────────────────────
    const ALERT_CLASSES  = new Set(['person', 'knife', 'scissors']);
    const MIN_CONFIDENCE = 0.55;

    const threats = predictions.filter(
      (p) => ALERT_CLASSES.has(p.class) && p.score >= MIN_CONFIDENCE,
    );

    self.postMessage({ type: 'DETECTIONS', predictions, threats, timestamp });

    for (const t of threats) {
      const detected: DetectedObject = {
        class:     t.class,
        score:     t.score,
        bbox:      t.bbox as [number, number, number, number],
        timestamp,
      };
      const classLast = lastAlertTime[detected.class] ?? 0;
      if (timestamp - classLast >= ALERT_COOLDOWN_MS) {
        lastAlertTime[detected.class] = timestamp;
        // Post back to main thread — SentraMesh/BatchDispatcher handles HTTP
        self.postMessage({ type: 'THREAT_DETECTED', detected, location: lastKnownLocation });
      }
    }

    // ── MDAO — A: Adversarial Garment ─────────────────────────────────────
    const adversarial = checkAdversarialGarment(predictions, canvas.width, canvas.height);
    if (adversarial && mdaoAllowed('ADVERSARIAL_GARMENT')) {
      self.postMessage({
        type:       'ADVERSARIAL_GARMENT',
        label:      adversarial.class,
        confidence: adversarial.score,
        bbox:       adversarial.bbox,
        timestamp,
      });
    }

    // ── MDAO — B: Face Density / HyperFace ────────────────────────────────
    const clusterCount = checkFaceDensity(predictions);
    if (clusterCount > 0 && mdaoAllowed('FACE_DENSITY')) {
      self.postMessage({
        type:      'FACE_DENSITY',
        count:     clusterCount,
        timestamp,
      });
    }

    // ── MDAO — C: IR Saturation / Optical Sabotage ────────────────────────
    if (checkIRSaturation(imageData) && mdaoAllowed('IR_SABOTAGE')) {
      self.postMessage({
        type:       'IR_SABOTAGE',
        whiteness:  prevWhiteness,
        timestamp,
      });
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

    case 'UPDATE_LOCATION':
      if (payload?.latitude !== undefined && payload?.longitude !== undefined) {
        lastKnownLocation = { latitude: payload.latitude, longitude: payload.longitude };
      }
      break;

    case 'CAMERA_DENIED':
      self.postMessage({
        type:    'UI_ACTION_REQUEST',
        action:  'SHOW_CAMERA_MODAL',
        message: 'Permiso de cámara denegado. Habilitalo en ajustes del sitio.',
      });
      break;

    case 'DESTROY':
      model?.dispose();
      model = null;
      break;
  }
};
