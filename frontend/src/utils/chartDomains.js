/**
 * Domain calculation utilities for Telemetry charts.
 *
 * Requirements:
 * - Replay: Stable frame. Domain computed ONCE per engine/sensor with 5% padding.
 * - Live: Windowed domain over last 120 cycles with 10% padding + hysteresis
 *         (expands immediately, shrinks slowly).
 */

/**
 * Calculates a calm, fixed [min, max] domain with 5% padding across all cycles.
 * @param {number[]} values - Array of sensor numeric values across all cycles
 * @param {number} paddingFraction - Padding fraction (default 0.05)
 * @returns {[number, number]} [min, max] domain
 */
export function calculateReplayFixedDomain(values, paddingFraction = 0.05) {
  if (!values || values.length === 0) {
    return [0, 1];
  }

  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (min === Infinity || max === -Infinity) {
    return [0, 1];
  }

  if (min === max) {
    const delta = Math.abs(min) * 0.05 || 1;
    return [Number((min - delta).toFixed(4)), Number((max + delta).toFixed(4))];
  }

  const range = max - min;
  const pad = range * paddingFraction;

  return [
    Number((min - pad).toFixed(4)),
    Number((max + pad).toFixed(4)),
  ];
}

/**
 * Calculates the domain for live mode with 10% padding and hysteresis.
 * Expands immediately to fit new values, shrinks slowly (decay factor) when window contracts.
 * @param {number[]} windowValues - Array of numeric values in the current rolling window
 * @param {[number, number]|null} prevDomain - Previous [min, max] domain
 * @param {number} paddingFraction - Padding fraction (default 0.10)
 * @param {number} shrinkRate - Rate at which domain shrinks towards current window (0 = never shrink, 1 = instant shrink, default 0.1)
 * @returns {[number, number]}
 */
export function calculateLiveHysteresisDomain(
  windowValues,
  prevDomain = null,
  paddingFraction = 0.10,
  shrinkRate = 0.10
) {
  if (!windowValues || windowValues.length === 0) {
    return prevDomain || [0, 1];
  }

  let wMin = Infinity;
  let wMax = -Infinity;

  for (let i = 0; i < windowValues.length; i++) {
    const v = windowValues[i];
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      if (v < wMin) wMin = v;
      if (v > wMax) wMax = v;
    }
  }

  if (wMin === Infinity || wMax === -Infinity) {
    return prevDomain || [0, 1];
  }

  const range = wMax === wMin ? (Math.abs(wMin) * 0.1 || 1) : (wMax - wMin);
  const targetMin = wMin - range * paddingFraction;
  const targetMax = wMax + range * paddingFraction;

  if (!prevDomain) {
    return [Number(targetMin.toFixed(4)), Number(targetMax.toFixed(4))];
  }

  const [pMin, pMax] = prevDomain;

  // Immediate expansion
  const newMin = targetMin < pMin ? targetMin : pMin + (targetMin - pMin) * shrinkRate;
  const newMax = targetMax > pMax ? targetMax : pMax - (pMax - targetMax) * shrinkRate;

  return [Number(newMin.toFixed(4)), Number(newMax.toFixed(4))];
}
