import React from 'react';
import { Info } from 'lucide-react';
import { ProvenanceTag } from './ProvenanceTag';

/**
 * MetricCard:
 * Spec: Fixed height 120px, equal width in a single row of 5 (grid at >=1280).
 * Labels short, sentence case, never truncate:
 * "Predicted RUL", "EOL cycle", "Health index", "Status", "Latency".
 * Metric: 32px / 36px line-height, weight 600, tabular-nums.
 */
export function MetricCard({
  label,
  value,
  unit,
  provenance = 'STATIC',
  tooltip,
  delta,
  deltaType = 'neutral',
  className = '',
}) {
  const deltaColors = {
    positive: 'text-status-healthy-text',
    negative: 'text-status-critical-text',
    neutral: 'text-text-muted',
  };

  return (
    <div
      className={`h-[120px] bg-surface border border-border rounded-lg p-5 flex flex-col justify-between shadow-xs relative group ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-text-2 truncate">
            {label}
          </span>
          {tooltip && (
            <div className="relative group/tip flex-shrink-0">
              <Info className="w-3.5 h-3.5 text-text-muted hover:text-text-2 cursor-help" />
              <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/tip:block z-50 w-48 p-2 text-xs font-normal bg-surface-2 text-text-main border border-border rounded-md shadow-lg pointer-events-none">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <ProvenanceTag type={provenance} />
      </div>

      <div className="flex items-baseline justify-between mt-auto">
        <div className="flex items-baseline gap-1.5 font-sans">
          <span className="text-metric font-semibold tracking-tight text-text-main tabular-nums">
            {value !== undefined && value !== null ? value : '—'}
          </span>
          {unit && (
            <span className="text-xs text-text-muted font-sans font-normal">
              {unit}
            </span>
          )}
        </div>

        {delta !== undefined && (
          <span
            className={`text-xs font-sans tabular-nums ${deltaColors[deltaType] || deltaColors.neutral}`}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
export default MetricCard;
