// Provenance tags as specified by H1:
// LIVE | REPLAY | MODEL | SIMULATED | STATIC | ASSUMED

export const PROVENANCE = {
  LIVE: 'LIVE',
  REPLAY: 'REPLAY',
  MODEL: 'MODEL',
  SIMULATED: 'SIMULATED',
  STATIC: 'STATIC',
  ASSUMED: 'ASSUMED',
};

// Health status thresholds matching backend and rubric:
// Healthy RUL >= 80, Degrading 60-79, Critical < 60
export const HEALTH_CONFIG = {
  RUL_CAP: 125,
  ALERT_THRESHOLD_T: 60,
  ALERT_SUSTAINED_K: 3,
  HEALTHY_MIN_RUL: 80,
  DEGRADING_MIN_RUL: 60,
  WINDOW_N: 30,
  FEATURE_COUNT: 14,
  MODEL_NAME: 'twinedge_rul_cnn',
  DATASET_NAME: 'C-MAPSS FD001',
  MODEL_SHA_PREFIX: '032c3efa',
  MODEL_SIZE_BYTES: 71355,
  BUILD_VERSION: 'v2.1-flightdeck',
  DEVICE_LABEL: 'Edge Gateway (x86_64)',
};

export const SENSORS_14 = [
  { id: 's_2', name: 'T24', desc: 'LPC Outlet Temp', unit: '°R' },
  { id: 's_3', name: 'T30', desc: 'HPC Outlet Temp', unit: '°R' },
  { id: 's_4', name: 'T50', desc: 'LPT Outlet Temp', unit: '°R' },
  { id: 's_7', name: 'P30', desc: 'HPC Outlet Static Pressure', unit: 'psia' },
  { id: 's_8', name: 'Nf', desc: 'Fan Speed', unit: 'rpm' },
  { id: 's_9', name: 'Nc', desc: 'Core Speed', unit: 'rpm' },
  { id: 's_11', name: 'Ps30', desc: 'HPC Static Pressure', unit: 'psia' },
  { id: 's_12', name: 'phi', desc: 'Fuel-Air Ratio', unit: '—' },
  { id: 's_13', name: 'NRf', desc: 'Corrected Fan Speed', unit: 'rpm' },
  { id: 's_14', name: 'NRc', desc: 'Corrected Core Speed', unit: 'rpm' },
  { id: 's_15', name: 'BPR', desc: 'Bypass Ratio', unit: '—' },
  { id: 's_17', name: 'htBleed', desc: 'Bleed Enthalpy', unit: '—' },
  { id: 's_20', name: 'W31', desc: 'HPT Coolant Bleed', unit: 'lbm/s' },
  { id: 's_21', name: 'W32', desc: 'LPT Coolant Bleed', unit: 'lbm/s' },
];

export function getHealthBand(rul) {
  if (rul === null || rul === undefined || isNaN(rul)) {
    return { band: 'UNKNOWN', label: 'Unknown', color: 'gray' };
  }
  if (rul >= HEALTH_CONFIG.HEALTHY_MIN_RUL) {
    return { band: 'HEALTHY', label: 'Healthy', color: 'emerald' };
  }
  if (rul >= HEALTH_CONFIG.DEGRADING_MIN_RUL) {
    return { band: 'DEGRADING', label: 'Degrading', color: 'amber' };
  }
  return { band: 'CRITICAL', label: 'Critical', color: 'rose' };
}
