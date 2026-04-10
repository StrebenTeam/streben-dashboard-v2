'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from './MetricCard';
import { fmt } from '@/lib/formatters';
import { aggregateSourcesByCategory } from '@/lib/sources';

const tooltipStyle = { background: '#1a1d27', border: '1px solid #2e3246', borderRadius: 6, fontSize: 12 };

export default function LeadSourcesPage({ onSelectLocation }) {
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

  const chartData = locations.map(loc => {
    const agg = aggregateSourcesByCategory(loc.contacts.sources);
    return {
      name: loc.ghlLocationName.slice(0, 15),
      google: agg.google,
      'paid-search': agg['paid-search'],
      organic: agg.organic,
      direct: agg.direct,
      referral: agg.referral,
      other: agg.other
    };
  });

  return (
    <>
      <div className="crm-metrics-grid">
        <MetricCard label="Total Leads" value={fmt(totals.contacts)} />
        <MetricCard label="Google Ads" value={fmt(totals.googleAdsLeads)} />
        <MetricCard label="Organic" value={fmt(totals.organicLeads)} />
        <MetricCard label="Direct" value={fmt(totals.directLeads)} />
        <MetricCard label="Referral" value={fmt(totals.referralLeads)} />
      </div>
      <div className="section-title">Lead Sources by Location</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Total Contacts</th>
              <th>Google Ads</th>
              <th>Organic</th>
              <th>Direct</th>
              <th>Referral</th>
              <th>Other</th>
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => {
              const agg = aggregateSourcesByCategory(loc.contacts.sources);
              return (
                <tr key={loc.ghlLocationId} className="clickable" onClick={() => onSelectLocation(loc.ghlLocationId)}>
                  <td>{loc.ghlLocationName}</td>
                  <td>{fmt(loc.contacts.total)}</td>
                  <td>{fmt(agg.google)}</td>
                  <td>{fmt(agg.organic)}</td>
                  <td>{fmt(agg.direct)}</td>
                  <td>{fmt(agg.referral)}</td>
                  <td>{fmt(agg.other)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="chart-container">
        <div className="chart-title">Lead Source Distribution</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
            <XAxis type="number" stroke="#8b8fa3" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="#8b8fa3" fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="google" stackId="a" fill="#3b82f6" name="Google Ads" />
            <Bar dataKey="organic" stackId="a" fill="#8AC245" name="Organic" />
            <Bar dataKey="direct" stackId="a" fill="#f97316" name="Direct" />
            <Bar dataKey="referral" stackId="a" fill="#a855f7" name="Referral" />
            <Bar dataKey="paid-search" stackId="a" fill="#eab308" name="Paid Search" />
            <Bar dataKey="other" stackId="a" fill="#d1d5db" name="Other" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
