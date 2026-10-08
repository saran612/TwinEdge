import React from 'react';

/**
 * ProvenanceTag enforces H1:
 * Provenance tag on EVERY number: LIVE | REPLAY | MODEL | SIMULATED | STATIC | ASSUMED.
 */
export default function ProvenanceTag({ type = 'STATIC', size = 'xs' }) {
  const styles = {
    LIVE: 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60',
    REPLAY: 'bg-blue-950/80 text-blue-400 border-blue-700/60',
    MODEL: 'bg-indigo-950/80 text-indigo-400 border-indigo-700/60',
    SIMULATED: 'bg-amber-950/80 text-amber-400 border-amber-700/60',
    STATIC: 'bg-slate-800 text-slate-400 border-slate-700',
    ASSUMED: 'bg-purple-950/80 text-purple-400 border-purple-700/60',
  };

  const tagStyle = styles[type] || styles.STATIC;
  const sizeClass = 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center font-mono font-medium tracking-wider uppercase rounded border ${tagStyle} ${sizeClass}`}
      title={`Provenance: ${type}`}
    >
      {type}
    </span>
  );
}
