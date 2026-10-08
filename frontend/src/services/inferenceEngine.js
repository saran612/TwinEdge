import * as ort from 'onnxruntime-web';
import { preprocessWindow } from './preprocessor';

// Configure ORT WASM paths to load from local public directory (no CDN)
ort.env.wasm.wasmPaths = '/wasm/';

let sessionPromise = null;
let cachedScaler = null;

export async function getInferenceEngine() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      // Load scaler
      const scalerRes = await fetch('/offline/scaler.json');
      cachedScaler = await scalerRes.json();

      // Create ORT Session
      const session = await ort.InferenceSession.create('/offline/model.onnx', {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      return { session, scaler: cachedScaler };
    })();
  }
  return sessionPromise;
}

let inferenceQueue = Promise.resolve();

export async function runLocalInference(rawWindow) {
  // Serialize ONNX WASM inferences to prevent Session mismatch on re-entrant calls
  return new Promise((resolve, reject) => {
    inferenceQueue = inferenceQueue.then(async () => {
      try {
        const t0 = performance.now();
        const { session, scaler } = await getInferenceEngine();

        const { scaledFlat, shape } = preprocessWindow(rawWindow, scaler);
        const inputTensor = new ort.Tensor('float32', scaledFlat, shape);

        const feeds = {};
        const inputName = session.inputNames[0];
        feeds[inputName] = inputTensor;

        const results = await session.run(feeds);
        const outputName = session.outputNames[0];
        const outputTensor = results[outputName];
        const t1 = performance.now();

        const rawRul = outputTensor.data[0];
        const cappedRul = Math.max(0.0, Math.min(125.0, rawRul));

        resolve({
          rawRul,
          rul: cappedRul,
          latencyMs: t1 - t0,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        reject(err);
      }
    }).catch((err) => {
      reject(err);
    });
  });
}
