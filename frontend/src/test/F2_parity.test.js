import { describe, it, expect } from 'vitest';
import { preprocessWindow } from '../services/preprocessor';
import parityFixtures from './fixtures/parity_windows.json';
import scalerJson from '../../public/offline/scaler.json';

describe('F2 Preprocessing Parity Test (JS vs Python)', () => {
  it('has at least 200 parity samples generated from Python', () => {
    expect(parityFixtures.length).toBeGreaterThanOrEqual(200);
  });

  it('verifies exact bit-level parity (< 1e-4) on all scaled float windows', () => {
    let maxDiff = 0.0;
    let checkedWindows = 0;

    for (const sample of parityFixtures) {
      const { scaledFlat } = preprocessWindow(sample.input_window, scalerJson);
      const expectedFlat = sample.expected_padded_scaled.flat();

      expect(scaledFlat.length).toBe(expectedFlat.length);
      for (let i = 0; i < scaledFlat.length; i++) {
        const diff = Math.abs(scaledFlat[i] - expectedFlat[i]);
        if (diff > maxDiff) maxDiff = diff;
      }
      checkedWindows++;
    }

    console.log(`Verified ${checkedWindows} windows. Max scaled difference: ${maxDiff.toExponential(4)}`);
    expect(maxDiff).toBeLessThan(1e-4);
  });

  it('rejects windows longer than 30 cycles or empty windows', () => {
    expect(() => preprocessWindow([], scalerJson)).toThrow();
    const oversized = Array.from({ length: 31 }, () => Array(14).fill(0.0));
    expect(() => preprocessWindow(oversized, scalerJson)).toThrow();
  });
});
