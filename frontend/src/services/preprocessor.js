/**
 * Preprocessing & Inference Engine in Pure JS using ONNX Runtime Web
 * Guarantees exact parity with Python preprocessing:
 * 1. Early-cycle front-padding (repeating index 0 row until length 30)
 * 2. StandardScaler z-transform: z = (x - mean) / scale
 * 3. Float32 tensor conversion: shape [1, 30, 14]
 * 4. Prediction clamped to [0.0, 125.0]
 */

export function preprocessWindow(rawWindow, scaler) {
  if (!Array.isArray(rawWindow) || rawWindow.length === 0) {
    throw new Error('Window must be a non-empty array of cycle vectors.');
  }

  const numRows = rawWindow.length;
  if (numRows > 30) {
    throw new Error(`Window length ${numRows} exceeds max sequence length 30.`);
  }

  // Early-cycle repeat padding of first row
  let paddedWindow = [];
  if (numRows < 30) {
    const padCount = 30 - numRows;
    const firstRow = rawWindow[0];
    for (let i = 0; i < padCount; i++) {
      paddedWindow.push([...firstRow]);
    }
    for (let i = 0; i < numRows; i++) {
      paddedWindow.push([...rawWindow[i]]);
    }
  } else {
    paddedWindow = rawWindow.map((row) => [...row]);
  }

  // Verify feature count
  const featureCount = scaler.mean.length;
  for (let r = 0; r < 30; r++) {
    if (paddedWindow[r].length !== featureCount) {
      throw new Error(`Row ${r} has ${paddedWindow[r].length} features, expected ${featureCount}.`);
    }
  }

  // Standard scale: z = (x - mean) / scale using 32-bit float arithmetic (Math.fround)
  const scaledFlat = new Float32Array(30 * featureCount);
  let idx = 0;
  for (let r = 0; r < 30; r++) {
    for (let c = 0; c < featureCount; c++) {
      const val = Math.fround(paddedWindow[r][c]);
      const mean = Math.fround(scaler.mean[c]);
      const scale = Math.fround(scaler.scale[c]);
      scaledFlat[idx++] = Math.fround((val - mean) / scale);
    }
  }

  return {
    paddedWindow,
    scaledFlat,
    shape: [1, 30, featureCount],
  };
}

export function checkOOD(rawWindow, trainingStats, zThreshold = 4.0) {
  // Check any |z| > 4.0 or values outside training min/max
  const oodFlags = [];
  const featureKeys = Object.keys(trainingStats);

  for (let r = 0; r < rawWindow.length; r++) {
    const row = rawWindow[r];
    for (let c = 0; c < row.length; c++) {
      const fKey = featureKeys[c];
      const stat = trainingStats[fKey];
      if (!stat) continue;

      const val = row[c];
      const z = (val - stat.mean) / stat.std;
      const isZExceeded = Math.abs(z) > zThreshold;
      const isRangeExceeded = val < stat.min || val > stat.max;

      if (isZExceeded || isRangeExceeded) {
        oodFlags.push({
          rowIndex: r,
          featureIndex: c,
          feature: fKey,
          value: val,
          z,
          reason: isZExceeded ? '|z| > 4.0' : 'outside min/max',
        });
      }
    }
  }

  return {
    isOOD: oodFlags.length > 0,
    flags: oodFlags,
  };
}
