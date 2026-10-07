import replayEnginesData from '../../public/offline/replay_engines.json';

/**
 * ReplayController manages offline playback of bundled C-MAPSS traces.
 * Enforces Rule H4:
 * Engines carry a split badge: TEST (truncated, final RUL known) | HELD-OUT VALIDATION (full run to failure)
 * Split reproduced by importing existing preprocess logic (random_state=42 grouped by unit).
 */
export class ReplayController {
  constructor(engines = replayEnginesData) {
    this.engines = engines;
  }

  getEnginesList() {
    return this.engines.map((e) => ({
      id: e.engine_id,
      split: e.split, // "HELD-OUT VALIDATION" | "TEST"
      totalCycles: e.total_cycles,
      healthyBaseline: e.healthy_baseline,
    }));
  }

  getEngine(engineId) {
    const match = this.engines.find((e) => e.engine_id === Number(engineId));
    return match || this.engines[0];
  }

  getCycleData(engineId, cycle) {
    const engine = this.getEngine(engineId);
    const cycleIdx = Math.max(0, Math.min(engine.cycles.length - 1, cycle - 1));

    const currentCycleNumber = engine.cycles[cycleIdx];
    const trueRul = engine.true_rul[cycleIdx];
    const currentSensors = engine.sensors[cycleIdx];

    // Build sliding window of up to 30 cycles ending at currentCycleNumber
    const startIdx = Math.max(0, cycleIdx - 29);
    const windowSlice = engine.sensors.slice(startIdx, cycleIdx + 1);

    return {
      engineId: engine.engine_id,
      split: engine.split,
      cycle: currentCycleNumber,
      totalCycles: engine.total_cycles,
      trueRul,
      currentSensors,
      window: windowSlice,
      healthyBaseline: engine.healthy_baseline,
      isLastCycle: cycleIdx === engine.cycles.length - 1,
    };
  }
}

export const defaultReplayController = new ReplayController();
