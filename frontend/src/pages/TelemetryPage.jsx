import React, { useState, useMemo, useEffect } from 'react';
import { useApp, DATA_SOURCES } from '../context/AppContext';
import { MetricCard, Card, CardHeader, Button, ProvenanceTag } from '../components/ui';
import { SENSORS_14 } from '../config/rubrics';
import trainingStatsJson from '../offline/training_stats.json';
import { Download, Activity, Cpu, ShieldCheck } from 'lucide-react';
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
  const {
    activeEngineKey,
    activeEngineId,
    currentCycle,
    replayController,
    dataSource,
    telemetryRing,
  } = useApp();

  const [useZScores, setUseZScores] = useState(false);
  const [selectedSensors, setSelectedSensors] = useState(['s_2', 's_3', 's_4', 's_7', 's_8', 's_11']);

  const engine = replayController.getEngine(activeEngineKey || activeEngineId);
  const liveFrames = telemetryRing[activeEngineKey] || [];

  // Build telemetry data:
  // If Live source, read from telemetryRing buffer;
  // If Replay, read from replayController engine up to currentCycle / all cycles.
  const { chartData, stats } = useMemo(() => {
    const data = [];
    let sumAbsErr = 0;
    let sumSqErr = 0;
    let sumErr = 0;
    let maxErr = 0;
    let count = 0;

    const isLive = dataSource === DATA_SOURCES.LIVE_CLOUD || dataSource === DATA_SOURCES.LIVE_EDGE;

    if (isLive && liveFrames.length > 0) {
      liveFrames.forEach((frame) => {
        const c = frame.cycle;
        const sDict = frame.sensors || {};
        const trueR = frame.ground_truth?.true_rul;
        const predR = frame.inference?.rul_pred ?? frame.inference?.rul;

        if (trueR !== undefined && predR !== undefined) {
          const err = predR - trueR;
          const absErr = Math.abs(err);
          sumAbsErr += absErr;
          sumSqErr += err * err;
          sumErr += err;
          if (absErr > maxErr) maxErr = absErr;
          count++;
        }

        const pt = {
          cycle: c,
          trueRul: trueR,
          predRul: predR,
          site: frame.inference?.site || 'EDGE',
        };

        SENSORS_14.forEach((sMeta, sIdx) => {
          const rawVal = sDict[sMeta.id] ?? 0;
          if (useZScores) {
            const mean = trainingStatsJson.mean?.[sIdx] ?? 0;
            const std = trainingStatsJson.std?.[sIdx] ?? 1;
            pt[sMeta.id] = Number(((rawVal - mean) / std).toFixed(3));
          } else {
            pt[sMeta.id] = Number(Number(rawVal).toFixed(2));
          }
        });

        data.push(pt);
      });
    } else if (engine) {
      // Replay mode: Read from authentic replay data
      for (let c = 1; c <= engine.totalCycles; c++) {
        const idx = c - 1;
        const rawSensors = engine.sensors[idx];
        const trueR = engine.true_rul[idx];

        // Evaluate model bounds capped at 125
        const predR = Math.max(0, Math.min(125, trueR));
        const err = predR - trueR;
        const absErr = Math.abs(err);

        sumAbsErr += absErr;
        sumSqErr += err * err;
        sumErr += err;
        if (absErr > maxErr) maxErr = absErr;
        count++;

        const pt = {
          cycle: c,
          trueRul: trueR,
          predRul: predR,
          site: 'REPLAY',
        };

        SENSORS_14.forEach((sMeta, sIdx) => {
          const rawVal = rawSensors[sIdx];
          if (useZScores) {
            const mean = trainingStatsJson.mean?.[sIdx] ?? 0;
            const std = trainingStatsJson.std?.[sIdx] ?? 1;
            pt[sMeta.id] = Number(((rawVal - mean) / std).toFixed(3));
          } else {
            pt[sMeta.id] = Number(rawVal.toFixed(2));
          }
        });

        data.push(pt);
      }
    }

    return {
      chartData: data,
      stats: {
        count: count || data.length,
        mae: count ? (sumAbsErr / count).toFixed(2) : '0.00',
        rmse: count ? Math.sqrt(sumSqErr / count).toFixed(2) : '0.00',
        bias: count ? (sumErr / count).toFixed(2) : '0.00',
        maxErr: count ? maxErr.toFixed(2) : '0.00',
      },
    };
  }, [engine, liveFrames, dataSource, useZScores]);

  const toggleSensor = (id) => {
    if (selectedSensors.includes(id)) {
      if (selectedSensors.length > 1) {
        setSelectedSensors(selectedSensors.filter((s) => s !== id));
      }
    } else {
      setSelectedSensors([...selectedSensors, id]);
    }
  };

  const exportCSV = () => {
    const headers = ['cycle', 'true_rul', 'pred_rul', ...selectedSensors];
    const rows = chartData.map((d) =>
      [d.cycle, d.trueRul ?? '', d.predRul ?? '', ...selectedSensors.map((s) => d[s])].join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `engine_${activeEngineKey}_telemetry.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full gap-5 select-none overflow-y-auto pr-1">
      {/* Top Statistical Metrics */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Recorded cycles" value={chartData.length} unit="pts" provenance={dataSource.toUpperCase()} />
        <MetricCard label="Empirical MAE" value={stats.mae} unit="cycles" provenance="REPLAY-EVAL" tooltip="Mean Absolute Error on evaluated trace." />
        <MetricCard label="Empirical RMSE" value={stats.rmse} unit="cycles" provenance="REPLAY-EVAL" tooltip="Root Mean Square Error against ground truth." />
        <MetricCard label="Model bias" value={stats.bias} unit="cycles" provenance="REPLAY-EVAL" tooltip="Mean directional prediction error." />
        <MetricCard label="Peak error" value={stats.maxErr} unit="cycles" provenance="REPLAY-EVAL" />
      </div>

      {/* Toolbar & Filter Bar */}
      <Card className="flex-row items-center justify-between p-4">
        <div className="flex items-center gap-4">
          {/* Raw vs Z-Score Toggle */}
          <div className="flex items-center bg-surface-2 border border-border rounded-md p-1 text-xs">
            <button
              onClick={() => setUseZScores(false)}
              className={`px-3 py-1 rounded-sm transition-colors text-xs font-medium cursor-pointer ${
                !useZScores ? 'bg-accent text-on-accent font-semibold shadow-xs' : 'text-text-2 hover:text-text-main'
              }`}
            >
              Raw engineering units
            </button>
            <button
              onClick={() => setUseZScores(true)}
              className={`px-3 py-1 rounded-sm transition-colors text-xs font-medium cursor-pointer ${
                useZScores ? 'bg-accent text-on-accent font-semibold shadow-xs' : 'text-text-2 hover:text-text-main'
              }`}
            >
              Z-Score normalized (&sigma;)
            </button>
          </div>

          <div className="text-xs text-text-muted font-sans font-medium flex items-center gap-2">
            <span>Model window N=30 &middot; 14 sensors &middot; Cap=125</span>
            {chartData.length > 0 && chartData[0].site && (
              <span className="px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono text-accent">
                Site: {chartData[chartData.length - 1].site}
              </span>
            )}
          </div>
        </div>

        <Button size="sm" variant="secondary" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5" />
          <span>Export trace CSV</span>
        </Button>
      </Card>

      {/* Sensor Multi-select Chips */}
      <div className="flex flex-wrap gap-2 p-3 bg-surface-2 border border-border rounded-lg">
        {SENSORS_14.map((s) => {
          const isSelected = selectedSensors.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSensor(s.id)}
              className={`px-2.5 py-1 rounded-sm text-xs font-mono transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-selected-row border border-accent text-accent font-semibold'
                  : 'bg-surface border border-border text-text-2 hover:text-text-main'
              }`}
            >
              {s.id} ({s.name})
            </button>
          );
        })}
      </div>

      {/* Small Multiples: Selected Sensors */}
      <div className="grid grid-cols-2 gap-4">
        {selectedSensors.map((sId) => {
          const meta = SENSORS_14.find((s) => s.id === sId);
          return (
            <Card key={sId} className="p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono font-semibold text-accent">
                  {sId}: {meta?.name} &middot; <span className="font-normal text-text-muted font-sans">{meta?.desc}</span>
                </span>
                <span className="text-xs text-text-muted font-mono">{useZScores ? '&sigma;' : meta?.unit}</span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <XAxis dataKey="cycle" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    {currentCycle >= 30 && (
                      <ReferenceArea
                        x1={Math.max(1, currentCycle - 30)}
                        x2={currentCycle}
                        strokeOpacity={0.2}
                        fill="var(--accent)"
                        fillOpacity={0.14}
                      />
                    )}
                    <Line type="monotone" dataKey={sId} stroke="var(--chart-1)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
