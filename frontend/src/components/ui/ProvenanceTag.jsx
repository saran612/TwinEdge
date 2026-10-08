import React from 'react';

/**
 * ProvenanceTag Component
 * Spec: ONE neutral outlined chip style for ALL provenance tags
 * (MODEL, LIVE, REPLAY, DERIVED, SIMULATED, STATIC, ASSUMED).
 * border + text-2, xs/600, radius sm (6px).
 * Label carries the meaning, color does not.
 */
export function ProvenanceTag({ type = 'STATIC', className = '' }) {
  const norm = String(type).toUpperCase();

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border border-border text-text-2 text-xs font-semibold uppercase tracking-wide select-none ${className}`}
      title={`Data Provenance: ${norm}`}
    >
      {norm}
    </span>
  );
}
export default ProvenanceTag;
