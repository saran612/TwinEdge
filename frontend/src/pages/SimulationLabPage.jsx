import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MetricCard, Card, CardHeader, Button, ProvenanceTag, Banner } from '../components/ui';
import {
  PERTURBATION_PRESETS,
  createDefaultPerturbationMatrix,
  applyPerturbations,
} from '../services/simulator';
import { runLocalInference } from '../services/inferenceEngine';
import trainingStatsJson from '../offline/training_stats.json';
import { HEALTH_CONFIG } from '../config/rubrics';
import {
  Play,
  RotateCcw,
  Save,
  FlaskConical,
  ArrowRight,
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
  const { activeEngineKey, activeEngineId, replayController, setDataSource } = useApp();

  const [preset, setPreset] = useState('nominal');
  const [scenarioName, setScenarioName] = useState('Custom Scenario 1');
  const [horizon, setHorizon] = useState(120);
  const [degMultiplier, setDegMultiplier] = useState(1.0);
  const [matrix, setMatrix] = useState(createDefaultPerturbationMatrix());
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  const engine = replayController.getEngine(activeEngineKey || activeEngineId);

  // Apply Presets
  const handleSelectPreset = (pId) => {
    setPreset(pId);
    if (pId === 'accelerated') {
      setDegMultiplier(2.0);
    } else {
      setDegMultiplier(1.0);
    }
  };

  const handleMatrixChange = (sId, field, val) => {
    setMatrix((prev) => ({
      ...prev,
      [sId]: {
        ...prev[sId],
        [field]: Number(val),
      },
    }));
  };

  const runSimulation = async () => {
    setIsRunning(true);
    try {
      const chartData = [];
      let oodCount = 0;
      let firstAlertCycleScen = null;

      for (let c = 1; c <= horizon; c++) {
        const cycleIdx = Math.min(engine.cycles.length - 1, c - 1);
        const nominalWindow = engine.sensors.slice(Math.max(0, cycleIdx - 29), cycleIdx + 1);

        const { perturbedWindow, isOOD } = applyPerturbations(
          nominalWindow,
          matrix,
          c,
          degMultiplier,
          trainingStatsJson
        );

        if (isOOD) oodCount++;

        const baseInf = await runLocalInference(nominalWindow);
        const scenInf = await runLocalInference(perturbedWindow);

        if (scenInf.rul < 60 && !firstAlertCycleScen) {
          firstAlertCycleScen = c;
        }

        chartData.push({
          cycle: c,
          baseRul: Number(baseInf.rul.toFixed(1)),
          scenRul: Number(scenInf.rul.toFixed(1)),
        });
      }

      const lastPt = chartData[chartData.length - 1];
      const deltaEol = Math.round(lastPt.scenRul - lastPt.baseRul);

      setResults({
        chartData,
        deltaEol,
        oodPercentage: ((oodCount / horizon) * 100).toFixed(1),
        firstAlertCycleScen,
      });
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSendToTwin = () => {
    setDataSource('SIMULATION');
    if (onSendToTwin) onSendToTwin();
  };

  return (
    <div className="flex flex-col h-full gap-6 select-none">
      {/* Simulation Banner Notice */}
      <Banner type="warning" title="Offline simulation lab">
        Model response to synthetic perturbations — not physical engine mechanics.
      </Banner>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Column: Setup Panel & Perturbation Matrix */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Controls Card */}
          <Card className="p-5 space-y-4">
            <CardHeader title="Simulation configuration" />

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-text-2 font-medium block mb-1.5">Preset scenario</label>
                <select
                  value={preset}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full h-10 bg-surface border border-border rounded-md px-3 text-text-main font-mono text-xs focus:outline-none focus:border-accent"
                >
                  {PERTURBATION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-text-2 font-medium block mb-1.5">Degradation rate multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="2.0"
                  value={degMultiplier}
                  onChange={(e) => setDegMultiplier(Number(e.target.value))}
                  className="w-full h-10 bg-surface border border-border rounded-md px-3 text-text-main font-mono text-xs focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-text-2 font-sans">
                Horizon: <strong className="text-text-main font-mono">{horizon} cycles</strong>
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={runSimulation}
                disabled={isRunning}
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isRunning ? 'Simulating...' : 'Run simulation'}</span>
              </Button>
            </div>
          </Card>

          {/* Perturbation Matrix Editor */}
          <Card className="p-5 space-y-3 flex-1">
            <CardHeader title="Sensor perturbation matrix" />
            <div className="max-h-72 overflow-y-auto border border-border rounded-md">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 text-text-2 border-b border-border sticky top-0">
                  <tr className="h-8">
                    <th className="px-3 py-1 font-semibold uppercase text-xs">Sensor</th>
                    <th className="px-3 py-1 font-semibold uppercase text-xs">Drift / cycle</th>
                    <th className="px-3 py-1 font-semibold uppercase text-xs">Noise (&sigma;)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-xs">
                  {Object.keys(matrix).map((sId) => (
                    <tr key={sId} className="h-9 hover:bg-surface-2/40">
                      <td className="px-3 py-1 text-accent font-semibold">{sId}</td>
                      <td className="px-3 py-1">
                        <input
                          type="number"
                          step="0.01"
                          value={matrix[sId].drift}
                          onChange={(e) => handleMatrixChange(sId, 'drift', e.target.value)}
                          className="w-20 h-7 bg-surface border border-border rounded-sm px-2 text-text-main"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="number"
                          step="0.05"
                          value={matrix[sId].noise}
                          onChange={(e) => handleMatrixChange(sId, 'noise', e.target.value)}
                          className="w-20 h-7 bg-surface border border-border rounded-sm px-2 text-text-main"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column: Results & Projections */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto">
          {results && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="EOL delta"
                value={`${results.deltaEol > 0 ? '+' : ''}${results.deltaEol}`}
                unit="cycles"
                provenance="SIMULATED"
              />
              <MetricCard
                label="OOD cycles"
                value={`${results.oodPercentage}%`}
                provenance="SIMULATED"
              />
              <MetricCard
                label="First alert cycle"
                value={results.firstAlertCycleScen || 'None'}
                provenance="SIMULATED"
              />
            </div>
          )}

          {/* Chart Display */}
          <Card className="p-5 flex-1 flex flex-col">
            <CardHeader
              title="Trajectory: Baseline vs simulated scenario"
              action={
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <span className="w-2 h-2 rounded-full bg-accent"></span> Baseline
                  </span>
                  <span className="flex items-center gap-1.5 text-status-degrading-text">
                    <span className="w-2 h-2 rounded-full bg-status-degrading-text"></span> Scenario
                  </span>
                </div>
              }
            />

            <div className="flex-1 min-h-56">
              {results ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.chartData}>
                    <XAxis dataKey="cycle" stroke="var(--text-muted)" tick={{ fontSize: 12, fill: 'var(--text-2)' }} />
                    <YAxis stroke="var(--text-muted)" domain={[0, 125]} tick={{ fontSize: 12, fill: 'var(--text-2)' }} />
                    <ReferenceLine y={60} stroke="var(--status-critical-text)" strokeDasharray="3 3" label="Threshold T=60" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Line type="monotone" dataKey="baseRul" stroke="var(--accent)" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="scenRul" stroke="var(--status-degrading-text)" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-text-muted italic">
                  Click 'Run simulation' to execute trajectory projection
                </div>
              )}
            </div>

            {results && (
              <div className="pt-4 border-t border-border flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendToTwin}
                >
                  <span>Send scenario to Digital Twin</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
