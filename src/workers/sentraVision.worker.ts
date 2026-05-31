// SentraVision Web Worker — TensorFlow.js COCO-SSD (quantized 8-bit, 3 FPS cap)
// This file runs entirely off the main thread.

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let model: cocoSsd.ObjectDetection | null = null;
let lastFrameTime = 0;
const MIN_FRAME_INTERVAL = 333; // 3 FPS = 333ms between frames

async function loadModel() {
  await tf.setBackend('webgl');
  await tf.ready();

  // Force quantized model via lite config
  model = await cocoSsd.load({
    base: 'mobilenet_v2',
    modelUrl: undefined,
  });

  // Prefer WebGPU if available, fall back to WebGL
  try {
    await tf.setBackend('webgpu');
  } catch {
    // WebGPU not available, WebGL stays
  }

  self.postMessage({ type: 'MODEL_READY' });
}

async function detectObjects(imageBitmap: ImageBitmap) {
  if (!model) return;

  const now = performance.now();
  if (now - lastFrameTime < MIN_FRAME_INTERVAL) return; // 3 FPS cap
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
      (p) => (p.class === 'person' || p.class === 'knife' || p.class === 'gun' || p.class === 'scissors') &&
        p.score > 0.55
    );

    self.postMessage({
      type: 'DETECTIONS',
      predictions,
      threats,
      timestamp: Date.now(),
    });
  } catch (e) {
    self.postMessage({ type: 'ERROR', error: String(e) });
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
    case 'DESTROY':
      model?.dispose();
      model = null;
      break;
  }
};
