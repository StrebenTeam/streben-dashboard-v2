'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from './MetricCard';
import { fmt, fmtPct } from '@/lib/formatters';

const tooltipStyle = { background: '#111111', border: '1px solid #2A2A2A', borderRadius: 6, fontSize: 12 };

function fmtDollar(v) {
  if (v == null || v === 0) return '$0';
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function PipelinePage({ selectedRange, onSelectLocation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = selectedRange
      ? `/api/ghl/snapshots?range=${selectedRange}`
      : '/api/ghl/overview';
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [selectedRange]);

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!data || !data.locations) return <div className="empty-state">No CRM data available</div>;

  const { locations, totals } = data;
  const isSnapshot = data.source === 'turso';

  const adRevenue = (totals.closedRevenueGoogleAds || 0) + (totals.closedRevenueMeta || 0) + (totals.closedRevenuePaidSearch || 0);

  const chartData = locations
    .filter(loc => loc.pipeline && loc.pipeline.total > 0)
    .map(loc => ({
      name: loc.ghlLocationName.replace(/^(Push Fitness Club of |The )/, '').slice(0, 18),
      'New Lead': loc.pipeline.stages['New Lead'] || 0,
      'Contacted': loc.pipeline.stages['Contacted'] || 0,
      'Booked': loc.pipeline.stages['Booked'] || 0,
      'Closed': loc.pipeline.stages['Closed'] || 0,
      'Bad Lead': loc.pipeline.stages['Bad Lead'] || 0,
    }));

  return (
    <>
      <div className="crm-metrics-grid">
        <MetricCard label="Total in Pipeline" value={fmt(totals.totalPipeline)} />
        <MetricCard label="Booked" value={fmt(totals.booked)}
          current={totals.booked} prior={totals.priorBooked} />
        <MetricCard label="Closed" value={fmt(totals.closed)}
          current={totals.closed} prior={totals.priorClosed} />
        <MetricCard label="Closed Revenue" value={fmtDollar(totals.closedValue)}
          current={totals.closedValue} prior={totals.priorClosedValue} />
        <MetricCard label="Ad Revenue" value={fmtDollar(adRevenue)} />
        <MetricCard label="Bad Leads" value={fmt(totals.badLeads)} />
      </div>

      {isSnapshot && adRevenue > 0 && (
        <>
          <div className="section-title">Closed Revenue by Ad Source</div>
          <div className="crm-metrics-grid" style={{ marginBottom: 24 }}>
            <MetricCard label="Google Ads Revenue" value={fmtDollar(totals.closedRevenueGoogleAds)} />
            <MetricCard label="Meta Revenue" value={fmtDollar(totals.closedRevenueMeta)} />
            <MetricCard label="Paid Search Revenue" value={fmtDollar(totals.closedRevenuePaidSearch)} />
          </div>
        </>
      )}

      <div className="section-title">Pipeline by Location</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>New Lead</th>
              <th>Booked</th>
              <th>Closed</th>
              <th>Bad Lead</th>
              {isSnapshot && <th>Closed $</th>}
              {isSnapshot && <th>Ad Revenue</th>}
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => {
              if (!loc.pipeline || loc.pipeline.total === 0) return null;
              const stages = loc.pipeline.stages;
              const rev = loc.revenue || {};
              const locAdRev = (rev.googleAds || 0) + (rev.meta || 0) + (rev.paidSearch || 0);
              return (
                <tr key={loc.ghlLocationId} className="clickable" onClick={() => onSelectLocation(loc.ghlLocationId)}>
                  <td>{loc.ghlLocationName}</td>
                  <td>{fmt(stages['New Lead'] || 0)}</td>
                  <td>{fmt(stages['Booked'] || 0)}</td>
                  <td>{fmt(stages['Closed'] || 0)}</td>
                  <td>{fmt(stages['Bad Lead'] || 0)}</td>
                  {isSnapshot && <td style={{ color: '#8AC245' }}>{fmtDollar(rev.closedValue)}</td>}
                  {isSnapshot && <td style={{ color: '#6EC1E4' }}>{fmtDollar(locAdRev)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="chart-container">
        <div className="chart-title">Pipeline Funnel by Location</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
            <XAxis type="number" stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="New Lead" fill="#6EC1E4" />
            <Bar dataKey="Booked" fill="#8AC245" />
            <Bar dataKey="Closed" fill="#eab308" />
            <Bar dataKey="Bad Lead" fill="#E54D4D" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
