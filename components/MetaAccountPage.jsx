'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from './MetricCard';
import DeltaBadge from './DeltaBadge';
import { fmt, fmtCurrency } from '@/lib/formatters';

const tooltipStyle = { background: '#1a1d27', border: '1px solid #2e3246', borderRadius: 6, fontSize: 12 };

export default function MetaAccountPage({ metaAccountId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/meta/accounts/' + encodeURIComponent(metaAccountId) + '?weeks=12')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [metaAccountId]);

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!data) return <div className="empty-state">Error loading Meta account.</div>;

  const { account, snapshots, campaigns, campaignLatest, campaignPrior } = data;

  const chartData = snapshots.map(s => ({
    week: s.week_start.slice(5),
    spend: s.spend,
    leads: s.leads,
    clicks: s.clicks,
    cpl: s.cost_per_lead,
    lpv: s.landing_page_views
  }));

  const priorCampMap = {};
  (campaignPrior || []).forEach(c => { priorCampMap[c.campaign_id] = c; });

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : {};
  const prior = snapshots.length > 1 ? snapshots[snapshots.length - 2] : {};

  return (
    <>
      <div className="back-link" onClick={onBack}>{'\u2190'} Back to Overview</div>
      <div className="header">
        <h1>{(account.client_name || account.name) + ' '}</h1>
        <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', marginLeft: 8 }}>META ADS</span>
      </div>
      <div className="metrics-grid">
        <MetricCard label="Spend" value={fmtCurrency(latest.spend)} current={latest.spend} prior={prior.spend} />
        <MetricCard label="Leads" value={fmt(latest.leads)} current={latest.leads} prior={prior.leads} />
        <MetricCard label="Cost/Lead" value={latest.cost_per_lead ? fmtCurrency(latest.cost_per_lead) : 'N/A'} current={latest.cost_per_lead} prior={prior.cost_per_lead} invert={true} />
        <MetricCard label="Clicks" value={fmt(latest.clicks)} current={latest.clicks} prior={prior.clicks} />
        <MetricCard label="LPV" value={fmt(latest.landing_page_views)} current={latest.landing_page_views} prior={prior.landing_page_views} />
        <MetricCard label="CTR" value={latest.ctr ? latest.ctr.toFixed(2) + '%' : 'N/A'} />
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <div className="chart-title">Weekly Spend</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
              <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
              <YAxis stroke="#8b8fa3" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container">
          <div className="chart-title">Leads &amp; Cost/Lead</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
              <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
              <YAxis yAxisId="left" stroke="#8b8fa3" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="#8b8fa3" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line yAxisId="left" type="monotone" dataKey="leads" stroke="#8AC245" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="cpl" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign breakdown (all-time totals) */}
      {campaigns && campaigns.length > 0 && (
        <>
          <div className="section-title">Campaigns (All Time)</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Leads</th>
                  <th>CPL</th>
                  <th>CTR</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const cCtr = c.impressions > 0 ? (c.clicks / c.impressions * 100).toFixed(2) + '%' : 'N/A';
                  const statusColor = c.campaign_status === 'ACTIVE' ? '#8AC245' : '#8b8fa3';
                  return (
                    <tr key={c.campaign_id}>
                      <td>{c.campaign_name}</td>
                      <td>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px', color: statusColor }}>{c.campaign_status}</span>
                      </td>
                      <td>{fmtCurrency(c.spend)}</td>
                      <td>{fmt(c.impressions)}</td>
                      <td>{fmt(c.clicks)}</td>
                      <td>{fmt(c.leads)}</td>
                      <td>{c.cost_per_lead > 0 ? fmtCurrency(c.cost_per_lead) : 'N/A'}</td>
                      <td>{cCtr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Latest week campaign breakdown */}
      {campaignLatest && campaignLatest.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>
            Campaign Performance (Week of {snapshots.length > 0 ? snapshots[snapshots.length - 1].week_start : ''})
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Leads</th>
                  <th>CPL</th>
                  <th>vs Prior Week</th>
                </tr>
              </thead>
              <tbody>
                {campaignLatest.map(c => {
                  const priorC = priorCampMap[c.campaign_id];
                  const cpl = c.leads > 0 ? c.spend / c.leads : null;
                  return (
                    <tr key={c.campaign_id}>
                      <td>{c.campaign_name}</td>
                      <td>{fmtCurrency(c.spend)}</td>
                      <td>{fmt(c.impressions)}</td>
                      <td>{fmt(c.clicks)}</td>
                      <td>{fmt(c.leads)}</td>
                      <td>{cpl != null ? fmtCurrency(cpl) : 'N/A'}</td>
                      <td>{priorC ? <DeltaBadge current={c.leads} prior={priorC.leads} /> : 'N/A'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-title" style={{ marginTop: 16 }}>Weekly Breakdown</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Spend</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>Leads</th>
              <th>CPL</th>
              <th>LPV</th>
            </tr>
          </thead>
          <tbody>
            {[...snapshots].reverse().map(s => (
              <tr key={s.week_start}>
                <td>{s.week_start}</td>
                <td>{fmtCurrency(s.spend)}</td>
                <td>{fmt(s.impressions)}</td>
                <td>{fmt(s.clicks)}</td>
                <td>{s.ctr ? s.ctr.toFixed(2) + '%' : 'N/A'}</td>
                <td>{fmt(s.leads)}</td>
                <td>{s.cost_per_lead ? fmtCurrency(s.cost_per_lead) : 'N/A'}</td>
                <td>{fmt(s.landing_page_views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
