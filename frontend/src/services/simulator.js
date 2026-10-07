import { SENSORS_14 } from '../config/rubrics';

/**
 * Perturbation Presets per Spec (Page 6):
 * Nominal replay | Accelerated degradation | Sensor bias fault | Sensor freeze |
 * Sensor dropout (hold last) | Noise burst | Late onset | Step fault
 */
export const PERTURBATION_PRESETS = [
  { id: 'nominal', name: 'Nominal Replay', desc: 'No synthetic perturbations (unmodified replay)' },
  { id: 'accelerated', name: 'Accelerated Degradation', desc: '2x degradation rate multiplier' },
  { id: 'bias_hpc', name: 'Sensor Bias Fault (HPC T30/P30)', desc: '+2.5 sigma bias on s_3 and s_7' },
  { id: 'freeze_fan', name: 'Sensor Freeze (Fan Nf)', desc: 'Sensor s_8 freezes at cycle 20' },
  { id: 'dropout', name: 'Sensor Dropout (Hold Last)', desc: 'Sensor s_11 drops out and holds last reading' },
  { id: 'noise_burst', name: 'Noise Burst', desc: 'High variance noise burst across core sensors' },
  { id: 'late_onset', name: 'Late Onset Degradation', desc: 'Accelerated degradation starting after cycle 50' },
  { id: 'step_fault', name: 'Step Fault', desc: 'Sudden -3 sigma step drop at cycle 30' },
];

export function createDefaultPerturbationMatrix() {
  return SENSORS_14.map((s) => ({
    sensorId: s.id,
    name: s.name,
    unit: s.unit,
    active: false,
    biasSigma: 0.0,
    driftSigmaPerCycle: 0.0,
    noiseSigma: 0.0,
    onsetCycle: 1,
    freeze: false,
    dropout: false,
  }));
}

/**
 * Apply perturbations to a raw sensor cycle vector.
 * Note: Matrix units are in z-score sigma; we scale back to raw units using training stats.
 */
export function applyPerturbations({
  rawCycleSensors,
  cycleNumber,
  matrix,
  trainingStats,
  degradationMultiplier = 1.0,
  healthyBaseline = null,
  frozenValues = {},
}) {
  const modified = [...rawCycleSensors];
  const oodIndicators = [];

  matrix.forEach((pRow, idx) => {
    const stat = trainingStats[pRow.sensorId] || { mean: 0, std: 1, min: -999, max: 999 };
    let val = modified[idx];

    // Degradation rate multiplier applied to deviation from healthy baseline
    if (degradationMultiplier !== 1.0 && healthyBaseline) {
      const baseVal = healthyBaseline[idx];
      const delta = val - baseVal;
      val = baseVal + delta * degradationMultiplier;
    }

    if (pRow.active && cycleNumber >= pRow.onsetCycle) {
      const cyclesActive = cycleNumber - pRow.onsetCycle;

      if (pRow.freeze) {
        if (frozenValues[pRow.sensorId] === undefined) {
          frozenValues[pRow.sensorId] = val;
        }
        val = frozenValues[pRow.sensorId];
      } else if (pRow.dropout) {
        if (frozenValues[pRow.sensorId] === undefined) {
          frozenValues[pRow.sensorId] = val;
        }
        val = frozenValues[pRow.sensorId];
      } else {
        // Bias (sigma * std)
        if (pRow.biasSigma !== 0) {
          val += pRow.biasSigma * stat.std;
        }
        // Drift (driftPerCycle * cyclesActive * std)
        if (pRow.driftSigmaPerCycle !== 0) {
          val += pRow.driftSigmaPerCycle * cyclesActive * stat.std;
        }
        // Noise (pseudo-deterministic Gaussian via Box-Muller)
        if (pRow.noiseSigma !== 0) {
          const u1 = Math.sin(cycleNumber * 9301 + idx * 49297) * 0.5 + 0.5 || 0.001;
          const u2 = Math.cos(cycleNumber * 49297 + idx * 9301) * 0.5 + 0.5 || 0.001;
          const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          val += z0 * pRow.noiseSigma * stat.std;
        }
      }
    }

    modified[idx] = val;

    // Evaluate OOD (|z| > 4.0 or out of min/max bounds)
    const zScore = (val - stat.mean) / stat.std;
    const isZExceeded = Math.abs(zScore) > 4.0;
    const isBoundsExceeded = val < stat.min || val > stat.max;
    if (isZExceeded || isBoundsExceeded) {
      oodIndicators.push({
        sensorId: pRow.sensorId,
        z: zScore,
        reason: isZExceeded ? '|z| > 4.0' : 'out of bounds',
      });
    }
  });

  return {
    sensors: modified,
    isOOD: oodIndicators.length > 0,
    oodIndicators,
    frozenValues,
  };
}
