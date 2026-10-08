import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

/**
 * Banner Component
 * Spec: Radius sm (6px), padding 12px/16px, background & text per status token pair.
 */
export function Banner({
  type = 'info', // 'info' | 'success' | 'warning' | 'error'
  title,
  children,
  className = '',
}) {
  const configs = {
    info: {
      style: 'bg-surface-2 border-border text-text-main',
      icon: Info,
    },
    success: {
      style: 'bg-status-healthy-bg border-status-healthy-border text-status-healthy-text',
      icon: CheckCircle,
    },
    warning: {
      style: 'bg-status-degrading-bg border-status-degrading-border text-status-degrading-text',
      icon: AlertTriangle,
    },
    error: {
      style: 'bg-status-critical-bg border-status-critical-border text-status-critical-text',
      icon: AlertCircle,
    },
  };

  const cfg = configs[type] || configs.info;
  const Icon = cfg.icon;

  return (
    <div
      className={`p-3 rounded-sm border flex items-start gap-3 text-sm select-none ${cfg.style} ${className}`}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div className="text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/**
 * Toggle Component
 * Spec: Radius full (9999px), accent background when checked.
 */
export function Toggle({
  checked = false,
  onChange,
  label,
  disabled = false,
  className = '',
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`w-9 h-5 rounded-full transition-colors ${
            checked ? 'bg-accent' : 'bg-surface-2 border border-border'
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
            checked
              ? 'translate-x-4 bg-on-accent'
              : 'translate-x-0 bg-text-muted'
          }`}
        />
      </div>
      {label && <span className="text-sm text-text-main">{label}</span>}
    </label>
  );
}

/**
 * ChartFrame Component
 * Spec: Standard responsive chart container using token borders, surface background, and xs labels.
 */
export function ChartFrame({
  title,
  subtitle,
  children,
  height = 'h-64',
  className = '',
}) {
  return (
    <div
      className={`bg-surface border border-border rounded-lg p-5 flex flex-col justify-between shadow-xs ${className}`}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h4 className="text-base font-semibold text-text-main">{title}</h4>
          )}
          {subtitle && (
            <p className="text-xs text-text-2 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div className={`w-full ${height}`}>{children}</div>
    </div>
  );
}
