import React from 'react';
import ProvenanceTag from './ProvenanceTag';
import { Info } from 'lucide-react';

/**
 * MetricCard:
 * Flight-deck instrument card: label, tabular numeral value, unit, ProvenanceTag, definition tooltip, optional delta.
 */
export default function MetricCard({
  label,
  value,
  unit,
  provenance = 'STATIC',
  tooltip,
  delta,
  deltaType = 'neutral', // 'positive' | 'negative' | 'neutral'
  className = '',
}) {
  const deltaColors = {
    positive: 'text-emerald-400',
    negative: 'text-rose-400',
    neutral: 'text-slate-400',
  };

  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded p-4 flex flex-col justify-between shadow-sm relative group ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider truncate">
            {label}
          </span>
          {tooltip && (
            <div className="relative group/tip flex-shrink-0">
              <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
              <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/tip:block z-50 w-48 p-2 text-xs font-normal bg-slate-950 text-slate-200 border border-slate-700 rounded shadow-xl pointer-events-none">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <ProvenanceTag type={provenance} />
      </div>

      <div className="flex items-baseline justify-between mt-1">
        <div className="flex items-baseline gap-1.5 font-mono">
          <span className="text-2xl font-bold tracking-tight text-white tabular-nums">
            {value !== undefined && value !== null ? value : '—'}
          </span>
          {unit && <span className="text-xs text-slate-400 font-sans">{unit}</span>}
        </div>

        {delta !== undefined && (
          <span className={`text-xs font-mono tabular-nums ${deltaColors[deltaType] || deltaColors.neutral}`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
