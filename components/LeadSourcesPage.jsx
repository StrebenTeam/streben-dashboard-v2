'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from './MetricCard';
import { fmt } from '@/lib/formatters';

const tooltipStyle = { background: '#111111', border: '1px solid #2A2A2A', borderRadius: 6, fontSize: 12 };

export default function LeadSourcesPage({ selectedRange, onSelectLocation }) {
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

  const chartData = locations
    .filter(loc => {
      const c = loc.contacts;
      return (c.total || c.googleAds || c.google || 0) > 0;
    })
    .map(loc => {
      const c = loc.contacts;
      return {
        name: loc.ghlLocationName.replace(/^(Push Fitness Club of |The )/, '').slice(0, 18),
        'Google Ads': c.googleAds || c.google || 0,
        'Meta': c.meta || 0,
        'Paid Search': c.paidSearch || 0,
        'Organic': c.organic || 0,
        'Direct': c.direct || 0,
        'Referral': c.referral || 0,
        'Other': c.other || 0,
      };
    });

  const adTotal = (totals.googleAdsLeads || 0) + (totals.metaLeads || 0) + (totals.paidSearchLeads || 0);

  return (
    <>
      <div className="crm-metrics-grid">
        <MetricCard label="Total Leads" value={fmt(totals.contacts)}
          current={totals.contacts} prior={totals.priorContacts} />
        <MetricCard label="Google Ads" value={fmt(totals.googleAdsLeads)} />
        <MetricCard label="Meta" value={fmt(totals.metaLeads || 0)} />
        <MetricCard label="Paid Search" value={fmt(totals.paidSearchLeads || 0)} />
        <MetricCard label="Organic" value={fmt(totals.organicLeads)} />
        <MetricCard label="Ad Leads Total" value={fmt(adTotal)} />
      </div>

      <div className="section-title">Lead Sources by Location</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Total</th>
              <th>Google Ads</th>
              <th>Meta</th>
              <th>Paid Search</th>
              <th>Organic</th>
              <th>Direct</th>
              <th>Other</th>
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => {
              const c = loc.contacts;
              const total = c.total || 0;
              if (total === 0 && !isSnapshot) return null;
              return (
                <tr key={loc.ghlLocationId} className="clickable" onClick={() => onSelectLocation(loc.ghlLocationId)}>
                  <td>{loc.ghlLocationName}</td>
                  <td>{fmt(total)}</td>
                  <td>{fmt(c.googleAds || c.google || 0)}</td>
                  <td>{fmt(c.meta || 0)}</td>
                  <td>{fmt(c.paidSearch || 0)}</td>
                  <td>{fmt(c.organic || 0)}</td>
                  <td>{fmt(c.direct || 0)}</td>
                  <td>{fmt(c.other || 0)}</td>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
            <XAxis type="number" stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="Google Ads" stackId="a" fill="#6EC1E4" />
            <Bar dataKey="Meta" stackId="a" fill="#3b82f6" />
            <Bar dataKey="Paid Search" stackId="a" fill="#eab308" />
            <Bar dataKey="Organic" stackId="a" fill="#8AC245" />
            <Bar dataKey="Direct" stackId="a" fill="#f97316" />
            <Bar dataKey="Referral" stackId="a" fill="#a855f7" />
            <Bar dataKey="Other" stackId="a" fill="rgba(255,255,255,0.2)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
