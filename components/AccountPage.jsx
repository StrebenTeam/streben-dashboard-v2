'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from './MetricCard';
import DeltaBadge from './DeltaBadge';
import { fmt, fmtCurrency, fmtPct } from '@/lib/formatters';
import { aggregateSourcesByCategory, categorizeSource } from '@/lib/sources';

const tooltipStyle = { background: '#1a1d27', border: '1px solid #2e3246', borderRadius: 6, fontSize: 12 };

export default function AccountPage({ accountId, ghlData, platformMap, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ads');
  const [metaData, setMetaData] = useState(null);

  const metaAccountId = platformMap && platformMap.googleToMeta ? platformMap.googleToMeta[accountId] : null;

  useEffect(() => {
    setLoading(true);
    fetch('/api/accounts/' + accountId + '?weeks=12')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    if (metaAccountId) {
      fetch('/api/meta/accounts/' + encodeURIComponent(metaAccountId) + '?weeks=12')
        .then(r => r.json())
        .then(d => setMetaData(d))
        .catch(() => {});
    }
  }, [metaAccountId]);

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!data) return <div className="empty-state">Error loading account.</div>;

  const { account, snapshots, campaigns, prior_campaigns } = data;
  const priorMap = {};
  (prior_campaigns || []).forEach(c => { priorMap[c.campaign_id] = c; });

  let ghlLoc = null;
  if (ghlData && ghlData.locations) {
    ghlLoc = ghlData.locations.find(l => l.googleAdsAccountId === accountId);
  }

  const chartData = snapshots.map(s => ({
    week: s.week_start.slice(5),
    spend: s.spend,
    clicks: s.clicks,
    conversions: s.conversions,
    cpa: s.conversions > 0 ? Math.round(s.spend / s.conversions * 100) / 100 : null
  }));

  const sourceData = ghlLoc ? aggregateSourcesByCategory(ghlLoc.contacts.sources) : null;
  const stageData = ghlLoc ? ghlLoc.pipeline.stages : null;

  return (
    <>
      <div className="back-link" onClick={onBack}>{'\u2190'} Back to Overview</div>
      <div className="header">
        <h1>{account.name}</h1>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <div className={'tab-item' + (activeTab === 'ads' ? ' active' : '')} onClick={() => setActiveTab('ads')}>
          Google Ads
        </div>
        {metaAccountId && (
          <div
            className={'tab-item' + (activeTab === 'meta' ? ' active' : '')}
            onClick={() => setActiveTab('meta')}
            style={activeTab === 'meta' ? { borderColor: '#3b82f6' } : {}}
          >
            Meta Ads
          </div>
        )}
        {ghlLoc && (
          <div className={'tab-item' + (activeTab === 'crm' ? ' active' : '')} onClick={() => setActiveTab('crm')}>
            CRM / Leads
          </div>
        )}
      </div>

      {/* Google Ads Tab */}
      {activeTab === 'ads' && (
        <>
          <div className="charts-grid">
            <div className="chart-container">
              <div className="chart-title">Weekly Spend</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
                  <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
                  <YAxis stroke="#8b8fa3" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="spend" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-container">
              <div className="chart-title">Conversions &amp; CPA</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
                  <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
                  <YAxis yAxisId="left" stroke="#8b8fa3" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" stroke="#8b8fa3" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line yAxisId="left" type="monotone" dataKey="conversions" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="cpa" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          {campaigns.length > 0 && (
            <>
              <div className="section-title">Campaigns</div>
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
                    {campaigns.map(c => {
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
            </>
          )}
        </>
      )}

      {/* Meta Ads Tab */}
      {activeTab === 'meta' && metaData && (() => {
        const ms = metaData.snapshots || [];
        const mLatest = ms.length > 0 ? ms[ms.length - 1] : {};
        const mPrior = ms.length > 1 ? ms[ms.length - 2] : {};
        const mChartData = ms.map(s => ({ week: s.week_start.slice(5), spend: s.spend, leads: s.leads, cpl: s.cost_per_lead }));
        const mCamps = metaData.campaigns || [];
        const mCampLatest = metaData.campaignLatest || [];
        const mCampPrior = metaData.campaignPrior || [];
        const mPriorMap = {};
        mCampPrior.forEach(c => { mPriorMap[c.campaign_id] = c; });

        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>META ADS</span>
            </div>
            <div className="metrics-grid">
              <MetricCard label="Meta Spend" value={fmtCurrency(mLatest.spend)} current={mLatest.spend} prior={mPrior.spend} />
              <MetricCard label="Meta Leads" value={fmt(mLatest.leads)} current={mLatest.leads} prior={mPrior.leads} />
              <MetricCard label="Cost/Lead" value={mLatest.cost_per_lead ? fmtCurrency(mLatest.cost_per_lead) : 'N/A'} current={mLatest.cost_per_lead} prior={mPrior.cost_per_lead} invert={true} />
              <MetricCard label="Clicks" value={fmt(mLatest.clicks)} current={mLatest.clicks} prior={mPrior.clicks} />
            </div>
            <div className="charts-grid">
              <div className="chart-container">
                <div className="chart-title">Meta Weekly Spend</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={mChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
                    <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
                    <YAxis stroke="#8b8fa3" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-container">
                <div className="chart-title">Meta Leads &amp; Cost/Lead</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={mChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e3246" />
                    <XAxis dataKey="week" stroke="#8b8fa3" fontSize={11} />
                    <YAxis yAxisId="left" stroke="#8b8fa3" fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" stroke="#8b8fa3" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line yAxisId="left" type="monotone" dataKey="leads" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="cpl" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {mCamps.length > 0 && (
              <>
                <div className="section-title">Meta Campaigns (All Time)</div>
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
                      {mCamps.map(c => {
                        const cCtr = c.impressions > 0 ? (c.clicks / c.impressions * 100).toFixed(2) + '%' : 'N/A';
                        const statusColor = c.campaign_status === 'ACTIVE' ? '#22c55e' : '#8b8fa3';
                        return (
                          <tr key={c.campaign_id}>
                            <td>{c.campaign_name}</td>
                            <td><span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px', color: statusColor }}>{c.campaign_status}</span></td>
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
            {mCampLatest.length > 0 && (
              <>
                <div className="section-title" style={{ marginTop: 16 }}>
                  Meta Campaign Performance (Week of {ms.length > 0 ? ms[ms.length - 1].week_start : ''})
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
                      {mCampLatest.map(c => {
                        const prior = mPriorMap[c.campaign_id];
                        const cpl = c.leads > 0 ? c.spend / c.leads : null;
                        return (
                          <tr key={c.campaign_id}>
                            <td>{c.campaign_name}</td>
                            <td>{fmtCurrency(c.spend)}</td>
                            <td>{fmt(c.impressions)}</td>
                            <td>{fmt(c.clicks)}</td>
                            <td>{fmt(c.leads)}</td>
                            <td>{cpl != null ? fmtCurrency(cpl) : 'N/A'}</td>
                            <td>{prior ? <DeltaBadge current={c.leads} prior={prior.leads} /> : 'N/A'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* CRM Tab */}
      {activeTab === 'crm' && ghlLoc && (
        <>
          <div className="crm-metrics-grid">
            <MetricCard label="Total Contacts" value={fmt(ghlLoc.contacts.total)} />
            <MetricCard label="Ad Leads" value={fmt(sourceData ? sourceData.google + sourceData['paid-search'] : 0)} />
            <MetricCard label="Organic" value={fmt(sourceData ? sourceData.organic : 0)} />
            <MetricCard label="Pipeline Total" value={fmt(ghlLoc.pipeline.total)} />
            <MetricCard label="Booked" value={fmt(stageData ? stageData['Booked'] || 0 : 0)} />
            <MetricCard label="Closed" value={fmt(stageData ? stageData['Closed'] || 0 : 0)} />
          </div>
          <div className="section-title">Lead Sources</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Count</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ghlLoc.contacts.sources || {}).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
                  const cat = categorizeSource(src);
                  return (
                    <tr key={src}>
                      <td>{src}</td>
                      <td>{fmt(count)}</td>
                      <td><span className={'source-badge source-' + cat}>{cat.replace(/-/g, ' ')}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="section-title" style={{ marginTop: 24 }}>Pipeline Breakdown</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stageData || {}).map(([stage, count]) => (
                  <tr key={stage}>
                    <td>{stage}</td>
                    <td>{fmt(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
