import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import EngineViewport3D from '../components/twin/EngineViewport3D';
import { MetricCard, Chip, ProvenanceTag, Card, CardHeader, Button, IconButton } from '../components/ui';
import componentMapData from '../config/component_map.json';
import { SENSORS_14, HEALTH_CONFIG, getHealthBand } from '../config/rubrics';
import { computeComponentAttribution } from '../services/counterfactual';
import { runLocalInference } from '../services/inferenceEngine';
import scalerJson from '../offline/scaler.json';
import {
  Play,
  Pause,
  RotateCcw,
  Box,
  Flame,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function DigitalTwinPage({ onNavigateToAlerts, onNavigateToSim }) {
  const {
    activeEngineKey,
    activeEngineId,
    currentCycle,
    setCurrentCycle,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    replayController,
    dataSource,
  } = useApp();

  const [activeTab, setActiveTab] = useState('component'); // 'component' | 'engine' | 'sensors'
  const [selectedComponentId, setSelectedComponentId] = useState('hpc');
  const [colorMode, setColorMode] = useState('None');
  const [isXray, setIsXray] = useState(false);
  const [attributions, setAttributions] = useState([]);
  const [engineMetrics, setEngineMetrics] = useState({
    rul: 125,
    trueRul: 125,
    eolCycle: 155,
    healthIndex: 100,
    band: 'HEALTHY',
    isWarmup: false,
  });

  const engineData = replayController.getCycleData(activeEngineKey || activeEngineId, currentCycle);
  const selectedComponent = componentMapData.components.find((c) => c.id === selectedComponentId) || componentMapData.components[0];

  useEffect(() => {
    let isMounted = true;
    async function runInference() {
      try {
        const inf = await runLocalInference(engineData.window);
        if (!isMounted) return;

        const isWarmup = currentCycle < 30;
        const rul = inf.rul;
        const eol = currentCycle + Math.round(rul);
        const healthIdx = Math.round((rul / HEALTH_CONFIG.RUL_CAP) * 100);
        const bandObj = isWarmup ? { band: 'WARMUP' } : getHealthBand(rul);

        setEngineMetrics({
          rul,
          trueRul: engineData.trueRul,
          eolCycle: eol,
          healthIndex: healthIdx,
          band: bandObj.band,
          isWarmup,
        });

        // Compute counterfactual component attribution
        const sensorIds = SENSORS_14.map((s) => s.id);
        const attrRes = await computeComponentAttribution({
          rawWindow: engineData.window,
          scaler: scalerJson,
          components: componentMapData.components,
          sensorIds,
          healthyBaselineRaw: engineData.healthyBaseline,
          inferenceFn: runLocalInference,
        });

        if (isMounted) {
          setAttributions(attrRes.attributions);
        }
      } catch (err) {
        console.error('Inference / Attribution failed:', err);
      }
    }
    runInference();
    return () => {
      isMounted = false;
    };
  }, [activeEngineKey, activeEngineId, currentCycle, engineData.window]);

  const selectedAttr = attributions.find((a) => a.componentId === selectedComponentId) || {
    deltaRul: 0,
    rank: 1,
  };

  // Keyboard navigation for components
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedComponentId(null);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const idx = componentMapData.components.findIndex((c) => c.id === selectedComponentId);
        const next = componentMapData.components[(idx + 1) % componentMapData.components.length];
        setSelectedComponentId(next.id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const idx = componentMapData.components.findIndex((c) => c.id === selectedComponentId);
        const prev = componentMapData.components[(idx - 1 + componentMapData.components.length) % componentMapData.components.length];
        setSelectedComponentId(prev.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponentId]);

  return (
    <div className="flex flex-col h-full gap-4 select-none">
      {/* Top Split: 60% 3D Viewport | 40% Control Panels */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left 60%: 3D Viewport */}
        <div className="w-[60%] bg-surface border border-border rounded-lg overflow-hidden relative flex flex-col shadow-xs">
          <EngineViewport3D
            selectedComponentId={selectedComponentId}
            onSelectComponent={(id) => setSelectedComponentId(id)}
            colorMode={colorMode}
            isXray={isXray}
            setIsXray={setIsXray}
          />
        </div>

        {/* Right 40%: Tabs [Component | Engine | Sensors] */}
        <div className="w-[40%] bg-surface border border-border rounded-lg flex flex-col shadow-xs overflow-hidden">
          {/* Tab Headers */}
          <div className="flex items-center border-b border-border bg-surface-2/40 px-4">
            {[
              { id: 'component', label: 'Component' },
              { id: 'engine', label: 'Engine' },
              { id: 'sensors', label: 'Sensors' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-2 hover:text-text-main'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* TAB 1: COMPONENT */}
            {activeTab === 'component' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-text-main">{selectedComponent.name}</h2>
                      <ProvenanceTag type="ASSUMED" />
                    </div>
                    <p className="text-xs text-text-2 mt-0.5">{selectedComponent.description}</p>
                  </div>
                  {selectedComponent.modeled_fault ? (
                    <span className="px-2 py-0.5 rounded-sm bg-status-healthy-bg border border-status-healthy-border text-status-healthy-text text-xs font-semibold">
                      Modeled fault (FD001)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-sm bg-surface-2 border border-border text-text-muted text-xs font-semibold">
                      Not in training data
                    </span>
                  )}
                </div>

                {/* Model-attributed impact card */}
                <div className="p-4 rounded-md bg-surface-2 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-main font-semibold flex items-center gap-1.5">
                      Model-attributed impact (Counterfactual)
                      <span className="text-xs text-text-muted font-normal">(Rank #{selectedAttr.rank || 1})</span>
                    </span>
                    <ProvenanceTag type="MODEL" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xl font-mono font-bold ${selectedAttr.deltaRul > 0 ? 'text-status-degrading-text' : 'text-text-main'}`}>
                      {selectedAttr.deltaRul > 0 ? `+${selectedAttr.deltaRul}` : selectedAttr.deltaRul}
                    </span>
                    <span className="text-xs text-text-2">cycles RUL delta</span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Counterfactual attribution: difference between predicted RUL if this component's sensors were restored to healthy baseline vs current input.
                  </p>
                </div>

                {/* Engine-level EOL block */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-md bg-surface-2 border border-border">
                    <div className="text-text-muted text-xs font-sans">Predicted engine RUL</div>
                    <div className="text-base font-bold text-text-main mt-1 tabular-nums">
                      {engineMetrics.isWarmup ? '— (Warm-up)' : `${engineMetrics.rul.toFixed(1)} cycles`}
                    </div>
                    <div className="text-xs text-text-muted font-sans mt-0.5">Cap: 125 cycles</div>
                  </div>
                  <div className="p-3 rounded-md bg-surface-2 border border-border">
                    <div className="text-text-muted text-xs font-sans">Projected EOL cycle</div>
                    <div className="text-base font-bold text-accent mt-1 tabular-nums">
                      {engineMetrics.isWarmup ? '—' : engineMetrics.rul >= 125 ? `>= ${engineMetrics.eolCycle}` : engineMetrics.eolCycle}
                    </div>
                    <div className="text-xs text-text-muted font-sans mt-0.5">Conf: not computed</div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigateToSim && onNavigateToSim()}
                    className="w-full"
                  >
                    Open in Simulation lab
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 2: ENGINE */}
            {activeTab === 'engine' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-text-main">
                    Engine {activeEngineKey || `VAL-${String(activeEngineId).padStart(3, '0')}`}
                  </h2>
                  {engineMetrics.isWarmup ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-border text-xs font-semibold text-text-muted bg-surface-2">
                      <Flame className="w-3.5 h-3.5 text-text-muted" />
                      <span>Warm-up</span>
                    </span>
                  ) : (
                    <Chip status={engineMetrics.band} />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-md bg-surface-2 border border-border">
                    <span className="text-text-muted block text-xs">Total cycles</span>
                    <span className="text-base font-bold text-text-main font-mono mt-1 block tabular-nums">
                      {engineData.totalCycles} cycles
                    </span>
                  </div>
                  <div className="p-3 rounded-md bg-surface-2 border border-border">
                    <span className="text-text-muted block text-xs">Health index</span>
                    <span className="text-base font-bold text-text-main font-mono mt-1 block tabular-nums">
                      {engineMetrics.isWarmup ? '—' : `${engineMetrics.healthIndex}%`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SENSORS */}
            {activeTab === 'sensors' && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                  Active Sensor Channels (14)
                </h3>
                <div className="max-h-80 overflow-y-auto border border-border rounded-md">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-2 text-text-2 border-b border-border sticky top-0">
                      <tr className="h-8">
                        <th className="px-3 py-1 font-semibold uppercase text-xs">Channel</th>
                        <th className="px-3 py-1 font-semibold uppercase text-xs">Current</th>
                        <th className="px-3 py-1 font-semibold uppercase text-xs">Baseline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-xs">
                      {SENSORS_14.map((s, idx) => {
                        const curVal = engineData.currentSensors?.[idx];
                        const baseVal = engineData.healthyBaseline?.[idx];
                        return (
                          <tr key={s.id} className="h-8 hover:bg-surface-2/40">
                            <td className="px-3 py-1 text-accent font-semibold">{s.id} ({s.name})</td>
                            <td className="px-3 py-1 text-text-main tabular-nums">{curVal?.toFixed(2) || '—'}</td>
                            <td className="px-3 py-1 text-text-muted tabular-nums">{baseVal?.toFixed(2) || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Timeline Scrubber (Height 64px) */}
      <div className="h-16 bg-surface border border-border rounded-lg px-5 py-2 flex items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-3">
          <IconButton
            variant="primary"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            ariaLabel={isPlaying ? 'Pause replay' : 'Play replay'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </IconButton>
          <IconButton
            variant="secondary"
            size="sm"
            onClick={() => setCurrentCycle(30)}
            ariaLabel="Reset to cycle 30"
            title="Reset to nominal window (cycle 30)"
          >
            <RotateCcw className="w-4 h-4" />
          </IconButton>
          <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-md px-2.5 py-1 text-xs font-mono">
            <span className="text-text-muted">Speed:</span>
            {[1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded-sm transition-colors cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-accent text-on-accent font-bold'
                    : 'text-text-2 hover:text-text-main'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Scrubber Slider */}
        <div className="flex-1 flex items-center gap-4">
          <span className="text-xs font-mono text-text-2 whitespace-nowrap tabular-nums">
            Cycle {currentCycle} / {engineData.totalCycles}
          </span>
          <input
            type="range"
            min={1}
            max={engineData.totalCycles}
            value={currentCycle}
            onChange={(e) => setCurrentCycle(Number(e.target.value))}
            className="w-full accent-accent cursor-pointer h-1.5 bg-surface-2 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-5 text-xs font-mono">
          <div className="text-right">
            <span className="text-text-muted text-[10px] block">PRED RUL</span>
            <span className="text-text-main font-bold tabular-nums">
              {engineMetrics.isWarmup ? 'Warm-up' : `${engineMetrics.rul.toFixed(1)} cycles`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-text-muted text-[10px] block">TRUE RUL</span>
            <span className="text-accent font-bold tabular-nums">
              {engineMetrics.trueRul ? `${engineMetrics.trueRul.toFixed(1)} cycles` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
