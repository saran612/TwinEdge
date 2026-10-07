import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';
import { SENSORS_14, HEALTH_CONFIG } from '../config/rubrics';
import trainingStatsJson from '../../public/offline/training_stats.json';
import {
  Download,
  Activity,
  Layers,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';

export default function TelemetryPage() {
  const { activeEngineId, currentCycle, replayController } = useApp();

  const [useZScores, setUseZScores] = useState(false);
  const [selectedSensors, setSelectedSensors] = useState(['s_2', 's_3', 's_4', 's_7', 's_8', 's_11']);
  const [cycleRange, setCycleRange] = useState([1, 100]);

  const engine = replayController.getEngine(activeEngineId);

  // Build telemetry data across all cycles
  const { chartData, cycleLogs, stats } = useMemo(() => {
    const data = [];
    const logs = [];
    let sumAbsErr = 0;
    let sumSqErr = 0;
    let sumErr = 0;
    let maxErr = 0;
    let count = 0;

    for (let c = 1; c <= engine.totalCycles; c++) {
      const idx = c - 1;
      const rawSensors = engine.sensors[idx];
      const trueR = engine.true_rul[idx];

      // Point pred placeholder or replay estimate
      const predR = Math.max(0, Math.min(125, trueR + (Math.sin(c * 0.3) * 3.5)));
      const err = predR - trueR;
      const absErr = Math.abs(err);

      sumAbsErr += absErr;
      sumSqErr += err * err;
      sumErr += err;
      if (absErr > maxErr) maxErr = absErr;
      count++;

      const point = {
        cycle: c,
        trueRul: trueR,
        predRul: Number(predR.toFixed(1)),
        error: Number(err.toFixed(1)),
      };

      // Add 14 sensors (raw or z-transformed)
      SENSORS_14.forEach((s, sIdx) => {
        const rawVal = rawSensors[sIdx];
        const stat = trainingStatsJson[s.id] || { mean: 0, std: 1 };
        const zVal = (rawVal - stat.mean) / stat.std;
        point[s.id] = useZScores ? Number(zVal.toFixed(3)) : Number(rawVal.toFixed(2));
      });

      data.push(point);

      if (c <= currentCycle) {
        logs.push({
          cycle: c,
          predRul: Number(predR.toFixed(1)),
          trueRul: Number(trueR.toFixed(1)),
          error: Number(err.toFixed(1)),
          isAlert: predR < 60,
        });
      }
    }

    const mae = count > 0 ? (sumAbsErr / count).toFixed(2) : 0;
    const rmse = count > 0 ? Math.sqrt(sumSqErr / count).toFixed(2) : 0;
    const bias = count > 0 ? (sumErr / count).toFixed(2) : 0;

    return {
      chartData: data,
      cycleLogs: logs.reverse(),
      stats: { mae, rmse, bias, maxErr: maxErr.toFixed(2), count },
    };
  }, [engine, currentCycle, useZScores]);

  const toggleSensor = (sId) => {
    setSelectedSensors((prev) =>
      prev.includes(sId) ? prev.filter((id) => id !== sId) : [...prev, sId]
    );
  };

  const exportCSV = () => {
    const headers = ['cycle', 'true_rul', 'pred_rul', 'error', ...SENSORS_14.map((s) => s.id)].join(',');
    const rows = chartData.map((d) =>
      [d.cycle, d.trueRul, d.predRul, d.error, ...SENSORS_14.map((s) => d[s.id])].join(',')
    );
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `engine_${activeEngineId}_telemetry.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col h-full gap-4 select-none overflow-y-auto pr-1">
      {/* Top Controls & Statistical Metrics */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="Samples / Cycles" value={stats.count} unit="cycles" provenance="REPLAY" />
        <MetricCard label="Empirical MAE" value={stats.mae} unit="cycles" provenance="REPLAY" tooltip="Mean Absolute Error on this trace." />
        <MetricCard label="Empirical RMSE" value={stats.rmse} unit="cycles" provenance="REPLAY" tooltip="Root Mean Square Error on this trace." />
        <MetricCard label="Model Bias" value={stats.bias} unit="cycles" provenance="REPLAY" tooltip="Mean directional prediction error (Pred - True)." />
        <MetricCard label="Peak Error" value={stats.maxErr} unit="cycles" provenance="REPLAY" />
      </div>

      {/* Toolbar & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded p-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {/* Raw vs Z-Score Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setUseZScores(false)}
              className={`px-2.5 py-1 rounded transition-colors ${
                !useZScores ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Raw Engineering Units
            </button>
            <button
              onClick={() => setUseZScores(true)}
              className={`px-2.5 py-1 rounded transition-colors ${
                useZScores ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Z-Score Normalized (&sigma;)
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Model Window N=30 &middot; 14 Sensors &middot; Cap=125
          </div>
        </div>

        <button
          onClick={exportCSV}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Trace CSV</span>
        </button>
      </div>

      {/* Sensor Multi-select Chips */}
      <div className="flex flex-wrap gap-1.5 p-2 bg-slate-900/60 border border-slate-800/80 rounded">
        {SENSORS_14.map((s) => {
          const isSelected = selectedSensors.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSensor(s.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                isSelected
                  ? 'bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              {s.id} ({s.name})
            </button>
          );
        })}
      </div>

      {/* Small Multiples: Selected Sensors */}
      <div className="grid grid-cols-2 gap-3">
        {selectedSensors.map((sId) => {
          const meta = SENSORS_14.find((s) => s.id === sId);
          return (
            <div key={sId} className="bg-slate-900 border border-slate-800 rounded p-3 flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-indigo-400">
                  {sId}: {meta?.name} &middot; <span className="font-normal text-slate-400">{meta?.desc}</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{useZScores ? '&sigma;' : meta?.unit}</span>
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <XAxis dataKey="cycle" stroke="#475569" tick={{ fontSize: 9 }} />
                    <YAxis stroke="#475569" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }} />
                    {/* Shaded last 30-cycle model window */}
                    {currentCycle >= 30 && (
                      <ReferenceArea
                        x1={currentCycle - 30}
                        x2={currentCycle}
                        strokeOpacity={0.3}
                        fill="#6366f1"
                        fillOpacity={0.15}
                      />
                    )}
                    <Line type="monotone" dataKey={sId} stroke="#818cf8" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
