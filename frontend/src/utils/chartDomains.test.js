import { describe, it, expect } from 'vitest';
import { calculateReplayFixedDomain, calculateLiveHysteresisDomain } from './chartDomains.js';

describe('calculateReplayFixedDomain', () => {
  it('computes min and max with exactly 5% padding across all values', () => {
    const values = [100, 150, 200];
    // range = 100, 5% padding = 5
    // min = 100 - 5 = 95, max = 200 + 5 = 205
    const domain = calculateReplayFixedDomain(values, 0.05);
    expect(domain).toEqual([95, 205]);
  });

  it('handles flat values without collapsing domain', () => {
    const values = [50, 50, 50];
    const domain = calculateReplayFixedDomain(values, 0.05);
    expect(domain[0]).toBeLessThan(50);
    expect(domain[1]).toBeGreaterThan(50);
  });

  it('handles empty or null values safely', () => {
    expect(calculateReplayFixedDomain([])).toEqual([0, 1]);
    expect(calculateReplayFixedDomain(null)).toEqual([0, 1]);
  });
});

describe('calculateLiveHysteresisDomain', () => {
  it('expands domain immediately when new values exceed current domain', () => {
    const prevDomain = [100, 200];
    // Values spike to 250 -> range = 150 (from 100 to 250), 10% pad = 15 -> targetMax = 265
    const nextDomain = calculateLiveHysteresisDomain([100, 250], prevDomain, 0.10);
    expect(nextDomain[1]).toBeGreaterThanOrEqual(265);
  });

  it('shrinks slowly (hysteresis) when values contract into smaller range', () => {
    const prevDomain = [50, 250];
    // Current window is only [100, 110]
    const nextDomain = calculateLiveHysteresisDomain([100, 110], prevDomain, 0.10, 0.10);
    // It should not jump straight to ~[99, 111]; it should decay slowly from [50, 250]
    expect(nextDomain[0]).toBeGreaterThan(50);
    expect(nextDomain[0]).toBeLessThan(90);
    expect(nextDomain[1]).toBeLessThan(250);
    expect(nextDomain[1]).toBeGreaterThan(120);
  });
});
