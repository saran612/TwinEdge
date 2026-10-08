import React from 'react';
import {
  Activity,
  Layers,
  FileText,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle,
  Clock,
  Sparkles,
  Sliders,
  ShieldAlert,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DATA_SOURCES } from '../../context/AppContext';
import RubricsDrawer from '../common/RubricsDrawer';
import { HEALTH_CONFIG } from '../../config/rubrics';
import { Button, IconButton, Select } from '../ui';

export const NAV_PAGES = [
  { id: 'overview', label: 'Fleet Overview', icon: Activity },
  { id: 'twin', label: 'Digital Twin 3D', icon: Layers },
  { id: 'telemetry', label: 'Telemetry & Health', icon: Activity },
  { id: 'alerts', label: 'Alerts & Maintenance', icon: AlertTriangle, badge: true },
  { id: 'edge', label: 'Edge Model & Inference', icon: Sparkles },
  { id: 'simulation', label: 'Simulation Lab', icon: Play },
  { id: 'about', label: 'Methodology & Claims', icon: FileText },
  { id: 'audit', label: 'Model Audit & Governance', icon: ShieldAlert },
];

export default function GlobalShell({ activePage, onNavigate, children }) {
  const {
    dataSource,
    setDataSource,
    activeEngineKey,
    setActiveEngineKey,
    setActiveEngineId,
    availableEngines,
    isRubricsOpen,
    setIsRubricsOpen,
    connectivity,
    pendingAlertCount,
    theme,
    toggleTheme,
  } = useApp();

  // Connectivity semantics per spec:
  // Red only when the SELECTED data source cannot work;
  // otherwise neutral ("not required in Replay") or amber for degraded-but-working.
  const getPillStyle = (channel, status) => {
    if (dataSource === DATA_SOURCES.REPLAY || dataSource === DATA_SOURCES.SIMULATION) {
      if (channel === 'mqtt' || channel === 'influx') {
        return {
          classes: 'bg-surface-2 text-text-muted border-border',
          dot: 'bg-text-muted',
          label: 'Not required in replay',
        };
      }
    }

    if (status === 'OK') {
      return {
        classes: 'bg-status-healthy-bg text-status-healthy-text border-status-healthy-border',
        dot: 'bg-status-healthy-text',
        label: 'Connected',
      };
    }

    if (dataSource === DATA_SOURCES.LIVE && (channel === 'backend' || channel === 'mqtt')) {
      return {
        classes: 'bg-status-critical-bg text-status-critical-text border-status-critical-border',
        dot: 'bg-status-critical-text',
        label: 'Offline (Required)',
      };
    }

    return {
      classes: 'bg-status-degrading-bg text-status-degrading-text border-status-degrading-border',
      dot: 'bg-status-degrading-text',
      label: 'Degraded',
    };
  };

  const currentEngine = (availableEngines || []).find(
    (e) => e.key === activeEngineKey || e.id === Number(activeEngineKey)
  ) || availableEngines[0];

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-app text-text-main overflow-hidden font-sans select-none">
      {/* Simulation Banner per Rule H5 */}
      {dataSource === DATA_SOURCES.SIMULATION && (
        <div className="bg-status-degrading-bg border-b border-status-degrading-border px-6 py-2 text-xs font-semibold text-status-degrading-text flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-degrading-text animate-pulse"></span>
            <span>SIMULATION LAB ACTIVE — Synthetic sensor injections running. Operational norms bypassed.</span>
          </div>
          <button
            onClick={() => setDataSource(DATA_SOURCES.REPLAY)}
            className="hover:underline flex items-center gap-1 font-mono text-xs cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Return to Replay</span>
          </button>
        </div>
      )}

      {/* Flight-Deck Header (Height: 64px) */}
      <header className="h-16 border-b border-border bg-surface px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-6">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-sm bg-accent flex items-center justify-center font-bold font-mono text-on-accent text-xs">
              TE
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-base tracking-tight text-text leading-tight">TwinEdge</span>
              <span className="text-xs text-text-muted font-mono tracking-wider uppercase">Aircraft MRO Digital Twin</span>
            </div>
          </div>

          <div className="h-5 w-px bg-border hidden md:block"></div>

          {/* Engine Selector with split-aware unique identity */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-sans font-medium">Engine</span>
            <div className="w-44">
              <Select
                value={activeEngineKey || currentEngine?.key}
                onChange={(e) => {
                  const keyVal = e.target.value;
                  setActiveEngineKey(keyVal);
                  const eng = availableEngines.find((x) => x.key === keyVal);
                  if (eng) setActiveEngineId(eng.id);
                }}
                className="h-8 text-xs font-mono"
              >
                {(availableEngines || []).map((eng) => (
                  <option key={eng.key} value={eng.key}>
                    {eng.displayLabel} ({eng.split === 'HELD-OUT VALIDATION' ? 'VAL' : 'TEST'})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Data Source Switch */}
          <div className="flex items-center bg-surface-2 border border-border rounded-md p-1 text-xs">
            {Object.values(DATA_SOURCES).map((src) => (
              <button
                key={src}
                onClick={() => setDataSource(src)}
                className={`h-7 px-3 rounded-sm transition-colors text-xs font-medium cursor-pointer ${
                  dataSource === src
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'text-text-2 hover:text-text'
                }`}
              >
                {src}
              </button>
            ))}
          </div>

          {/* Connectivity Status Pills */}
          <div className="hidden lg:flex items-center gap-2 text-xs">
            {['backend', 'mqtt', 'influx', 'network'].map((k) => {
              const item = connectivity[k];
              const pill = getPillStyle(k, item.status);
              return (
                <div
                  key={k}
                  className={`px-2.5 py-0.5 rounded-full border text-xs font-medium flex items-center gap-1.5 ${pill.classes}`}
                  title={`${k.toUpperCase()}: ${item.status} (${pill.label})`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`}></span>
                  <span className="capitalize">{k}</span>
                </div>
              );
            })}
          </div>

          {/* Theme Toggle Button */}
          <IconButton
            id="theme-toggle-btn"
            onClick={toggleTheme}
            ariaLabel={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            variant="secondary"
            size="sm"
            title={`Current theme: ${theme}. Click to switch.`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-status-degrading-text" />
            ) : (
              <Moon className="w-4 h-4 text-accent" />
            )}
          </IconButton>

          {/* Rubrics Button */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsRubricsOpen(true)}
            className="text-xs"
          >
            <Sliders className="w-3.5 h-3.5 text-accent" />
            <span>Rubrics</span>
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Nav (Sidebar width: 240px) */}
        <aside className="w-60 border-r border-border bg-surface flex flex-col shrink-0">
          <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
            {NAV_PAGES.map((page) => {
              const Icon = page.icon;
              const isActive = activePage === page.id;
              return (
                <button
                  key={page.id}
                  onClick={() => onNavigate(page.id)}
                  className={`w-full h-11 flex items-center justify-between px-3 rounded-md text-sm transition-colors cursor-pointer select-none whitespace-nowrap ${
                    isActive
                      ? 'bg-selected-row text-accent font-semibold border-l-[3px] border-l-accent'
                      : 'text-text-2 hover:text-text hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`} />
                    <span className="truncate whitespace-nowrap text-sm">{page.label}</span>
                  </div>
                  {page.badge && pendingAlertCount > 0 && (
                    <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-status-critical-bg text-status-critical-text border border-status-critical-border text-xs font-semibold tabular-nums">
                      {pendingAlertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Nav Footer Metadata */}
          <div className="p-4 border-t border-border text-xs font-mono text-text-muted space-y-1.5 bg-surface-2/40">
            <div className="flex justify-between">
              <span>Model SHA:</span>
              <span className="text-text-2 font-medium">{HEALTH_CONFIG.MODEL_SHA_PREFIX}</span>
            </div>
            <div className="flex justify-between">
              <span>Dataset:</span>
              <span className="text-text-2 font-medium">{HEALTH_CONFIG.DATASET_NAME}</span>
            </div>
            <div className="flex justify-between">
              <span>Build:</span>
              <span className="text-text-2 font-medium">{HEALTH_CONFIG.BUILD_VERSION}</span>
            </div>
          </div>
        </aside>

        {/* Viewport content with standard 24px padding */}
        <main className="flex-1 overflow-y-auto p-6 bg-bg-app">
          {children}
        </main>
      </div>

      {/* Global Rubrics Drawer */}
      <RubricsDrawer isOpen={isRubricsOpen} onClose={() => setIsRubricsOpen(false)} />
    </div>
  );
}
