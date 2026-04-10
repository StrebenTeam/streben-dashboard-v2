'use client';

import DeltaBadge from './DeltaBadge';

export default function MetricCard({ label, value, current, prior, invert }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {current != null ? <DeltaBadge current={current} prior={prior} invert={invert} /> : null}
    </div>
  );
}
