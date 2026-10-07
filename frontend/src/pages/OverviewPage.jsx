import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';
import EngineSplitBadge from '../components/common/EngineSplitBadge';
import DataTable from '../components/common/DataTable';
import { getHealthBand, HEALTH_CONFIG } from '../config/rubrics';
import { runLocalInference } from '../services/inferenceEngine';
import {
  Play,
  Pause,
  Box,
  Bell,
  Activity,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function OverviewPage({ onNavigateToTwin, onNavigateToAlerts }) {
  const {
    activeEngineId,
    setActiveEngineId,
    currentCycle,
    isPlaying,
    setIsPlaying,
    replayController,
    availableEngines,
    pendingAlertCount,
  } = useApp();

  const [fleetStatus, setFleetStatus] = useState([]);
  const [activeEngineMetrics, setActiveEngineMetrics] = useState({
    rul: 125,
    eolCycle: 126,
    healthIndex: 100,
    band: 'HEALTHY',
    latencyMs: 0.52,
  });

  // Evaluate active engine prediction
  const currentEngineData = replayController.getCycleData(activeEngineId, currentCycle);

  useEffect(() => {
    let isMounted = true;
    async function evaluateActive() {
      try {
        const inf = await runLocalInference(currentEngineData.window);
        if (!isMounted) return;

        const rul = inf.rul;
        const eol = currentCycle + Math.round(rul);
        const healthIdx = Math.round((rul / HEALTH_CONFIG.RUL_CAP) * 100);
        const bandObj = getHealthBand(rul);

        setActiveEngineMetrics({
          rul,
          eolCycle: eol,
          healthIndex: healthIdx,
          band: bandObj.band,
          latencyMs: inf.latencyMs,
        });
      } catch (err) {
        console.warn('Inference error in overview:', err);
      }
    }
    evaluateActive();
    return () => {
      isMounted = false;
    };
  }, [activeEngineId, currentCycle, currentEngineData.window]);

  // Build fleet overview table
  useEffect(() => {
    const list = (availableEngines || []).map((eng) => {
      const data = replayController.getCycleData(eng.id, eng.id === activeEngineId ? currentCycle : 30);
      const bandObj = getHealthBand(data.trueRul);
      return {
        id: eng.id,
        split: eng.split,
        cycle: eng.id === activeEngineId ? currentCycle : 30,
        totalCycles: eng.totalCycles,
        rul: Number(data.trueRul.toFixed(1)),
        band: bandObj.band,
        pendingAlerts: eng.id === 1 && pendingAlertCount > 0 ? pendingAlertCount : 0,
      };
    });
    setFleetStatus(list);
  }, [availableEngines, activeEngineId, currentCycle, pendingAlertCount]);

  const columns = [
    {
      field: 'id',
      header: 'ENGINE ID',
      width: '15%',
      render: (val) => <span className="font-bold text-white">#{String(val).padStart(3, '0')}</span>,
    },
    {
      field: 'split',
      header: 'DATA SPLIT (H4)',
      width: '25%',
      render: (val) => <EngineSplitBadge split={val} />,
    },
    { field: 'cycle', header: 'CYCLE', width: '15%', render: (val, row) => `${val} / ${row.totalCycles}` },
    {
      field: 'rul',
      header: 'RUL PROJECTION',
      width: '18%',
      render: (val) => `${val} cyc`,
    },
    {
      field: 'band',
      header: 'HEALTH BAND',
      width: '15%',
      render: (val) => <StatusBadge status={val} />,
    },
    {
      field: 'pendingAlerts',
      header: 'ALERTS',
      width: '12%',
      render: (val) =>
        val > 0 ? (
          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40">
            {val}
          </span>
        ) : (
          <span className="text-slate-500">0</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-4 select-none">
      {/* Flight-Deck Metrics Grid */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard
          label="Predicted RUL"
          value={activeEngineMetrics.rul.toFixed(1)}
          unit="cycles"
          provenance="MODEL"
          tooltip="1D-CNN piecewise linear RUL point prediction."
        />
        <MetricCard
          label="Projected EOL Cycle"
          value={activeEngineMetrics.rul >= 125 ? `>= t+125` : activeEngineMetrics.eolCycle}
          provenance="MODEL"
          tooltip="Estimated End-of-Life cycle = current cycle + predicted RUL."
        />
        <MetricCard
          label="Health Index"
          value={`${activeEngineMetrics.healthIndex}%`}
          provenance="MODEL"
          tooltip="Engine health percentage calculated as (RUL / 125) * 100."
        />
        <div className="bg-slate-900 border border-slate-800 rounded p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
            <span>Status Band</span>
            <ProvenanceTag type="STATIC" />
          </div>
          <div className="mt-1">
            <StatusBadge status={activeEngineMetrics.band} size="sm" />
          </div>
        </div>
        <MetricCard
          label="Inference Latency"
          value={`${activeEngineMetrics.latencyMs.toFixed(2)} ms`}
          provenance="LIVE"
          tooltip="Client-side ONNX Runtime Web execution latency for this cycle."
        />
      </div>

      {/* Main Split: Fleet Table & Quick Actions */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Fleet Table */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded flex flex-col shadow-md overflow-hidden">
          <div className="p-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Fleet Turbofan Engines
              </span>
              <ProvenanceTag type="REPLAY" />
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Click row to select active digital twin engine
            </span>
          </div>

          <div className="flex-1 overflow-hidden">
            <DataTable
              columns={columns}
              data={fleetStatus}
              keyField="id"
              onRowClick={(row) => setActiveEngineId(row.id)}
              selectedKey={activeEngineId}
              exportFileName="twinedge_fleet.csv"
              emptyMessage="No fleet engines configured."
            />
          </div>
        </div>

        {/* Quick Actions & Mini Viewport Link */}
        <div className="w-80 flex flex-col gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Navigation Quick Actions
            </h3>
            <button
              onClick={() => onNavigateToTwin && onNavigateToTwin()}
              className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium flex items-center justify-between transition-colors shadow-xs"
            >
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4" />
                <span>Open Digital Twin 3D</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => onNavigateToAlerts && onNavigateToAlerts()}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-400" />
                <span>Open Alerts Queue</span>
              </div>
              {pendingAlertCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                  {pendingAlertCount}
                </span>
              )}
            </button>
          </div>

          {/* Timeline Playback Card */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Replay Controller
            </h3>
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span>Engine #{String(activeEngineId).padStart(3, '0')}</span>
              <span>Cycle {currentCycle} / {currentEngineData.totalCycles}</span>
            </div>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause Replay' : 'Play Timeline'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
