import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';
import EngineSplitBadge from '../components/common/EngineSplitBadge';
import {
  PERTURBATION_PRESETS,
  createDefaultPerturbationMatrix,
  applyPerturbations,
} from '../services/simulator';
import { runLocalInference } from '../services/inferenceEngine';
import trainingStatsJson from '../../public/offline/training_stats.json';
import { HEALTH_CONFIG } from '../config/rubrics';
import {
  Play,
  RotateCcw,
  Save,
  Download,
  Upload,
  AlertTriangle,
  FlaskConical,
  Layers,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export default function SimulationLabPage({ onSendToTwin }) {
  const { activeEngineId, replayController, setDataSource } = useApp();

  const [preset, setPreset] = useState('nominal');
  const [scenarioName, setScenarioName] = useState('Custom Scenario 1');
  const [horizon, setHorizon] = useState(120);
  const [degMultiplier, setDegMultiplier] = useState(1.0);
  const [matrix, setMatrix] = useState(createDefaultPerturbationMatrix());
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [sensitivitySweep, setSensitivitySweep] = useState(null);

  const engine = replayController.getEngine(activeEngineId);

  // Apply Presets
  const handleSelectPreset = (pId) => {
    setPreset(pId);
    const newMatrix = createDefaultPerturbationMatrix();

    if (pId === 'accelerated') {
      setDegMultiplier(2.0);
    } else {
      setDegMultiplier(1.0);
    }

    if (pId === 'bias_hpc') {
      newMatrix.forEach((row) => {
        if (row.sensorId === 's_3' || row.sensorId === 's_7') {
          row.active = true;
          row.biasSigma = 2.5;
        }
      });
    } else if (pId === 'freeze_fan') {
      newMatrix.forEach((row) => {
        if (row.sensorId === 's_8') {
          row.active = true;
          row.freeze = true;
          row.onsetCycle = 20;
        }
      });
    } else if (pId === 'dropout') {
      newMatrix.forEach((row) => {
        if (row.sensorId === 's_11') {
          row.active = true;
          row.dropout = true;
          row.onsetCycle = 15;
        }
      });
    } else if (pId === 'noise_burst') {
      newMatrix.forEach((row) => {
        if (['s_2', 's_3', 's_4', 's_7'].includes(row.sensorId)) {
          row.active = true;
          row.noiseSigma = 2.0;
        }
      });
    } else if (pId === 'step_fault') {
      newMatrix.forEach((row) => {
        if (row.sensorId === 's_3') {
          row.active = true;
          row.biasSigma = -3.0;
          row.onsetCycle = 30;
        }
      });
    }
    setMatrix(newMatrix);
  };

  // Run full horizon simulation
  const runSimulation = async () => {
    setIsRunning(true);
    const chartData = [];
    let oodCount = 0;
    const frozenValues = {};
    const maxCycles = Math.min(horizon, engine.totalCycles);

    let firstAlertCycleBase = null;
    let firstAlertCycleScen = null;
    let sustainedCountBase = 0;
    let sustainedCountScen = 0;

    // Buffer windows
    const rawWindows = [];
    const scenWindows = [];

    for (let c = 1; c <= maxCycles; c++) {
      const cycleIdx = c - 1;
      const rawSensors = engine.sensors[cycleIdx];

      // Perturb sensors
      const { sensors: modSensors, isOOD } = applyPerturbations({
        rawCycleSensors: rawSensors,
        cycleNumber: c,
        matrix,
        trainingStats: trainingStatsJson,
        degradationMultiplier: degMultiplier,
        healthyBaseline: engine.healthy_baseline,
        frozenValues,
      });

      if (isOOD) oodCount++;

      rawWindows.push(rawSensors);
      scenWindows.push(modSensors);

      const winBase = rawWindows.slice(Math.max(0, c - 30), c);
      const winScen = scenWindows.slice(Math.max(0, c - 30), c);

      // Perform local model inference
      const infBase = await runLocalInference(winBase);
      const infScen = await runLocalInference(winScen);

      const rBase = infBase.rul;
      const rScen = infScen.rul;

      // Track K-gate (T=60, K=3)
      if (rBase < 60) sustainedCountBase++;
      else sustainedCountBase = 0;
      if (sustainedCountBase >= 3 && firstAlertCycleBase === null) {
        firstAlertCycleBase = c;
      }

      if (rScen < 60) sustainedCountScen++;
      else sustainedCountScen = 0;
      if (sustainedCountScen >= 3 && firstAlertCycleScen === null) {
        firstAlertCycleScen = c;
      }

      chartData.push({
        cycle: c,
        baseRul: Number(rBase.toFixed(1)),
        scenRul: Number(rScen.toFixed(1)),
        isOOD,
      });
    }

    const baselineEol = chartData.length > 0 ? chartData[chartData.length - 1].baseRul : 0;
    const scenEol = chartData.length > 0 ? chartData[chartData.length - 1].scenRul : 0;

    setResults({
      chartData,
      totalCycles: maxCycles,
      oodPercentage: Math.round((oodCount / maxCycles) * 100),
      firstAlertCycleBase,
      firstAlertCycleScen,
      deltaEol: Number((scenEol - baselineEol).toFixed(1)),
      minScenRul: Math.min(...chartData.map((d) => d.scenRul)),
    });
    setIsRunning(false);
  };

  const handleSendToTwin = () => {
    setDataSource('Simulation');
    if (onSendToTwin) onSendToTwin();
  };

  return (
    <div className="flex flex-col h-full gap-4 select-none">
      {/* Simulation Banner Notice */}
      <div className="bg-amber-950/40 border border-amber-800/80 rounded p-3 text-xs flex items-center justify-between text-amber-300">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-amber-400" />
          <span>
            <strong>OFFLINE SIMULATION LAB:</strong> Model response to synthetic perturbations — not engine physics.
          </span>
        </div>
        <ProvenanceTag type="SIMULATED" />
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Column: Setup Panel & Perturbation Matrix */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Controls Card */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3 shadow-md">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Simulation Configuration
            </h2>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Preset Scenario</label>
                <select
                  value={preset}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-slate-200 font-mono text-xs"
                >
                  {PERTURBATION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Degradation Rate Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="2.0"
                  value={degMultiplier}
                  onChange={(e) => setDegMultiplier(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-slate-200 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                Horizon: <strong className="text-white font-mono">{horizon} cycles</strong>
              </span>
              <button
                onClick={runSimulation}
                disabled={isRunning}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isRunning ? 'Simulating...' : 'Run Simulation'}</span>
              </button>
            </div>
          </div>

          {/* Perturbation Matrix Editor */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-2 shadow-md flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Perturbation Matrix (14 Sensors)
              </h2>
              <span className="text-[10px] text-slate-500 font-mono">Units: z-score (&sigma;)</span>
            </div>

            <div className="border border-slate-800 rounded overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2">ACT</th>
                    <th className="p-2">SENSOR</th>
                    <th className="p-2">BIAS (&sigma;)</th>
                    <th className="p-2">DRIFT/CYC</th>
                    <th className="p-2">ONSET</th>
                    <th className="p-2">SPECIAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {matrix.map((row, idx) => (
                    <tr key={row.sensorId} className={row.active ? 'bg-indigo-950/20' : ''}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={row.active}
                          onChange={(e) => {
                            const copy = [...matrix];
                            copy[idx].active = e.target.checked;
                            setMatrix(copy);
                          }}
                          className="accent-indigo-500"
                        />
                      </td>
                      <td className="p-2 text-indigo-300 font-bold">{row.sensorId}</td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.5"
                          value={row.biasSigma}
                          onChange={(e) => {
                            const copy = [...matrix];
                            copy[idx].biasSigma = Number(e.target.value);
                            setMatrix(copy);
                          }}
                          disabled={!row.active}
                          className="w-16 bg-slate-950 border border-slate-800 rounded px-1 text-slate-200"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.05"
                          value={row.driftSigmaPerCycle}
                          onChange={(e) => {
                            const copy = [...matrix];
                            copy[idx].driftSigmaPerCycle = Number(e.target.value);
                            setMatrix(copy);
                          }}
                          disabled={!row.active}
                          className="w-16 bg-slate-950 border border-slate-800 rounded px-1 text-slate-200"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          value={row.onsetCycle}
                          onChange={(e) => {
                            const copy = [...matrix];
                            copy[idx].onsetCycle = Number(e.target.value);
                            setMatrix(copy);
                          }}
                          disabled={!row.active}
                          className="w-14 bg-slate-950 border border-slate-800 rounded px-1 text-slate-200"
                        />
                      </td>
                      <td className="p-2 text-slate-400">
                        {row.freeze ? 'FREEZE' : row.dropout ? 'DROPOUT' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Simulation Results & Charts */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto">
          {/* KPI Summary */}
          {results && (
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                label="EOL Delta"
                value={`${results.deltaEol > 0 ? '+' : ''}${results.deltaEol}`}
                unit="cycles"
                provenance="SIMULATED"
              />
              <MetricCard
                label="OOD Cycles"
                value={`${results.oodPercentage}%`}
                provenance="SIMULATED"
              />
              <MetricCard
                label="First Alert Cycle"
                value={results.firstAlertCycleScen || 'None'}
                provenance="SIMULATED"
              />
            </div>
          )}

          {/* Chart Display */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 flex-1 flex flex-col shadow-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Trajectory: Baseline vs Simulated Scenario
              </h3>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Baseline
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Scenario
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-[220px]">
              {results ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.chartData}>
                    <XAxis dataKey="cycle" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" domain={[0, 125]} tick={{ fontSize: 10 }} />
                    <ReferenceLine y={60} stroke="#f43f5e" strokeDasharray="3 3" label="Threshold T=60" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Line type="monotone" dataKey="baseRul" stroke="#3b82f6" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="scenRul" stroke="#f59e0b" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 italic">
                  Click 'Run Simulation' to execute trajectory projection
                </div>
              )}
            </div>

            {results && (
              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={handleSendToTwin}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <span>Send Scenario to Digital Twin</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
