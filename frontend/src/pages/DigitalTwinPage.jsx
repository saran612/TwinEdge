import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import EngineViewport3D from '../components/twin/EngineViewport3D';
import { MetricCard, Chip, ProvenanceTag, Card, CardHeader, Button, IconButton } from '../components/ui';
import componentMapData from '../config/component_map.json';
import { SENSORS_14, HEALTH_CONFIG, getHealthBand } from '../config/rubrics';
import { computeComponentAttribution } from '../services/counterfactual';
import { runLocalInference } from '../services/inferenceEngine';
import scalerJson from '../offline/scaler.json';
import trainingStatsJson from '../offline/training_stats.json';
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
  ReferenceLine,
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
    setDataSource,
    telemetryRing,
  } = useApp();

  const [activeTab, setActiveTab] = useState('component'); // 'component' | 'engine' | 'sensors'
  const [selectedComponentId, setSelectedComponentId] = useState('hpc');
  const [colorMode, setColorMode] = useState('None');
  const [isXray, setIsXray] = useState(false);
  const [attributions, setAttributions] = useState([]);
  const [sensorWindowMode, setSensorWindowMode] = useState('120'); // '60' | '120' | 'all'
  const [visibleSensorIds, setVisibleSensorIds] = useState(() => SENSORS_14.map((s) => s.id));
  const [engineMetrics, setEngineMetrics] = useState({
    rul: 125,
    trueRul: 125,
    eolCycle: 155,
    healthIndex: 100,
    band: 'HEALTHY',
    isWarmup: false,
  });

  const SENSOR_PALETTE = {
    s_2: '#0ea5e9',  // Sky
    s_3: '#f97316',  // Orange
    s_4: '#eab308',  // Yellow
    s_7: '#10b981',  // Emerald
    s_8: '#06b6d4',  // Cyan
    s_9: '#3b82f6',  // Blue
    s_11: '#8b5cf6', // Violet
    s_12: '#d946ef', // Fuchsia
    s_13: '#f43f5e', // Rose
    s_14: '#14b8a6', // Teal
    s_15: '#a855f7', // Purple
    s_17: '#f59e0b', // Amber
    s_20: '#6366f1', // Indigo
    s_21: '#ec4899', // Pink
  };

  const engineData = replayController.getCycleData(activeEngineKey || activeEngineId, currentCycle);
  const rawEngine = replayController.getEngine(activeEngineKey || activeEngineId);
  const selectedComponent = componentMapData.components.find((c) => c.id === selectedComponentId) || componentMapData.components[0];

  // Build multi-series 14-sensor time-series chart data plotted as z-score (sigma) relative to healthy baseline
  const sensorTimeSeriesData = useMemo(() => {
    const isLive = dataSource === 'Live' || dataSource === 'Live (Edge Local)';
    const liveFrames = telemetryRing[activeEngineKey] || [];
    const pts = [];

    const baseline = rawEngine?.healthy_baseline || Array(14).fill(0);
    const stds = scalerJson.scale || Array(14).fill(1);

    if (isLive && liveFrames.length > 0) {
      liveFrames.forEach((frame) => {
        const c = frame.cycle;
        const sDict = frame.sensors || {};
        const pt = { cycle: c };
        SENSORS_14.forEach((sMeta, idx) => {
          const rawVal = sDict[sMeta.id] ?? 0;
          const baseMean = baseline[idx] ?? 0;
          const sigma = stds[idx] || 1;
          pt[sMeta.id] = Number(((rawVal - baseMean) / sigma).toFixed(2));
        });
        pts.push(pt);
      });
    } else if (rawEngine && rawEngine.sensors) {
      // Replay or Simulation
      const maxC = rawEngine.total_cycles || rawEngine.sensors.length;
      let startC = 1;
      if (sensorWindowMode === '60') startC = Math.max(1, currentCycle - 60);
      else if (sensorWindowMode === '120') startC = Math.max(1, currentCycle - 120);

      const endC = isLive ? currentCycle : Math.min(maxC, currentCycle);

      for (let c = startC; c <= endC; c++) {
        const idx = c - 1;
        const row = rawEngine.sensors[idx];
        if (!row) continue;
        const pt = { cycle: c };
        SENSORS_14.forEach((sMeta, sIdx) => {
          const rawVal = row[sIdx];
          const baseMean = baseline[sIdx] ?? 0;
          const sigma = stds[sIdx] || 1;
          pt[sMeta.id] = Number(((rawVal - baseMean) / sigma).toFixed(2));
        });
        pts.push(pt);
      }
    }
    return pts;
  }, [dataSource, activeEngineKey, telemetryRing, rawEngine, currentCycle, sensorWindowMode]);

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

        // Check if latest input is out-of-distribution (|z| > 4 or outside min/max)
        let isUnreliable = false;
        const lastRow = engineData.window && engineData.window.length > 0 ? engineData.window[engineData.window.length - 1] : null;
        if (lastRow) {
          SENSORS_14.forEach((sMeta, sIdx) => {
            const val = lastRow[sIdx];
            const stats = trainingStatsJson[sMeta.id];
            if (stats && val !== undefined) {
              const z = Math.abs((val - stats.mean) / (stats.std || 1));
              if (z > 4.0 || val < stats.min || val > stats.max) {
                isUnreliable = true;
              }
            }
          });
        }

        let bandObj = isWarmup ? { band: 'WARMUP' } : getHealthBand(rul);
        if (isUnreliable) {
          bandObj = { band: 'UNRELIABLE', label: 'Unreliable input', color: 'rose' };
        }

        setEngineMetrics({
          rul,
          trueRul: engineData.trueRul,
          eolCycle: eol,
          healthIndex: isUnreliable ? Math.min(healthIdx, 59) : healthIdx,
          band: bandObj.band,
          isWarmup,
          isUnreliable,
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

  // Keyboard navigation for components & space bar for playback (T4)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is inside an input, select, or textarea
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (dataSource !== 'Live') {
          setIsPlaying((prev) => !prev);
        }
      } else if (e.key === 'Escape') {
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
  }, [selectedComponentId, dataSource, setIsPlaying]);

  return (
    <div className="flex flex-col h-full gap-4 select-none">
      {/* Top Split: 3D Viewport (approx 3/5) | Control Panels (approx 2/5) */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left: 3D Viewport (7 cols) */}
        <div className="col-span-7 bg-surface border border-border rounded-lg overflow-hidden relative flex flex-col shadow-xs">
          <EngineViewport3D
            selectedComponentId={selectedComponentId}
            onSelectComponent={(id) => setSelectedComponentId(id)}
            colorMode={colorMode}
            isXray={isXray}
            setIsXray={setIsXray}
          />
        </div>

        {/* Right: Tabs [Component | Engine | Sensors] (5 cols) */}
        <div className="col-span-5 bg-surface border border-border rounded-lg flex flex-col shadow-xs overflow-hidden">
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

                {/* Model-attributed impact card per T5 */}
                <div className="p-4 rounded-md bg-surface-2 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-main font-semibold flex items-center gap-1.5">
                      Model-attributed impact (Counterfactual)
                      {engineMetrics.rul < HEALTH_CONFIG.RUL_CAP && Math.abs(selectedAttr?.deltaRul || 0) >= 0.5 && (
                        <span className="text-xs text-text-muted font-normal">(Rank #{selectedAttr.rank || 1})</span>
                      )}
                    </span>
                    <ProvenanceTag type="MODEL" />
                  </div>

                  {engineMetrics.rul >= HEALTH_CONFIG.RUL_CAP || Math.abs(selectedAttr?.deltaRul || 0) < 0.5 ? (
                    <div className="py-1">
                      <div className="text-sm font-semibold text-text-muted">
                        No measurable impact: predicted RUL is at the cap
                      </div>
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">
                        Sensor perturbation indicates all components currently operate within nominal healthy baseline limits.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-mono font-bold ${selectedAttr.deltaRul > 0 ? 'text-status-degrading-text' : 'text-text-main'}`}>
                          {selectedAttr.deltaRul > 0 ? `+${selectedAttr.deltaRul.toFixed(1)}` : selectedAttr.deltaRul.toFixed(1)}
                        </span>
                        <span className="text-xs text-text-2">cycles RUL delta</span>
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed">
                        Counterfactual attribution: difference between predicted RUL if this component's sensors were restored to healthy baseline vs current input.
                      </p>
                    </>
                  )}
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

            {/* TAB 3: SENSORS (R3.1 Multi-series Time Series Chart) */}
            {activeTab === 'sensors' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                      Active Sensor Channels (14) &middot; Baseline Normalized (&sigma;)
                    </h3>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      z-score relative to engine healthy baseline &middot; y-axis: &sigma; deviation
                    </p>
                  </div>
                  {/* Rolling window selector */}
                  <div className="flex items-center gap-1 bg-surface-2 border border-border rounded p-0.5 text-[11px] font-mono">
                    {['60', '120', 'all'].map((w) => (
                      <button
                        key={w}
                        onClick={() => setSensorWindowMode(w)}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          sensorWindowMode === w
                            ? 'bg-accent text-on-accent font-semibold'
                            : 'text-text-2 hover:text-text-main'
                        }`}
                      >
                        {w === 'all' ? 'All' : `${w}c`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 14-Sensor Chart Container */}
                <div className="h-56 bg-surface-2 border border-border rounded-lg p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sensorTimeSeriesData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <XAxis dataKey="cycle" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                      <YAxis
                        stroke="var(--text-muted)"
                        tick={{ fontSize: 10 }}
                        domain={[-4, 4]}
                        label={{ value: 'z-score (σ)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--text-muted)' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--text)',
                          borderRadius: '8px',
                          fontSize: '11px',
                          maxHeight: '220px',
                          overflowY: 'auto',
                        }}
                        formatter={(val, name) => [`${val} σ`, name]}
                        labelFormatter={(lbl) => `Cycle ${lbl}`}
                      />
                      {/* Vertical "now" line following playback cursor */}
                      <ReferenceLine x={currentCycle} stroke="var(--accent)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'NOW', fill: 'var(--accent)', fontSize: 9, position: 'top' }} />

                      {SENSORS_14.map((s) => {
                        const isVisible = visibleSensorIds.includes(s.id);
                        if (!isVisible) return null;
                        const isComponentSensor = selectedComponent?.sensors?.includes(s.id);
                        return (
                          <Line
                            key={s.id}
                            type="linear"
                            dataKey={s.id}
                            stroke={SENSOR_PALETTE[s.id] || 'var(--accent)'}
                            strokeWidth={isComponentSensor ? 2.5 : 1.0}
                            strokeOpacity={isComponentSensor ? 1.0 : 0.35}
                            dot={false}
                            isAnimationActive={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend with click-to-toggle chips */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-surface-2 border border-border rounded-md">
                  {SENSORS_14.map((s) => {
                    const isVisible = visibleSensorIds.includes(s.id);
                    const isComponentSensor = selectedComponent?.sensors?.includes(s.id);
                    const color = SENSOR_PALETTE[s.id] || '#0ea5e9';
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setVisibleSensorIds((prev) =>
                            prev.includes(s.id)
                              ? prev.length > 1
                                ? prev.filter((id) => id !== s.id)
                                : prev
                              : [...prev, s.id]
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                          isVisible
                            ? isComponentSensor
                              ? 'bg-accent/20 border border-accent text-accent font-semibold'
                              : 'bg-surface border border-border text-text-main'
                            : 'bg-surface/40 border border-border/50 text-text-muted line-through opacity-50'
                        }`}
                        title={`${s.id}: ${s.name} (${s.desc})`}
                      >
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
                        <span>{s.id} ({s.name})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Compact Data Table */}
                <div className="max-h-48 overflow-y-auto border border-border rounded-md">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-2 text-text-2 border-b border-border sticky top-0">
                      <tr className="h-7">
                        <th className="px-3 py-1 font-semibold uppercase text-[11px]">Channel</th>
                        <th className="px-3 py-1 font-semibold uppercase text-[11px]">Description</th>
                        <th className="px-3 py-1 font-semibold uppercase text-[11px]">Current Raw</th>
                        <th className="px-3 py-1 font-semibold uppercase text-[11px]">Baseline Raw</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-[11px]">
                      {SENSORS_14.map((s, idx) => {
                        const curVal = engineData.currentSensors?.[idx];
                        const baseVal = engineData.healthyBaseline?.[idx];
                        const isComponentSensor = selectedComponent?.sensors?.includes(s.id);
                        return (
                          <tr key={s.id} className={`h-7 hover:bg-surface-2/40 ${isComponentSensor ? 'bg-accent/5 font-semibold' : ''}`}>
                            <td className="px-3 py-0.5 text-accent">{s.id} ({s.name})</td>
                            <td className="px-3 py-0.5 text-text-muted font-sans">{s.desc}</td>
                            <td className="px-3 py-0.5 text-text-main tabular-nums">{curVal?.toFixed(2) || '—'} {s.unit}</td>
                            <td className="px-3 py-0.5 text-text-muted tabular-nums">{baseVal?.toFixed(2) || '—'} {s.unit}</td>
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
          {dataSource === 'Live' ? (
            <div className="flex items-center gap-2">
              <IconButton
                variant="secondary"
                size="md"
                disabled={true}
                title="Playback applies to Replay and Simulation"
                ariaLabel="Playback disabled in Live mode"
              >
                <Play className="w-5 h-5 text-text-muted" />
              </IconButton>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDataSource('Replay')}
                title="Switch active data source to Replay to enable time travel playback"
                className="text-xs"
              >
                Switch to Replay
              </Button>
            </div>
          ) : (
            <>
              <IconButton
                variant="primary"
                size="md"
                onClick={() => setIsPlaying(!isPlaying)}
                ariaLabel={isPlaying ? 'Pause replay' : 'Play replay'}
                aria-pressed={isPlaying}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </IconButton>
              <IconButton
                variant="secondary"
                size="md"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentCycle(30);
                }}
                ariaLabel="Reset to cycle 30"
                title="Reset to nominal window (cycle 30)"
              >
                <RotateCcw className="w-5 h-5" />
              </IconButton>
              <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-md px-2.5 py-1 text-xs font-mono">
                <span className="text-text-muted">Speed:</span>
                {[0.5, 1, 2, 4, 8].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded-sm transition-colors cursor-pointer ${
                      playbackSpeed === spd
                        ? 'bg-accent text-on-accent font-bold'
                        : 'text-text-2 hover:text-text'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </>
          )}
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
            <span className="text-text-muted text-xs block">PRED RUL</span>
            <span className="text-text font-bold tabular-nums">
              {engineMetrics.isWarmup ? 'Warm-up' : `${engineMetrics.rul.toFixed(1)} cycles`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-text-muted text-xs block">TRUE RUL</span>
            <span className="text-accent font-bold tabular-nums">
              {engineMetrics.trueRul !== undefined && engineMetrics.trueRul !== null
                ? `${Number(engineMetrics.trueRul).toFixed(1)} cycles`
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
