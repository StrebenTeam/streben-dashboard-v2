'use client';

import { calcDelta } from '@/lib/formatters';

export default function DeltaBadge({ current, prior, invert = false, suffix = '' }) {
  const d = calcDelta(current, prior);
  if (d == null) return <div className="metric-delta delta-neutral">N/A</div>;
  const isGood = invert ? d < 0 : d > 0;
  const cls = Math.abs(d) < 1 ? 'delta-neutral' : isGood ? 'delta-up' : 'delta-down';
  const arrow = d > 0 ? '\u2191' : d < 0 ? '\u2193' : '';
  return (
    <div className={'metric-delta ' + cls}>
      {arrow} {Math.abs(d).toFixed(1)}%{suffix}
    </div>
  );
}
