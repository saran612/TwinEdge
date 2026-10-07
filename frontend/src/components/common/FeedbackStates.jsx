import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

export function ErrorState({ title = 'Endpoint Unavailable', message, onRetry, className = '' }) {
  return (
    <div className={`p-8 rounded bg-rose-950/20 border border-rose-900/40 text-center flex flex-col items-center justify-center ${className}`}>
      <AlertOctagon className="w-8 h-8 text-rose-400 mb-2" />
      <h3 className="text-sm font-semibold text-rose-200">{title}</h3>
      {message && <p className="text-xs text-rose-300/80 mt-1 max-w-md">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-slate-900/60 border border-slate-800/80 rounded p-4 animate-pulse flex flex-col justify-between ${className}`}>
      <div className="h-3 bg-slate-800 rounded w-1/3 mb-4"></div>
      <div className="h-7 bg-slate-800 rounded w-2/3"></div>
    </div>
  );
}
