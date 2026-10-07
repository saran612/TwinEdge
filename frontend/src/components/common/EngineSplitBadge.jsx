import React from 'react';

/**
 * EngineSplitBadge enforces Rule H4:
 * Split badge: TEST (truncated, final RUL known) | HELD-OUT VALIDATION (full run to failure) | SEEN IN TRAINING
 */
export default function EngineSplitBadge({ split = 'HELD-OUT VALIDATION', size = 'xs' }) {
  const norm = (split || '').toUpperCase();

  const styles = {
    'HELD-OUT VALIDATION': {
      bg: 'bg-emerald-950/70 border-emerald-700/80 text-emerald-300',
      label: 'HELD-OUT VAL',
      title: 'Held-out validation engine (full run to failure from training split)',
    },
    'TEST': {
      bg: 'bg-blue-950/70 border-blue-700/80 text-blue-300',
      label: 'TEST',
      title: 'NASA C-MAPSS test engine (truncated profile, true final RUL known)',
    },
    'SEEN IN TRAINING': {
      bg: 'bg-purple-950/70 border-purple-700/80 text-purple-300',
      label: 'SEEN IN TRAIN',
      title: 'Engine seen during model gradient descent training',
    },
  };

  const style = styles[norm] || styles['HELD-OUT VALIDATION'];
  const sizeClasses = size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded border uppercase tracking-wider ${style.bg} ${sizeClasses}`}
      title={style.title}
    >
      {style.label}
    </span>
  );
}
