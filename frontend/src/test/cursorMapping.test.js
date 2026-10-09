import { describe, it, expect } from 'vitest';
import { defaultReplayController } from '../services/replayController';

describe('Cursor Mapping Contract Tests', () => {
  const engine = defaultReplayController.getEngine('VAL-001');

  it('verifies engine total cycles is 192 for VAL-001', () => {
    expect(engine.totalCycles).toBe(192);
  });

  it('cycle 1 window length and true RUL', () => {
    const data = defaultReplayController.getCycleData('VAL-001', 1);
    expect(data.cycle).toBe(1);
    expect(data.trueRul).toBe(125);
    expect(data.window.length).toBe(1);
  });

  it('cycle 30 full window length and true RUL', () => {
    const data = defaultReplayController.getCycleData('VAL-001', 30);
    expect(data.cycle).toBe(30);
    expect(data.trueRul).toBe(125);
    expect(data.window.length).toBe(30);
  });

  it('mid-cycle (cycle 100) true RUL decreasing and window capped at 30', () => {
    const data = defaultReplayController.getCycleData('VAL-001', 100);
    expect(data.cycle).toBe(100);
    expect(data.trueRul).toBe(92);
    expect(data.window.length).toBe(30);
  });

  it('last cycle (cycle 192) true RUL is exactly 0', () => {
    const data = defaultReplayController.getCycleData('VAL-001', 192);
    expect(data.cycle).toBe(192);
    expect(data.trueRul).toBe(0);
    expect(data.isLastCycle).toBe(true);
    expect(data.window.length).toBe(30);
  });
});
