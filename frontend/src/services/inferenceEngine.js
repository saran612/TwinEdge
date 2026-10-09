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

async function fallbackBackendInference(rawWindow) {
  const t0 = performance.now();
  // Ensure window has 30 rows
  let paddedWindow = [...rawWindow];
  if (paddedWindow.length < 30) {
    const padCount = 30 - paddedWindow.length;
    const firstRow = paddedWindow[0] || Array(14).fill(0);
    const pads = Array.from({ length: padCount }, () => [...firstRow]);
    paddedWindow = [...pads, ...paddedWindow];
  } else if (paddedWindow.length > 30) {
    paddedWindow = paddedWindow.slice(paddedWindow.length - 30);
  }

  const res = await fetch('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engine_id: 1,
      cycle: paddedWindow.length,
      window: paddedWindow,
    }),
  });
  if (!res.ok) throw new Error(`Backend /predict error: ${res.status}`);
  const data = await res.json();
  const t1 = performance.now();
  const rulVal = data.rul_prediction ?? data.rul ?? 125.0;
  return {
    rawRul: rulVal,
    rul: Math.max(0.0, Math.min(125.0, rulVal)),
    latencyMs: t1 - t0,
    timestamp: new Date().toISOString(),
    site: 'CLOUD',
  };
}

export async function runLocalInference(rawWindow) {
  // Serialize ONNX WASM inferences to prevent Session mismatch on re-entrant calls
  return new Promise((resolve, reject) => {
    inferenceQueue = inferenceQueue
      .then(async () => {
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
            site: 'EDGE',
          });
        } catch (wasmErr) {
          // Fall back seamlessly to local backend inference
          try {
            const fallbackRes = await fallbackBackendInference(rawWindow);
            resolve(fallbackRes);
          } catch (backendErr) {
            reject(backendErr);
          }
        }
      })
      .catch((err) => {
        reject(err);
      });
  });
}
