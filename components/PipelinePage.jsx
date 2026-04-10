'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from './MetricCard';
import { fmt, fmtPct } from '@/lib/formatters';

const tooltipStyle = { background: '#1a1d27', border: '1px solid #2e3246', borderRadius: 6, fontSize: 12 };

export default function PipelinePage({ onSelectLocation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ghl/overview')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, []);

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!data || !data.locations) return <div className="empty-state">No CRM data available</div>;

  const { locations, totals } = data;
  const calculateBookRate = (totalLeads, booked) => totalLeads > 0 ? (booked / totalLeads) : 0;

  const chartData = locations.map(loc => ({
    name: loc.ghlLocationName.slice(0, 15),
    'New Lead': loc.pipeline.stages['New Lead'] || 0,
    'Contacted': loc.pipeline.stages['Contacted'] || 0,
    'Opportunity': loc.pipeline.stages['Opportunity'] || 0,
    'Booked': loc.pipeline.stages['Booked'] || 0,
    'Closed': loc.pipeline.stages['Closed'] || 0
  }));

  return (
    <>
      <div className="crm-metrics-grid">
        <MetricCard label="Total in Pipeline" value={fmt(totals.totalPipeline)} />
        <MetricCard label="Booked" value={fmt(totals.booked)} />
        <MetricCard label="Closed" value={fmt(totals.closed)} />
        <MetricCard label="Bad Leads" value={fmt(totals.badLeads)} />
        <MetricCard label="Book Rate" value={fmtPct(calculateBookRate(totals.totalPipeline, totals.booked))} />
      </div>
      <div className="section-title">Pipeline Stages by Location</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>New Lead</th>
              <th>Contacted</th>
              <th>Opportunity</th>
              <th>Booked</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => (
              <tr key={loc.ghlLocationId} className="clickable" onClick={() => onSelectLocation(loc.ghlLocationId)}>
                <td>{loc.ghlLocationName}</td>
                <td>{fmt(loc.pipeline.stages['New Lead'] || 0)}</td>
                <td>{fmt(loc.pipeline.stages['Contacted'] || 0)}</td>
                <td>{fmt(loc.pipeline.stages['Opportunity'] || 0)}</td>
                <td>{fmt(loc.pipeline.stages['Booked'] || 0)}</td>
                <td>{fmt(loc.pipeline.stages['Closed'] || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="chart-container">
        <div className="chart-title">Pipeline Funnel by Location</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
            <XAxis type="number" stroke="#8b8fa3" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="#8b8fa3" fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="New Lead" fill="#6366f1" name="New Lead" />
            <Bar dataKey="Contacted" fill="#3b82f6" name="Contacted" />
            <Bar dataKey="Opportunity" fill="#eab308" name="Opportunity" />
            <Bar dataKey="Booked" fill="#22c55e" name="Booked" />
            <Bar dataKey="Closed" fill="#a855f7" name="Closed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
