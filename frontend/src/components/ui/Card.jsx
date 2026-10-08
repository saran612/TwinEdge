import React from 'react';

/**
 * Card Component
 * Spec: Radius lg (12px), Padding 20px (p-5), Border border, Surface surface
 */
export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-surface border border-border rounded-lg p-5 flex flex-col justify-between shadow-xs ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * CardHeader Component
 * Spec: Height 48px, title base/600 + divider
 */
export function CardHeader({ title, action, children, className = '' }) {
  return (
    <div
      className={`h-12 border-b border-border flex items-center justify-between gap-3 -mx-5 -mt-5 px-5 mb-5 ${className}`}
    >
      {title ? (
        <h3 className="text-base font-semibold text-text-main truncate">
          {title}
        </h3>
      ) : children}
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
