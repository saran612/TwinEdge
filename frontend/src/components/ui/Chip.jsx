import React from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, HelpCircle, Flame } from 'lucide-react';

/**
 * Chip (Status) Component
 * Spec: Icon + text + color pair tested in both themes: healthy, degrading, critical, neutral.
 * Radius sm (6px). Font xs/600.
 */
export function Chip({ status = 'HEALTHY', label, size = 'sm', className = '' }) {
  const norm = String(status).toUpperCase();

  const configs = {
    HEALTHY: {
      style: 'bg-status-healthy-bg text-status-healthy-text border-status-healthy-border',
      icon: CheckCircle,
      defaultText: 'Healthy',
    },
    DEGRADING: {
      style: 'bg-status-degrading-bg text-status-degrading-text border-status-degrading-border',
      icon: AlertTriangle,
      defaultText: 'Degrading',
    },
    CRITICAL: {
      style: 'bg-status-critical-bg text-status-critical-text border-status-critical-border',
      icon: AlertCircle,
      defaultText: 'Critical',
    },
    WARMUP: {
      style: 'bg-status-neutral-bg text-status-neutral-text border-status-neutral-border',
      icon: Flame,
      defaultText: 'Warm-up',
    },
    PENDING: {
      style: 'bg-status-critical-bg text-status-critical-text border-status-critical-border',
      icon: AlertCircle,
      defaultText: 'Pending',
    },
    APPROVED: {
      style: 'bg-status-healthy-bg text-status-healthy-text border-status-healthy-border',
      icon: CheckCircle,
      defaultText: 'Approved',
    },
    NEUTRAL: {
      style: 'bg-status-neutral-bg text-status-neutral-text border-status-neutral-border',
      icon: HelpCircle,
      defaultText: 'Neutral',
    },
    UNKNOWN: {
      style: 'bg-status-neutral-bg text-status-neutral-text border-status-neutral-border',
      icon: HelpCircle,
      defaultText: 'Unknown',
    },
  };

  const cfg = configs[norm] || configs.UNKNOWN;
  const Icon = cfg.icon;
  const text = label || cfg.defaultText;

  const sizeClasses = size === 'xs'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-sm border select-none ${cfg.style} ${sizeClasses} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{text}</span>
    </span>
  );
}
export default Chip;
