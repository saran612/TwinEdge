import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { MetricCard, Card, CardHeader, Button, ProvenanceTag, Banner } from '../components/ui';
import {
  PERTURBATION_PRESETS,
  buildMatrixFromPreset,
  applyPerturbationsToWindow,
} from '../services/simulator';
import { runLocalInference } from '../services/inferenceEngine';
import trainingStatsJson from '../offline/training_stats.json';
import {
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  TrendingDown,
  Activity,
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

  const [preset, setPreset] = useState('accelerated');
  const [horizon, setHorizon] = useState(140);
  const [degMultiplier, setDegMultiplier] = useState(1.5);
  const [matrix, setMatrix] = useState(() => buildMatrixFromPreset('accelerated').matrix);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  const engine = replayController.getEngine(activeEngineKey || activeEngineId);

  const handleSelectPreset = (pId) => {
    setPreset(pId);
    const { matrix: newMat, degMultiplier: newMul } = buildMatrixFromPreset(pId);
    setMatrix(newMat);
    setDegMultiplier(newMul);
  };

  const runSimulation = useCallback(async () => {
    if (!engine) return;
    setIsRunning(true);
    try {
      const chartData = [];
      let oodCount = 0;
      let firstAlertCycleScen = null;
      const frozenMap = {};

      const maxH = Math.min(horizon, engine.totalCycles || 192);

      for (let c = 30; c <= maxH; c += 2) {
        const cycleIdx = c - 1;
        const nominalWindow = engine.sensors.slice(Math.max(0, cycleIdx - 29), cycleIdx + 1);

        const { perturbedWindow, isOOD } = applyPerturbationsToWindow(
          nominalWindow,
          matrix,
          c,
          degMultiplier,
          trainingStatsJson,
          frozenMap
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
          delta: Number((scenInf.rul - baseInf.rul).toFixed(1)),
        });
      }

      const lastPt = chartData[chartData.length - 1] || { scenRul: 0, baseRul: 0 };
      const deltaEol = Math.round(lastPt.scenRul - lastPt.baseRul);

      setResults({
        chartData,
        deltaEol,
        oodPercentage: (((oodCount * 2) / (maxH - 30)) * 100).toFixed(1),
        firstAlertCycleScen,
      });
    } catch (err) {
      console.error('Simulation run failed:', err);
    } finally {
      setIsRunning(false);
    }
  }, [engine, horizon, matrix, degMultiplier]);

  // Auto-run simulation immediately on open so page never opens empty (D5)
  useEffect(() => {
    runSimulation();
  }, [preset, runSimulation]);

  return (
    <div className="flex flex-col h-full gap-5 select-none overflow-y-auto pr-1">
      {/* Simulation Banner Notice */}
      <Banner type="warning" title="Simulation Lab Environment">
        Synthetic perturbation scenario generator (NASA C-MAPSS FD001 surrogate model). Evaluates RUL response to simulated sensor faults and degradation.
      </Banner>

      {/* Main Grid: Controls (Left) | Visual Results & Overlay (Right) */}
      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Left Column: Preset Selector & Controls (4 cols) */}
        <div className="col-span-4 flex flex-col gap-4">
          <Card className="p-4 space-y-4">
            <CardHeader title="Scenario presets (D5)" />

            <div className="space-y-2">
              <label className="text-xs text-text-2 font-medium block">Select Preset</label>
              <select
                value={preset}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-xs font-mono text-text cursor-pointer focus:outline-none focus:border-accent"
              >
                {PERTURBATION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted mt-1 font-sans">
                {PERTURBATION_PRESETS.find((x) => x.id === preset)?.desc}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs text-text-2 block mb-1">Horizon (cycles)</label>
                <input
                  type="number"
                  min="50"
                  max="250"
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="w-full bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs font-mono text-text"
                />
              </div>

              <div>
                <label className="text-xs text-text-2 block mb-1">Rate multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="3.0"
                  value={degMultiplier}
                  onChange={(e) => setDegMultiplier(Number(e.target.value))}
                  className="w-full bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs font-mono text-text"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={runSimulation}
                disabled={isRunning}
                className="w-full"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isRunning ? 'Evaluating...' : 'Re-run Simulation'}</span>
              </Button>
            </div>
          </Card>

          {/* Quick Metrics */}
          {results && (
            <Card className="p-4 space-y-3">
              <span className="text-xs font-semibold text-text-2 uppercase tracking-wider block">
                Scenario Impact Summary
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded bg-surface-2 border border-border">
                  <span className="text-xs text-text-muted block">EOL Delta</span>
                  <span className={`text-base font-bold font-mono ${results.deltaEol < 0 ? 'text-status-critical-text' : 'text-accent'}`}>
                    {results.deltaEol} cycles
                  </span>
                </div>
                <div className="p-2.5 rounded bg-surface-2 border border-border">
                  <span className="text-xs text-text-muted block">First Alert At</span>
                  <span className="text-base font-bold font-mono text-text-main">
                    {results.firstAlertCycleScen ? `Cycle ${results.firstAlertCycleScen}` : 'None'}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Comparative Chart Overlay (8 cols) */}
        <div className="col-span-8 flex flex-col gap-4">
          <Card className="p-5 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-text-main">RUL Projection Overlay: Baseline vs Scenario</h3>
                <span className="text-xs text-text-muted">Direct visual comparison of nominal vs perturbed degradation trajectory.</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-accent" />
                  <span className="text-text-muted">Baseline RUL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-status-critical-text" />
                  <span className="text-text-muted">Scenario RUL</span>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-[340px]">
              {results?.chartData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <XAxis dataKey="cycle" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} domain={[0, 130]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Alert Gate (60)', fill: '#ef4444', fontSize: 10 }} />
                    <Line type="monotone" dataKey="baseRul" name="Nominal Baseline" stroke="var(--accent)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="scenRul" name="Scenario Projection" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">
                  Initializing simulation run...
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
