import { preprocessWindow } from './preprocessor';

/**
 * Computes Model-Attributed Impact per Spec (Page 2):
 * "window X (30x14, z-space). For component C with sensors S_C,
 * build X' by replacing the S_C columns with each sensor's healthy baseline
 * (mean z of that engine's first 30 cycles). impact_C = RUL(X') - RUL(X).
 * Positive = 'predicted RUL would be higher if these sensors were healthy'.
 * Also compute an all-sensors-healthy reference. It is a counterfactual attribution,
 * not a component failure prediction; sensors shared across components overlap; flag when X' is OOD."
 */

export async function computeComponentAttribution({
  rawWindow,
  scaler,
  components,
  sensorIds,
  healthyBaselineRaw,
  inferenceFn,
}) {
  // 1. Predict baseline RUL(X)
  const baseResult = await inferenceFn(rawWindow);
  const baseRul = baseResult.rul;

  // 2. Preprocess current window to get padded 30-cycle raw window
  const { paddedWindow } = preprocessWindow(rawWindow, scaler);

  // 3. Convert healthy baseline raw values to scaled values or use raw replacement
  // We compute healthy baseline replacement in raw domain, then scale with preprocessWindow
  const attributions = [];

  for (const comp of components) {
    if (!comp.sensors || comp.sensors.length === 0) {
      attributions.push({
        componentId: comp.id,
        name: comp.name,
        deltaRul: 0.0,
        rulHealthy: baseRul,
        isOOD: false,
        sensorCount: 0,
      });
      continue;
    }

    // Identify column indices of comp.sensors
    const sensorIndices = comp.sensors
      .map((sId) => sensorIds.indexOf(sId))
      .filter((idx) => idx !== -1);

    // Build X' raw window with S_C columns replaced by healthyBaselineRaw
    const perturbedRawWindow = paddedWindow.map((row) => {
      const newRow = [...row];
      for (const colIdx of sensorIndices) {
        newRow[colIdx] = healthyBaselineRaw[colIdx];
      }
      return newRow;
    });

    // Run inference on X'
    const perturbedResult = await inferenceFn(perturbedRawWindow);
    const perturbedRul = perturbedResult.rul;

    // impact_C = RUL(X') - RUL(X)
    const deltaRul = Number((perturbedRul - baseRul).toFixed(2));

    attributions.push({
      componentId: comp.id,
      name: comp.name,
      deltaRul,
      rulHealthy: perturbedRul,
      sensorCount: sensorIndices.length,
      modeledFault: comp.modeled_fault,
    });
  }

  // All-sensors-healthy reference
  const allHealthyRawWindow = paddedWindow.map(() => [...healthyBaselineRaw]);
  const allHealthyResult = await inferenceFn(allHealthyRawWindow);
  const allHealthyDelta = Number((allHealthyResult.rul - baseRul).toFixed(2));

  // Sort components by attributed impact descending
  const sorted = [...attributions].sort((a, b) => b.deltaRul - a.deltaRul);
  sorted.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return {
    baseRul,
    allHealthyDelta,
    allHealthyRul: allHealthyResult.rul,
    attributions: sorted,
  };
}
