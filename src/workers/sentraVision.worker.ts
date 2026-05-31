// SentraVision Web Worker — TF.js COCO-SSD, 3 FPS cap, WebGPU preferred
// Handles camera NotAllowedError → sends UI_ACTION_REQUEST to HUD

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let model: cocoSsd.ObjectDetection | null = null;
let lastFrameTime = 0;
const MIN_FRAME_INTERVAL = 333; // 3 FPS

async function loadModel() {
  // Prefer WebGPU for lowest power draw, fall back to WebGL
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

async function detectObjects(imageBitmap: ImageBitmap) {
  if (!model) return;

  const now = performance.now();
  if (now - lastFrameTime < MIN_FRAME_INTERVAL) return;
  lastFrameTime = now;

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tensor = tf.browser.fromPixels({ data: imageData.data, width: canvas.width, height: canvas.height });
    const predictions = await model.detect(tensor as tf.Tensor3D);
    tensor.dispose();

    const threats = predictions.filter(
      (p) => (p.class === 'person' || p.class === 'knife' || p.class === 'scissors') && p.score > 0.55
    );

    self.postMessage({ type: 'DETECTIONS', predictions, threats, timestamp: Date.now() });
  } catch (e) {
    self.postMessage({ type: 'ERROR', error: String(e) });
  }
}

// Request camera stream inside the worker context
async function requestCamera() {
  try {
    // Workers can't call getUserMedia directly — notify main to open camera
    self.postMessage({ type: 'CAMERA_INIT_REQUEST' });
  } catch (e) {
    const err = e as DOMException;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      self.postMessage({
        type: 'UI_ACTION_REQUEST',
        action: 'SHOW_CAMERA_MODAL',
        message: 'La cámara fue bloqueada. Habilitá el permiso en la configuración del navegador.',
      });
    } else {
      self.postMessage({ type: 'ERROR', error: err.message });
    }
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      await loadModel();
      break;
    case 'DETECT':
      if (payload?.bitmap) await detectObjects(payload.bitmap);
      break;
    case 'CAMERA_DENIED':
      // Main thread forwarded a NotAllowedError — ask HUD to show modal
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
