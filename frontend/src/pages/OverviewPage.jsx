import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DATA_SOURCES } from '../context/AppContext';
import { MetricCard, Chip, ProvenanceTag, Card, CardHeader, Button, TableShell } from '../components/ui';
import { getHealthBand, HEALTH_CONFIG } from '../config/rubrics';
import { runLocalInference } from '../services/inferenceEngine';
import {
  Play,
  Pause,
  Box,
  Bell,
  Activity,
  ArrowRight,
  Flame,
} from 'lucide-react';

export default function OverviewPage({ onNavigateToTwin, onNavigateToAlerts }) {
  const {
    dataSource,
    activeEngineId,
    setActiveEngineId,
    activeEngineKey,
    setActiveEngineKey,
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
    eolCycle: 155,
    healthIndex: 100,
    band: 'HEALTHY',
    latencyMs: 0.52,
    isWarmup: false,
  });

  // Evaluate active engine prediction
  const currentEngineData = replayController.getCycleData(activeEngineKey || activeEngineId, currentCycle);

  useEffect(() => {
    let isMounted = true;
    async function evaluateActive() {
      try {
        const inf = await runLocalInference(currentEngineData.window);
        if (!isMounted) return;

        const rul = inf.rul;
        const eol = currentCycle + Math.round(rul);
        const healthIdx = Math.round((rul / HEALTH_CONFIG.RUL_CAP) * 100);
        const isWarmup = currentCycle < 30;
        const bandObj = isWarmup ? { band: 'WARMUP' } : getHealthBand(rul);

        setActiveEngineMetrics({
          rul,
          eolCycle: eol,
          healthIndex: healthIdx,
          band: bandObj.band,
          latencyMs: inf.latencyMs,
          isWarmup,
        });
      } catch (err) {
        console.warn('Inference error in overview:', err);
      }
    }
    evaluateActive();
    return () => {
      isMounted = false;
    };
  }, [activeEngineKey, activeEngineId, currentCycle, currentEngineData.window]);

  // Build fleet overview table
  // S5b: Use unique keys "<split>:<id>" (display VAL-001, TEST-001).
  // Selection and alert counts keyed by (source, engine key). Replay/Simulation never show backend alerts.
  useEffect(() => {
    const list = (availableEngines || []).map((eng) => {
      const isSelected = eng.key === activeEngineKey || eng.id === activeEngineId;
      const effectiveCycle = isSelected ? currentCycle : 30;
      const data = replayController.getCycleData(eng.key, effectiveCycle);
      const isWarmup = effectiveCycle < 30;
      const bandObj = isWarmup ? { band: 'WARMUP' } : getHealthBand(data.trueRul);

      // Replay / Sim never show live backend alert numbers
      const alertsCount = dataSource === DATA_SOURCES.LIVE && isSelected ? pendingAlertCount : 0;

      return {
        id: eng.id,
        key: eng.key,
        displayId: eng.displayLabel,
        split: eng.split,
        cycle: effectiveCycle,
        totalCycles: eng.totalCycles,
        rul: Number(data.trueRul.toFixed(1)),
        band: bandObj.band,
        isWarmup,
        pendingAlerts: alertsCount,
      };
    });
    setFleetStatus(list);
  }, [availableEngines, activeEngineKey, activeEngineId, currentCycle, pendingAlertCount, dataSource]);

  const columns = [
    {
      field: 'displayId',
      header: 'Engine ID',
      width: '16%',
      render: (val, row) => (
        <span className="font-semibold text-text-main font-mono">{val}</span>
      ),
    },
    {
      field: 'split',
      header: 'Data split',
      width: '22%',
      render: (val) => (
        <span className="inline-flex px-2 py-0.5 rounded-sm border border-border text-xs font-semibold text-text-2 bg-surface-2">
          {val === 'HELD-OUT VALIDATION' ? 'VAL (Full Run)' : 'TEST (Truncated)'}
        </span>
      ),
    },
    {
      field: 'cycle',
      header: 'Cycle',
      width: '16%',
      render: (val, row) => `${val} / ${row.totalCycles}`,
    },
    {
      field: 'rul',
      header: 'RUL projection',
      width: '18%',
      render: (val, row) => (
        <span className="tabular-nums">
          {row.isWarmup ? '— (Warm-up)' : `${val} cycles`}
        </span>
      ),
    },
    {
      field: 'band',
      header: 'Status band',
      width: '16%',
      render: (val, row) =>
        row.isWarmup ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border text-xs font-medium text-text-muted bg-surface-2">
            <Flame className="w-3.5 h-3.5 text-text-muted" />
            <span>Warm-up</span>
          </span>
        ) : (
          <Chip status={val} />
        ),
    },
    {
      field: 'pendingAlerts',
      header: 'Alerts',
      width: '12%',
      render: (val) =>
        val > 0 ? (
          <span className="px-2 py-0.5 rounded-full bg-status-critical-bg text-status-critical-text font-semibold border border-status-critical-border text-xs tabular-nums">
            {val}
          </span>
        ) : (
          <span className="text-text-muted text-xs">0</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-6 select-none">
      {/* Flight-Deck Metrics Grid: Single row of 5 fixed 120px MetricCards */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard
          label="Predicted RUL"
          value={activeEngineMetrics.isWarmup ? '—' : activeEngineMetrics.rul.toFixed(1)}
          unit={activeEngineMetrics.isWarmup ? 'Warm-up' : 'cycles'}
          provenance="MODEL"
          tooltip="1D-CNN piecewise linear RUL prediction."
        />
        <MetricCard
          label="EOL cycle"
          value={
            activeEngineMetrics.isWarmup
              ? '—'
              : activeEngineMetrics.rul >= 125
              ? `>= t+125`
              : activeEngineMetrics.eolCycle
          }
          provenance="MODEL"
          tooltip="Estimated End-of-Life cycle = current cycle + predicted RUL."
        />
        <MetricCard
          label="Health index"
          value={activeEngineMetrics.isWarmup ? '—' : `${activeEngineMetrics.healthIndex}%`}
          provenance="MODEL"
          tooltip="Engine health percentage calculated as (RUL / 125) * 100."
        />
        <div className="h-[120px] bg-surface border border-border rounded-lg p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-text-2">
            <span>Status</span>
            <ProvenanceTag type="STATIC" />
          </div>
          <div className="mt-auto">
            {activeEngineMetrics.isWarmup ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-border text-xs font-semibold text-text-muted bg-surface-2">
                <Flame className="w-3.5 h-3.5 text-text-muted" />
                <span>Warm-up</span>
              </span>
            ) : (
              <Chip status={activeEngineMetrics.band} />
            )}
          </div>
        </div>
        <MetricCard
          label="Latency"
          value={`${activeEngineMetrics.latencyMs.toFixed(2)} ms`}
          provenance="LIVE"
          tooltip="Local client-side execution latency for this cycle."
        />
      </div>

      {/* Main Split: Fleet Table & Quick Actions */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Fleet Table */}
        <div className="flex-1 overflow-hidden">
          <TableShell
            columns={columns}
            data={fleetStatus}
            keyField="key"
            onRowClick={(row) => {
              setActiveEngineKey(row.key);
              setActiveEngineId(row.id);
            }}
            selectedKey={activeEngineKey}
            exportFileName="twinedge_fleet.csv"
            emptyMessage="No fleet engines configured."
          />
        </div>

        {/* Quick Actions & Mini Viewport Link */}
        <div className="w-80 flex flex-col gap-4">
          <Card className="p-5 flex flex-col justify-between">
            <CardHeader title="Navigation quick actions" />
            <div className="space-y-3">
              <Button
                variant="primary"
                onClick={() => onNavigateToTwin && onNavigateToTwin()}
                className="w-full justify-between"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4" />
                  <span>Open Digital Twin 3D</span>
                </div>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                variant="secondary"
                onClick={() => onNavigateToAlerts && onNavigateToAlerts()}
                className="w-full justify-between"
              >
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-status-critical-text" />
                  <span>Open Alerts queue</span>
                </div>
                {pendingAlertCount > 0 && dataSource === DATA_SOURCES.LIVE && (
                  <span className="px-2 py-0.5 rounded-full bg-status-critical-bg text-status-critical-text text-xs font-semibold tabular-nums">
                    {pendingAlertCount}
                  </span>
                )}
              </Button>
            </div>
          </Card>

          {/* Timeline Playback Card */}
          <Card className="p-5 flex flex-col justify-between">
            <CardHeader title="Replay controller" />
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-text-2">
                <span>{activeEngineKey || `VAL-${String(activeEngineId).padStart(3, '0')}`}</span>
                <span>Cycle {currentCycle} / {currentEngineData.totalCycles}</span>
              </div>

              <Button
                variant="secondary"
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-full"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause replay' : 'Play timeline'}</span>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
