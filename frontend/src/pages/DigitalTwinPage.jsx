import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import EngineViewport3D from '../components/twin/EngineViewport3D';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';
import EngineSplitBadge from '../components/common/EngineSplitBadge';
import componentMapData from '../config/component_map.json';
import { SENSORS_14, HEALTH_CONFIG, getHealthBand } from '../config/rubrics';
import { computeComponentAttribution } from '../services/counterfactual';
import { runLocalInference } from '../services/inferenceEngine';
import scalerJson from '../../public/offline/scaler.json';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  ChevronRight,
  Sliders,
  AlertTriangle,
  Info,
  CheckCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

export default function DigitalTwinPage({ onNavigateToAlerts, onNavigateToSim }) {
  const {
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
    eolCycle: 126,
    healthIndex: 100,
    band: 'HEALTHY',
  });

  // Load replay data for active engine
  const engineData = replayController.getCycleData(activeEngineId, currentCycle);
  const selectedComponent = componentMapData.components.find((c) => c.id === selectedComponentId) || componentMapData.components[0];

  // Playback loop
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentCycle((prev) => {
          if (prev >= engineData.totalCycles) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, engineData.totalCycles, setCurrentCycle, setIsPlaying]);

  // Compute live inference and counterfactual attribution
  useEffect(() => {
    let isMounted = true;
    async function runInference() {
      try {
        const inf = await runLocalInference(engineData.window);
        if (!isMounted) return;

        const predRul = inf.rul;
        const eol = currentCycle + Math.round(predRul);
        const healthIdx = Math.round((predRul / HEALTH_CONFIG.RUL_CAP) * 100);
        const bandObj = getHealthBand(predRul);

        setEngineMetrics({
          rul: predRul,
          trueRul: engineData.trueRul,
          eolCycle: eol,
          healthIndex: healthIdx,
          band: bandObj.band,
          absError: Math.abs(predRul - engineData.trueRul).toFixed(1),
        });

        // Compute counterfactual attribution across components
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
  }, [activeEngineId, currentCycle, engineData.window]);

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
    <div className="flex flex-col h-full gap-3 select-none">
      {/* Top Split: 60% 3D Viewport | 40% Control Panels */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left 60%: 3D Viewport */}
        <div className="w-[60%] bg-slate-900 border border-slate-800 rounded overflow-hidden relative flex flex-col shadow-lg">
          <EngineViewport3D
            selectedComponentId={selectedComponentId}
            onSelectComponent={(id) => setSelectedComponentId(id)}
            colorMode={colorMode}
            isXray={isXray}
            setIsXray={setIsXray}
          />
        </div>

        {/* Right 40%: Tabs [Component | Engine | Sensors] */}
        <div className="w-[40%] bg-slate-900 border border-slate-800 rounded flex flex-col shadow-lg overflow-hidden">
          {/* Tab Headers */}
          <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-3">
            {[
              { id: 'component', label: 'Component' },
              { id: 'engine', label: 'Engine' },
              { id: 'sensors', label: 'Sensors' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: COMPONENT */}
            {activeTab === 'component' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-white">{selectedComponent.name}</h2>
                      <ProvenanceTag type="ASSUMED" />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedComponent.description}</p>
                  </div>
                  {selectedComponent.modeled_fault ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[10px] font-mono">
                      MODELED FAULT (FD001)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-mono">
                      Not covered by training data
                    </span>
                  )}
                </div>

                {/* Model-attributed impact card */}
                <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                      Model-Attributed Impact (Counterfactual)
                      <span className="text-[10px] text-slate-500 font-normal">(Rank #{selectedAttr.rank || 1})</span>
                    </span>
                    <ProvenanceTag type="MODEL" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xl font-mono font-bold ${selectedAttr.deltaRul > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {selectedAttr.deltaRul > 0 ? `+${selectedAttr.deltaRul}` : selectedAttr.deltaRul}
                    </span>
                    <span className="text-xs text-slate-400">cycles RUL delta</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Counterfactual attribution: difference between predicted RUL if this component's sensors were restored to healthy baseline vs current input.
                  </p>
                </div>

                {/* Engine-level EOL block per Rule H2 */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px] font-sans">Predicted Engine RUL</div>
                    <div className="text-lg font-bold text-white mt-1">{engineMetrics.rul.toFixed(1)} cyc</div>
                    <div className="text-[10px] text-slate-500 font-sans mt-0.5">Cap: 125 cycles</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px] font-sans">Projected EOL Cycle</div>
                    <div className="text-lg font-bold text-indigo-300 mt-1">
                      {engineMetrics.rul >= 125 ? `>= ${engineMetrics.eolCycle}` : engineMetrics.eolCycle}
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans mt-0.5">Conf: not computed</div>
                  </div>
                </div>

                {/* Mapped Sensors Table */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Associated Sensors ({selectedComponent.sensors.length})
                  </h3>
                  {selectedComponent.sensors.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-3 bg-slate-950 rounded border border-slate-800">
                      No sensors mapped directly to this component.
                    </div>
                  ) : (
                    <div className="border border-slate-800 rounded overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[10px]">
                          <tr>
                            <th className="p-2">SENSOR</th>
                            <th className="p-2">NAME</th>
                            <th className="p-2">VALUE</th>
                            <th className="p-2">UNIT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {selectedComponent.sensors.map((sId) => {
                            const meta = SENSORS_14.find((s) => s.id === sId);
                            const sIdx = SENSORS_14.findIndex((s) => s.id === sId);
                            const val = engineData.currentSensors ? engineData.currentSensors[sIdx] : 0;
                            return (
                              <tr key={sId} className="hover:bg-slate-800/40">
                                <td className="p-2 text-indigo-300 font-bold">{sId}</td>
                                <td className="p-2 text-slate-300">{meta?.name}</td>
                                <td className="p-2 text-slate-200 tabular-nums">{val ? val.toFixed(2) : '—'}</td>
                                <td className="p-2 text-slate-400">{meta?.unit}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => onNavigateToSim && onNavigateToSim()}
                    className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    Open in Simulation Lab
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: ENGINE */}
            {activeTab === 'engine' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">Engine #{String(activeEngineId).padStart(3, '0')}</h2>
                    <EngineSplitBadge split={engineData.split} />
                  </div>
                  <StatusBadge status={engineMetrics.band} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label="Current Cycle" value={currentCycle} unit={`/ ${engineData.totalCycles}`} provenance="REPLAY" />
                  <MetricCard label="Health Index" value={`${engineMetrics.healthIndex}%`} provenance="MODEL" />
                </div>

                {/* Component Impact Bar Chart */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Component Attribution Ranking
                  </h3>
                  <div className="h-44 bg-slate-950 p-2 rounded border border-slate-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={attributions} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                        <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="componentId" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                        />
                        <Bar dataKey="deltaRul" fill="#6366f1" radius={[0, 4, 4, 0]}>
                          {attributions.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.componentId === selectedComponentId ? '#a855f7' : '#6366f1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SENSORS */}
            {activeTab === 'sensors' && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  All 14 Operational Sensors
                </h2>
                <div className="border border-slate-800 rounded overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[10px]">
                      <tr>
                        <th className="p-2">ID</th>
                        <th className="p-2">NAME</th>
                        <th className="p-2">RAW VALUE</th>
                        <th className="p-2">MAPPED TO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {SENSORS_14.map((s, idx) => {
                        const val = engineData.currentSensors ? engineData.currentSensors[idx] : 0;
                        const mappedComp = componentMapData.components.find((c) => c.sensors.includes(s.id));
                        return (
                          <tr
                            key={s.id}
                            onClick={() => mappedComp && setSelectedComponentId(mappedComp.id)}
                            className="hover:bg-slate-800/50 cursor-pointer"
                          >
                            <td className="p-2 text-indigo-400 font-bold">{s.id}</td>
                            <td className="p-2 text-slate-300">{s.name}</td>
                            <td className="p-2 text-slate-100 tabular-nums">{val ? val.toFixed(2) : '—'}</td>
                            <td className="p-2 text-slate-400 text-[10px] font-sans truncate max-w-[120px]">
                              {mappedComp ? mappedComp.name : '—'}
                            </td>
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

      {/* Bottom Timeline Scrubber */}
      <div className="h-16 bg-slate-900 border border-slate-800 rounded px-4 py-2 flex items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setCurrentCycle(1)}
            className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Restart Timeline"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono">
            <span>Speed:</span>
            {[1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded ${playbackSpeed === spd ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Scrubber Slider */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            Cycle {currentCycle} / {engineData.totalCycles}
          </span>
          <input
            type="range"
            min={1}
            max={engineData.totalCycles}
            value={currentCycle}
            onChange={(e) => setCurrentCycle(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">PRED RUL</span>
            <span className="text-white font-bold">{engineMetrics.rul.toFixed(1)}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">TRUE RUL</span>
            <span className="text-blue-400 font-bold">{engineMetrics.trueRul?.toFixed(1) || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
