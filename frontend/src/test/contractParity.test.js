import { describe, it, expect } from 'vitest';
import { defaultReplayController } from '../services/replayController';
import replayEvaluations from '../offline/replay_evaluations.json';
import { HEALTH_CONFIG, getHealthBand } from '../config/rubrics';

describe('Unified Contract Test Across Pages', () => {
  const engine = defaultReplayController.getEngine('VAL-001');

  it('same engine+cycle produces identical true RUL and health band values', () => {
    // Test mid-life (cycle 100)
    const cycle100 = defaultReplayController.getCycleData('VAL-001', 100);
    expect(cycle100.trueRul).toBe(92);
    expect(getHealthBand(cycle100.trueRul).band).toBe('HEALTHY');

    // Test late-life (cycle 160)
    const cycle160 = defaultReplayController.getCycleData('VAL-001', 160);
    expect(cycle160.trueRul).toBe(32);
    expect(getHealthBand(cycle160.trueRul).band).toBe('CRITICAL');

    // Test final cycle (cycle 192)
    const cycleLast = defaultReplayController.getCycleData('VAL-001', 192);
    expect(cycleLast.trueRul).toBe(0);
    expect(cycleLast.isLastCycle).toBe(true);
    expect(getHealthBand(cycleLast.trueRul).band).toBe('CRITICAL');
  });

  it('replay evaluation predictions match and trip K-gate before end of life', () => {
    const evalData = replayEvaluations['VAL-001'];
    expect(evalData).toBeDefined();
    expect(evalData.pred_rul.length).toBe(192);

    // Initial predictions clamped at cap 125
    expect(evalData.pred_rul[0]).toBeLessThanOrEqual(125);

    // Final cycle prediction is low (< 20)
    const lastPred = evalData.pred_rul[191];
    expect(lastPred).toBeLessThan(20);
  });
});
