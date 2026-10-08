import React from 'react';

/**
 * Button Component
 * Spec:
 * Height: 40px (md), 32px (sm)
 * Radius: md (8px)
 * Font: sm (14px/20px), weight 500
 */
export function Button({
  children,
  variant = 'secondary', // 'primary' | 'secondary' | 'danger' | 'ghost'
  size = 'md', // 'md' | 'sm'
  className = '',
  disabled = false,
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent';

  const sizeClasses = {
    md: 'h-10 px-4 text-sm',
    sm: 'h-8 px-3 text-sm',
  };

  const variantClasses = {
    primary: 'bg-accent text-on-accent hover:opacity-90 active:opacity-95 shadow-xs font-semibold',
    secondary: 'bg-surface-2 border border-border text-text-main hover:bg-border/40 hover:text-text-main',
    danger: 'bg-status-critical-bg text-status-critical-text border border-status-critical-border hover:opacity-90',
    ghost: 'text-text-2 hover:bg-surface-2 hover:text-text-main',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.secondary} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * IconButton Component
 * Spec: Square aspect ratio (40x40 or 32x32) with radius md (8px).
 */
export function IconButton({
  children,
  variant = 'ghost',
  size = 'sm',
  className = '',
  ariaLabel,
  disabled = false,
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent shrink-0';

  const sizeClasses = {
    md: 'w-10 h-10',
    sm: 'w-8 h-8',
  };

  const variantClasses = {
    primary: 'bg-accent text-on-accent hover:opacity-90 active:opacity-95 shadow-xs font-semibold',
    secondary: 'bg-surface-2 border border-border text-text-main hover:bg-border/40 hover:text-text-main',
    danger: 'bg-status-critical-bg text-status-critical-text border border-status-critical-border hover:opacity-90',
    ghost: 'text-text-2 hover:bg-surface-2 hover:text-text-main',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.sm} ${variantClasses[variant] || variantClasses.ghost} ${className}`}
      aria-label={ariaLabel}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
export default Button;
