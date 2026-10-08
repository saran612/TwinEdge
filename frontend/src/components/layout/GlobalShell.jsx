import React from 'react';
import { useApp, DATA_SOURCES } from '../../context/AppContext';
import {
  LayoutDashboard,
  Box,
  Activity,
  Bell,
  ShieldCheck,
  FlaskConical,
  Cpu,
  Info,
  Sliders,
  ChevronDown,
  Sun,
  Moon,
} from 'lucide-react';
import RubricsDrawer from '../common/RubricsDrawer';
import EngineSplitBadge from '../common/EngineSplitBadge';
import { HEALTH_CONFIG } from '../../config/rubrics';

export const NAV_PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'twin', label: 'Digital Twin', icon: Box },
  { id: 'telemetry', label: 'Telemetry', icon: Activity },
  { id: 'alerts', label: 'Alerts', icon: Bell, badge: true },
  { id: 'audit', label: 'Audit', icon: ShieldCheck },
  { id: 'simulation', label: 'Simulation Lab', icon: FlaskConical },
  { id: 'edge', label: 'Edge & Model', icon: Cpu },
  { id: 'about', label: 'Method & Limits', icon: Info },
];

export default function GlobalShell({ activePage, onNavigate, children }) {
  const {
    dataSource,
    setDataSource,
    activeEngineId,
    setActiveEngineId,
    availableEngines,
    isRubricsOpen,
    setIsRubricsOpen,
    connectivity,
    pendingAlertCount,
    theme,
    toggleTheme,
  } = useApp();

  const getPillStyle = (status) => {
    switch (status) {
      case 'OK':
        return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80';
      case 'DOWN':
        return 'bg-rose-950/60 text-rose-400 border-rose-800/80';
      default:
        return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Simulation Banner per Rule H5 */}
      {dataSource === DATA_SOURCES.SIMULATION && (
        <div
          data-testid="simulation-banner"
          className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 px-4 py-1.5 text-xs font-mono font-medium flex items-center justify-between z-40"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>SIMULATION MODE ACTIVE: Model response to synthetic perturbations — not engine physics.</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-amber-400/80">Persistent Banner (H5)</span>
        </div>
      )}

      {/* Top Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex items-center justify-between px-4 z-30 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-bold font-mono text-white text-xs">
              TE
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">TwinEdge</span>
            <span className="text-xs text-slate-500 font-mono hidden md:inline">| Aircraft MRO Digital Twin</span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden md:block"></div>

          {/* Engine Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase font-mono">Engine</span>
            <div className="relative">
              <select
                value={activeEngineId}
                onChange={(e) => setActiveEngineId(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-xs text-slate-200 font-mono rounded px-2.5 py-1 appearance-none pr-7 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {(availableEngines || []).map((eng) => (
                  <option key={`${eng.split}_${eng.id}`} value={eng.id}>
                    #{String(eng.id).padStart(3, '0')} ({eng.split === 'HELD-OUT VALIDATION' ? 'HELD-OUT VAL' : eng.split})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
            </div>
            {(() => {
              const cur = (availableEngines || []).find((e) => e.id === activeEngineId);
              return cur ? <EngineSplitBadge split={cur.split} /> : null;
            })()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Data Source Switch */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-xs font-mono">
            {Object.values(DATA_SOURCES).map((src) => (
              <button
                key={src}
                onClick={() => setDataSource(src)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  dataSource === src
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {src}
              </button>
            ))}
          </div>

          {/* Connectivity Pills */}
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] font-mono">
            {['backend', 'mqtt', 'influx', 'network'].map((k) => {
              const item = connectivity[k];
              return (
                <div
                  key={k}
                  className={`px-2 py-0.5 rounded border uppercase flex items-center gap-1 ${getPillStyle(
                    item.status
                  )}`}
                  title={`${k.toUpperCase()}: ${item.status} (${item.detail || 'healthy'})`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'OK' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  <span>{k}</span>
                </div>
              );
            })}
          </div>

          {/* Theme Toggle Button */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title={`Current theme: ${theme}. Click to switch.`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>

          {/* Rubrics Button */}
          <button
            onClick={() => setIsRubricsOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span>Rubrics</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Nav */}
        <aside className="w-56 border-r border-slate-800 bg-slate-950/60 flex flex-col shrink-0">
          <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
            {NAV_PAGES.map((page) => {
              const Icon = page.icon;
              const isActive = activePage === page.id;
              return (
                <button
                  key={page.id}
                  onClick={() => onNavigate(page.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-colors ${
                    isActive
                      ? 'bg-indigo-950/60 text-white font-medium border border-indigo-700/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span>{page.label}</span>
                  </div>
                  {page.badge && pendingAlertCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold">
                      {pendingAlertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Nav Footer */}
          <div className="p-3 border-t border-slate-800 text-[11px] font-mono text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Model SHA:</span>
              <span className="text-slate-400">{HEALTH_CONFIG.MODEL_SHA_PREFIX}</span>
            </div>
            <div className="flex justify-between">
              <span>Dataset:</span>
              <span className="text-slate-400">{HEALTH_CONFIG.DATASET_NAME}</span>
            </div>
            <div className="flex justify-between">
              <span>Build:</span>
              <span className="text-slate-400">{HEALTH_CONFIG.BUILD_VERSION}</span>
            </div>
          </div>
        </aside>

        {/* Viewport content */}
        <main className="flex-1 overflow-y-auto p-4 bg-slate-950">
          {children}
        </main>
      </div>

      {/* Global Rubrics Drawer */}
      <RubricsDrawer isOpen={isRubricsOpen} onClose={() => setIsRubricsOpen(false)} />
    </div>
  );
}
