'use client';

import DeltaBadge from './DeltaBadge';

export default function MetricCard({ label, value, current, prior, invert }) {
  const isCurrency = typeof value === 'string' && (value.startsWith('$') || value.includes('$'));
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={isCurrency ? { color: 'var(--accent)' } : undefined}>{value}</div>
      {current != null ? <DeltaBadge current={current} prior={prior} invert={invert} /> : null}
    </div>
  );
}
