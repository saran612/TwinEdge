import { SENSORS_14 } from '../config/rubrics';

/**
 * Perturbation Presets per Spec D5:
 * 1. Nominal replay
 * 2. Accelerated degradation (multiplier 1.5)
 * 3. Sensor bias fault (s_3 +2 sigma from cycle 80)
 * 4. Sensor freeze (s_7 from cycle 100)
 * 5. Sensor dropout (s_11 hold-last from cycle 90)
 * 6. Noise burst (s_2, s_3, s_4 sigma 0.5, cycles 100-140)
 * 7. Late onset (s_3, s_7, s_11 drift 0.02 sigma/cycle from cycle 120)
 * 8. Step fault (s_4 +3 sigma at cycle 110)
 */
export const PERTURBATION_PRESETS = [
  {
    id: 'nominal',
    name: 'Nominal Replay',
    desc: 'Unmodified benchmark baseline (0 sigma perturbation).',
    degMultiplier: 1.0,
    config: {},
  },
  {
    id: 'accelerated',
    name: 'Accelerated Degradation',
    desc: 'Thermal and mechanical clearance degradation scaled by 1.5x.',
    degMultiplier: 1.5,
    config: {},
  },
  {
    id: 'bias_hpc',
    name: 'Sensor Bias Fault (s_3)',
    desc: 'HPC exit temperature (s_3) biased by +2.0 sigma starting at cycle 80.',
    degMultiplier: 1.0,
    config: { s_3: { biasSigma: 2.0, onsetCycle: 80 } },
  },
  {
    id: 'freeze_hpc',
    name: 'Sensor Freeze (s_7)',
    desc: 'HPC pressure (s_7) frozen at cycle 100 holding constant.',
    degMultiplier: 1.0,
    config: { s_7: { freeze: true, onsetCycle: 100 } },
  },
  {
    id: 'dropout_fan',
    name: 'Sensor Dropout (s_11)',
    desc: 'Static core pressure (s_11) drops out and holds last reading from cycle 90.',
    degMultiplier: 1.0,
    config: { s_11: { dropout: true, onsetCycle: 90 } },
  },
  {
    id: 'noise_burst',
    name: 'Noise Burst (s_2, s_3, s_4)',
    desc: 'Transient sensor noise sigma 0.5 across LPC/HPC stages between cycles 100 and 140.',
    degMultiplier: 1.0,
    config: {
      s_2: { noiseSigma: 0.5, onsetCycle: 100, endCycle: 140 },
      s_3: { noiseSigma: 0.5, onsetCycle: 100, endCycle: 140 },
      s_4: { noiseSigma: 0.5, onsetCycle: 100, endCycle: 140 },
    },
  },
  {
    id: 'late_onset',
    name: 'Late Onset Drift (s_3, s_7, s_11)',
    desc: 'Progressive clearance wear drifting 0.02 sigma/cycle starting late at cycle 120.',
    degMultiplier: 1.0,
    config: {
      s_3: { driftSigmaPerCycle: 0.02, onsetCycle: 120 },
      s_7: { driftSigmaPerCycle: 0.02, onsetCycle: 120 },
      s_11: { driftSigmaPerCycle: 0.02, onsetCycle: 120 },
    },
  },
  {
    id: 'step_fault',
    name: 'Step Fault (s_4)',
    desc: 'Sudden +3.0 sigma thermal step shift in LPT temperature (s_4) at cycle 110.',
    degMultiplier: 1.0,
    config: { s_4: { biasSigma: 3.0, onsetCycle: 110 } },
  },
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
    onsetCycle: 80,
    endCycle: 200,
    freeze: false,
    dropout: false,
  }));
}

export function buildMatrixFromPreset(presetId) {
  const p = PERTURBATION_PRESETS.find((x) => x.id === presetId) || PERTURBATION_PRESETS[0];
  const mat = createDefaultPerturbationMatrix();
  if (p.config) {
    mat.forEach((row) => {
      const cfg = p.config[row.sensorId];
      if (cfg) {
        row.active = true;
        if (cfg.biasSigma !== undefined) row.biasSigma = cfg.biasSigma;
        if (cfg.driftSigmaPerCycle !== undefined) row.driftSigmaPerCycle = cfg.driftSigmaPerCycle;
        if (cfg.noiseSigma !== undefined) row.noiseSigma = cfg.noiseSigma;
        if (cfg.onsetCycle !== undefined) row.onsetCycle = cfg.onsetCycle;
        if (cfg.endCycle !== undefined) row.endCycle = cfg.endCycle;
        if (cfg.freeze !== undefined) row.freeze = cfg.freeze;
        if (cfg.dropout !== undefined) row.dropout = cfg.dropout;
      }
    });
  }
  return { matrix: mat, degMultiplier: p.degMultiplier || 1.0 };
}

export function applyPerturbationsToWindow(rawWindow, matrix, currentCycle, degMultiplier, stats, frozenMap = {}) {
  const numRows = rawWindow.length;
  const perturbedWindow = rawWindow.map((row) => [...row]);
  let isAnyOod = false;

  // Perturb the latest rows based on their cycle
  for (let r = 0; r < numRows; r++) {
    const rowCycle = currentCycle - (numRows - 1 - r);
    for (let c = 0; c < 14; c++) {
      const pRow = matrix[c];
      const sId = pRow.sensorId;
      const mean = stats?.mean?.[c] ?? 0;
      const std = stats?.std?.[c] ?? 1;

      let val = perturbedWindow[r][c];

      // Multiplier
      if (degMultiplier !== 1.0) {
        val = mean + (val - mean) * degMultiplier;
      }

      if (pRow.active && rowCycle >= pRow.onsetCycle && (!pRow.endCycle || rowCycle <= pRow.endCycle)) {
        const cyclesActive = rowCycle - pRow.onsetCycle;
        if (pRow.freeze || pRow.dropout) {
          if (frozenMap[sId] === undefined) {
            frozenMap[sId] = val;
          }
          val = frozenMap[sId];
        } else {
          if (pRow.biasSigma) val += pRow.biasSigma * std;
          if (pRow.driftSigmaPerCycle) val += pRow.driftSigmaPerCycle * cyclesActive * std;
          if (pRow.noiseSigma) {
            const pseudoRand = Math.sin(rowCycle * 9301 + c * 49297) * 0.5;
            val += pseudoRand * pRow.noiseSigma * std;
          }
        }
      }

      // Check OOD (|z| > 4.0)
      const z = (val - mean) / (std || 1);
      if (Math.abs(z) > 4.0) isAnyOod = true;

      perturbedWindow[r][c] = val;
    }
  }

  return { perturbedWindow, isOOD: isAnyOod };
}
