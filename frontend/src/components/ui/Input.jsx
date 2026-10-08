import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Input Component
 * Spec: Height 40px, Radius md (8px), Font sm (14px/20px)
 */
export function Input({
  className = '',
  disabled = false,
  error = false,
  ...props
}) {
  return (
    <input
      className={`h-10 px-3 bg-surface border ${
        error ? 'border-status-critical-border' : 'border-border'
      } rounded-md text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50 disabled:bg-surface-2 transition-colors ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}

/**
 * Select Component
 * Spec: Height 40px, Radius md (8px), Font sm (14px/20px)
 */
export function Select({
  options = [],
  children,
  className = '',
  disabled = false,
  ...props
}) {
  return (
    <div className="relative inline-block w-full">
      <select
        className={`h-10 w-full pl-3 pr-8 bg-surface border border-border rounded-md text-sm text-text-main appearance-none focus:outline-none focus:border-accent disabled:opacity-50 disabled:bg-surface-2 cursor-pointer transition-colors ${className}`}
        disabled={disabled}
        {...props}
      >
        {children
          ? children
          : options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
      </select>
      <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-3 pointer-events-none" />
    </div>
  );
}
