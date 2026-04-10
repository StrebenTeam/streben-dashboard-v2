'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt, fmtCurrency, fmtPct } from '@/lib/formatters';
import { aggregateSourcesByCategory } from '@/lib/sources';

const tooltipStyle = { background: '#1a1d27', border: '1px solid #2e3246', borderRadius: 6, fontSize: 12 };

export default function GroupPage({ groupId, ghlData, onBack, onSelectAccount }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/groups/' + groupId + '?weeks=12')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [groupId]);

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!data) return <div className="empty-state">Error loading group.</div>;

  const { group, subAccounts, aggregatedSnapshots } = data;

  // Build GHL lookup for this group
  const ghlLookup = {};
  if (ghlData && ghlData.locations) {
    ghlData.locations.forEach(loc => {
      if (loc.googleAdsAccountId) {
        const adLeads = aggregateSourcesByCategory(loc.contacts.sources);
        ghlLookup[loc.googleAdsAccountId] = {
          adLeads: adLeads.google + adLeads['paid-search'],
          booked: loc.pipeline.stages['Booked'] || 0,
          totalContacts: loc.contacts.total,
          stages: loc.pipeline.stages
        };
      }
    });
  }

  const chartData = aggregatedSnapshots.map(s => ({
    week: s.week_start.slice(5),
    spend: s.spend,
    conversions: s.conversions,
    cpa: s.conversions > 0 ? Math.round(s.spend / s.conversions * 100) / 100 : null
  }));

  return (
    <>
      <div className="back-link" onClick={onBack}>{'\u2190'} Back to Overview</div>
      <div className="header">
        <h1>{group.name}</h1>
      </div>

      {/* Aggregated charts */}
      <div className="charts-grid">
        <div className="chart-container">
          <div className="chart-title">Weekly Spend (All Locations)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
              <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
              <YAxis stroke="#8b8fa3" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="spend" fill="#6EC1E4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container">
          <div className="chart-title">Conversions &amp; CPA (All Locations)</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
              <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
              <YAxis yAxisId="left" stroke="#8b8fa3" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="#8b8fa3" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line yAxisId="left" type="monotone" dataKey="conversions" stroke="#8AC245" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="cpa" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Location breakdown table */}
      <div className="section-title">Locations</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Spend</th>
              <th>Clicks</th>
              <th>Conv</th>
              <th>CPA</th>
              <th style={{ borderLeft: '2px solid #6EC1E4' }}>Ad Leads</th>
              <th>Booked</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {subAccounts.map(sa => {
              const latest = sa.snapshots.length > 0 ? sa.snapshots[sa.snapshots.length - 1] : {};
              const ghl = ghlLookup[sa.accountId] || {};
              const lCpa = latest.conversions > 0 ? latest.spend / latest.conversions : null;
              return (
                <tr key={sa.accountId} className="clickable" onClick={() => onSelectAccount(sa.accountId)}>
                  <td>{sa.label}</td>
                  <td>{fmtCurrency(latest.spend)}</td>
                  <td>{fmt(latest.clicks)}</td>
                  <td>{fmt(latest.conversions, 1)}</td>
                  <td>{lCpa != null ? fmtCurrency(lCpa) : 'N/A'}</td>
                  <td style={{ borderLeft: '2px solid #6EC1E4' }}>{fmt(ghl.adLeads || 0)}</td>
                  <td>{fmt(ghl.booked || 0)}</td>
                  <td>{fmt(ghl.stages ? ghl.stages['Closed'] || 0 : 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Campaigns per location */}
      {subAccounts.map(sa =>
        sa.campaigns.length > 0 ? (
          <div key={'camp-' + sa.accountId}>
            <div className="section-title" style={{ marginTop: 16 }}>{sa.label} Campaigns</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Strategy</th>
                    <th>Spend</th>
                    <th>Clicks</th>
                    <th>Conv</th>
                    <th>CPA</th>
                    <th>Search IS</th>
                    <th>Budget Lost IS</th>
                  </tr>
                </thead>
                <tbody>
                  {sa.campaigns.map(c => {
                    const cCpa = c.conversions > 0 ? c.spend / c.conversions : null;
                    return (
                      <tr key={c.campaign_id}>
                        <td>{c.campaign_name}</td>
                        <td>{(c.bid_strategy || '').replace(/_/g, ' ')}</td>
                        <td>{fmtCurrency(c.spend)}</td>
                        <td>{fmt(c.clicks)}</td>
                        <td>{fmt(c.conversions, 1)}</td>
                        <td>{cCpa != null ? fmtCurrency(cCpa) : 'N/A'}</td>
                        <td>{fmtPct(c.search_impression_share)}</td>
                        <td>{fmtPct(c.budget_lost_is)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}
    </>
  );
}
