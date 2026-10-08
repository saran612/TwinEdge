import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';

/**
 * Drawer Component
 * Spec: Radius lg (12px), background surface, border border.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  width = 'max-w-xl',
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-bg-app/80 backdrop-blur-xs flex justify-end">
      <div
        className={`w-full ${width} bg-surface border-l border-border h-full flex flex-col shadow-xl animate-in slide-in-from-right duration-200`}
      >
        <div className="h-16 px-6 border-b border-border flex items-center justify-between bg-surface-2/40">
          <h2 className="text-base font-semibold text-text-main truncate">
            {title}
          </h2>
          <IconButton
            onClick={onClose}
            ariaLabel="Close drawer"
            size="sm"
          >
            <X className="w-4 h-4 text-text-2" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Modal Component
 * Spec: Radius lg (12px), padding 24px, background surface, border border.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-app/80 backdrop-blur-xs">
      <div
        className={`bg-surface border border-border rounded-lg ${maxWidth} w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col`}
      >
        {title && (
          <div className="h-14 px-6 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-main">
              {title}
            </h3>
            <IconButton
              onClick={onClose}
              ariaLabel="Close modal"
              size="sm"
            >
              <X className="w-4 h-4 text-text-2" />
            </IconButton>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
