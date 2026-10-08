import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';

/**
 * StatusBadge: icon + text, never color-only (a11y flight-deck requirement)
 */
export default function StatusBadge({ status = 'HEALTHY', label, size = 'sm' }) {
  const norm = status.toUpperCase();

  const configs = {
    HEALTHY: {
      color: 'bg-emerald-950/70 text-emerald-400 border-emerald-700/60',
      icon: CheckCircle,
      text: label || 'Healthy',
    },
    DEGRADING: {
      color: 'bg-amber-950/70 text-amber-400 border-amber-700/60',
      icon: AlertTriangle,
      text: label || 'Degrading',
    },
    CRITICAL: {
      color: 'bg-rose-950/70 text-rose-400 border-rose-700/60',
      icon: AlertCircle,
      text: label || 'Critical',
    },
    PENDING: {
      color: 'bg-rose-950/70 text-rose-300 border-rose-700/60',
      icon: AlertCircle,
      text: label || 'Pending',
    },
    APPROVED: {
      color: 'bg-emerald-950/70 text-emerald-400 border-emerald-700/60',
      icon: CheckCircle,
      text: label || 'Approved',
    },
    REJECTED: {
      color: 'bg-slate-800 text-slate-300 border-slate-700',
      icon: AlertCircle,
      text: label || 'Rejected',
    },
    UNKNOWN: {
      color: 'bg-slate-800 text-slate-400 border-slate-700',
      icon: HelpCircle,
      text: label || 'Unknown',
    },
  };

  const cfg = configs[norm] || configs.UNKNOWN;
  const Icon = cfg.icon;

  const sizeClasses = 'text-xs px-2 py-0.5 gap-1';

  return (
    <span
      className={`inline-flex items-center font-medium rounded border ${cfg.color} ${sizeClasses}`}
    >
      <Icon className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{cfg.text}</span>
    </span>
  );
}
