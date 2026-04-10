'use client';

import { useState, useEffect } from 'react';

export default function IntelligencePage() {
  const [tab, setTab] = useState('alerts');
  const [alerts, setAlerts] = useState(null);
  const [health, setHealth] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [synthesis, setSynthesis] = useState(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [synthError, setSynthError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [expandedAlert, setExpandedAlert] = useState(null);
  const [expandedAccount, setExpandedAccount] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/intelligence/alerts').then(r => r.json()),
      fetch('/api/intelligence/health').then(r => r.json()),
      fetch('/api/intelligence/portfolio').then(r => r.json()),
    ]).then(([a, h, p]) => {
      setAlerts(a);
      setHealth(h);
      setPortfolio(p);
      setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading intelligence data...</div>;

  const sevColors = { critical: '#ef4444', warning: '#f59e0b', opportunity: '#22c55e', info: '#3b82f6' };
  const sevBg = { critical: 'rgba(239,68,68,0.06)', warning: 'rgba(245,158,11,0.06)', opportunity: 'rgba(34,197,94,0.06)', info: 'rgba(59,130,246,0.06)' };
  const gradeColors = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

  // Tab bar
  const tabBar = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', borderRadius: 8, padding: 4 }}>
      {['alerts', 'health', 'portfolio', 'synthesis'].map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          style={{
            flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6,
            border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--accent)' : 'transparent',
            color: tab === t ? '#fff' : 'var(--text-dim)',
            transition: 'all 0.15s',
          }}
        >
          {t === 'alerts' ? 'Alerts (' + (alerts ? alerts.alerts.length : 0) + ')'
           : t === 'health' ? 'Account Health'
           : t === 'portfolio' ? 'Portfolio'
           : 'AI Insights'}
        </button>
      ))}
    </div>
  );

  // ALERTS TAB
  const alertsTab = (() => {
    if (!alerts) return null;
    const sevCounts = { critical: 0, warning: 0, opportunity: 0 };
    alerts.alerts.forEach(a => { if (sevCounts[a.severity] !== undefined) sevCounts[a.severity]++; });
    const filtered = alerts.alerts.filter(a => {
      if (filter !== 'all' && a.severity !== filter) return false;
      if (platformFilter !== 'all' && a.platform !== platformFilter) return false;
      return true;
    });
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {Object.entries(sevCounts).map(([sev, count]) => (
            <div
              key={sev}
              onClick={() => setFilter(filter === sev ? 'all' : sev)}
              style={{
                flex: '1 1 140px', padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                background: filter === sev ? sevColors[sev] + '22' : 'var(--surface)',
                border: '1px solid ' + (filter === sev ? sevColors[sev] : 'var(--border)'),
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{sev}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: sevColors[sev] }}>{count}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Week of {alerts.latest_week || ''} vs {alerts.prior_week || ''} | {alerts.accounts_analyzed} accounts | {alerts.alerts.length} alerts
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['all', 'google', 'meta'].map(p => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)',
                background: platformFilter === p ? 'var(--accent)' : 'transparent',
                color: platformFilter === p ? '#fff' : 'var(--text-dim)', cursor: 'pointer',
              }}
            >
              {p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {filtered.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>No alerts match the current filter.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((a, i) => {
                const isExp = expandedAlert === i;
                return (
                  <div
                    key={i}
                    onClick={() => setExpandedAlert(isExp ? null : i)}
                    style={{
                      background: sevBg[a.severity] || 'var(--surface)',
                      border: '1px solid ' + (sevColors[a.severity] || 'var(--border)') + '33',
                      borderLeft: '3px solid ' + (sevColors[a.severity] || 'var(--border)'),
                      borderRadius: 8, padding: '12px 16px', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: sevColors[a.severity], background: (sevColors[a.severity] || '') + '22', padding: '2px 8px', borderRadius: 4 }}>{a.severity}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.accountName}</span>
                      <span style={{ fontSize: 10, color: a.platform === 'google' ? '#4285f4' : '#1877f2', background: a.platform === 'google' ? 'rgba(66,133,244,0.1)' : 'rgba(24,119,242,0.1)', padding: '2px 6px', borderRadius: 4 }}>{a.platform}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{a.vertical}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginTop: 6 }}>{a.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>{a.description}</div>
                    {isExp && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--green)', marginBottom: 6 }}>Recommended Action:</div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{a.action}</div>
                        {a.metric && (
                          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                            <span style={{ color: 'var(--text-dim)' }}>Metric: <span style={{ color: 'var(--text)' }}>{a.metric}</span></span>
                            <span style={{ color: 'var(--text-dim)' }}>Value: <span style={{ color: sevColors[a.severity] }}>
                              {typeof a.value === 'number' ? (a.value < 1 ? (a.value * 100).toFixed(1) + '%' : '$' + a.value.toFixed(2)) : a.value}
                            </span></span>
                            {a.benchmark && (
                              <span style={{ color: 'var(--text-dim)' }}>Benchmark: <span style={{ color: 'var(--text)' }}>
                                {typeof a.benchmark === 'number' ? (a.benchmark < 1 ? (a.benchmark * 100).toFixed(1) + '%' : '$' + a.benchmark.toFixed(2)) : a.benchmark}
                              </span></span>
                            )}
                          </div>
                        )}
                        {a.campaignName && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>Campaign: {a.campaignName}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    );
  })();

  // HEALTH TAB
  const healthTab = (() => {
    if (!health) return null;
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {health.accounts.filter(a => a.healthScore && a.healthScore.score !== null).map(a => {
            const gc = gradeColors[a.healthScore.grade] || 'var(--text-dim)';
            const isExp = expandedAccount === a.accountId;
            return (
              <div
                key={a.accountId}
                onClick={() => setExpandedAccount(isExp ? null : a.accountId)}
                style={{
                  flex: '1 1 280px', padding: 16, borderRadius: 10, cursor: 'pointer',
                  background: 'var(--surface)', border: '1px solid ' + (isExp ? gc : 'var(--border)'),
                  borderTop: '3px solid ' + gc,
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.accountName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.verticalLabel} | {a.weeksOfData || 0} weeks</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: gc }}>{a.healthScore.grade}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.healthScore.score}/100</div>
                  </div>
                </div>
                {/* Score bar */}
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: a.healthScore.score + '%', background: gc, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                {/* Expanded breakdown */}
                {isExp && (
                  <div style={{ marginTop: 12 }}>
                    {Object.entries(a.healthScore.breakdown).map(([key, val]) => {
                      const labels = { cpl: 'Cost/Lead', convRate: 'Conv Rate', impressionShare: 'Impression Share', ctr: 'CTR', cpc: 'CPC', momentum: 'Momentum' };
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 100, fontSize: 11, color: 'var(--text-dim)' }}>{labels[key] || key}</div>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: val + '%', borderRadius: 3, background: val >= 70 ? '#22c55e' : val >= 40 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <div style={{ width: 30, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>{val}</div>
                        </div>
                      );
                    })}
                    {/* Trend insights */}
                    {(a.trends.insights.length > 0 || a.metaTrends.insights.length > 0) && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Trend Insights</div>
                        {a.trends.insights.map((ins, idx) => (
                          <div
                            key={'g' + idx}
                            style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, paddingLeft: 10, borderLeft: '2px solid ' + (ins.direction === 'improving' || ins.direction === 'falling' || ins.direction === 'growing' ? '#22c55e' : ins.type === 'plateau' ? '#f59e0b' : '#ef4444') }}
                          >
                            <div style={{ fontWeight: 500, color: 'var(--text)' }}>{ins.title}</div>
                            <div style={{ marginTop: 2 }}>{ins.description}</div>
                            <div style={{ marginTop: 4, color: '#22c55e', fontSize: 11 }}>{ins.action}</div>
                          </div>
                        ))}
                        {a.metaTrends.insights.map((ins, idx) => (
                          <div
                            key={'m' + idx}
                            style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, paddingLeft: 10, borderLeft: '2px solid #1877f2' }}
                          >
                            <div style={{ fontWeight: 500, color: 'var(--text)' }}>[Meta] {ins.title}</div>
                            <div style={{ marginTop: 2 }}>{ins.description}</div>
                            <div style={{ marginTop: 4, color: '#22c55e', fontSize: 11 }}>{ins.action}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  // PORTFOLIO TAB
  const portfolioTab = (() => {
    if (!portfolio) return null;
    const s = portfolio.summary;
    const subtypeColors = { scale_opportunity: '#22c55e', efficiency_concern: '#ef4444', positive_momentum: '#22c55e', negative_momentum: '#f59e0b' };
    const subtypeLabels = { scale_opportunity: 'Scale', efficiency_concern: 'Concern', positive_momentum: 'Rising', negative_momentum: 'Declining' };
    return (
      <div>
        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 150px', padding: '14px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Weekly Spend</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>${s.total_weekly_spend.toFixed(0)}</div>
          </div>
          <div style={{ flex: '1 1 150px', padding: '14px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Avg Health Score</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.average_health_score >= 60 ? '#22c55e' : s.average_health_score >= 40 ? '#f59e0b' : '#ef4444' }}>{s.average_health_score || 'N/A'}</div>
          </div>
          <div style={{ flex: '1 1 150px', padding: '14px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Healthy (65+)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{s.accounts_above_65}</div>
          </div>
          <div style={{ flex: '1 1 150px', padding: '14px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>At Risk (&lt;40)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{s.accounts_below_40}</div>
          </div>
        </div>
        {/* Portfolio insights */}
        {portfolio.insights.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Portfolio Recommendations</div>
            {portfolio.insights.map((ins, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px', marginBottom: 8, borderRadius: 8,
                  background: (subtypeColors[ins.subtype] || 'var(--accent)') + '0a',
                  borderLeft: '3px solid ' + (subtypeColors[ins.subtype] || 'var(--accent)'),
                  border: '1px solid ' + (subtypeColors[ins.subtype] || 'var(--border)') + '33',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: subtypeColors[ins.subtype], background: (subtypeColors[ins.subtype] || '') + '22', padding: '2px 8px', borderRadius: 4 }}>{subtypeLabels[ins.subtype] || ins.subtype}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ins.accountName}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{ins.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>{ins.description}</div>
                <div style={{ fontSize: 12, color: '#22c55e', marginTop: 6 }}>{ins.action}</div>
              </div>
            ))}
          </div>
        )}
        {/* Account ranking table */}
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Account Rankings</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Account', 'Vertical', 'Health', 'Grade', 'Weekly Spend', 'Weeks', 'Trends'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.accounts.sort((a, b) => (b.healthScore ? b.healthScore.score : -1) - (a.healthScore ? a.healthScore.score : -1)).map(a => {
                const gc = a.healthScore ? gradeColors[a.healthScore.grade] || 'var(--text-dim)' : 'var(--text-dim)';
                return (
                  <tr key={a.accountId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 500 }}>{a.accountName}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{a.vertical}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {a.healthScore && a.healthScore.score !== null
                        ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: a.healthScore.score + '%', background: gc, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, color: gc }}>{a.healthScore.score}</span>
                          </div>
                        )
                        : <span style={{ color: 'var(--text-dim)' }}>N/A</span>
                      }
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 16, color: gc }}>{a.healthScore ? a.healthScore.grade : ''}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>${(a.weeklySpend || 0).toFixed(0)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{a.weeksOfData}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{a.trendCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  })();

  // AI INSIGHTS TAB
  const synthesisTab = (() => {
    const loadSynthesis = () => {
      setSynthLoading(true);
      setSynthError(null);
      fetch('/api/intelligence/synthesis?type=digest')
        .then(r => r.json())
        .then(data => {
          if (data.error) { setSynthError(data.error); setSynthLoading(false); return; }
          setSynthesis(data.digest);
          setSynthLoading(false);
        })
        .catch(e => { setSynthError(e.message); setSynthLoading(false); });
    };

    if (!synthesis && !synthLoading && !synthError) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>AI-Powered Insights</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            Generate a comprehensive analysis of your entire portfolio using AI. This synthesizes health scores, trend data, and alerts into actionable narrative insights.
          </p>
          <button
            onClick={loadSynthesis}
            style={{ padding: '12px 32px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}
          >
            Generate Insights
          </button>
        </div>
      );
    }

    if (synthLoading) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'pulse 1.5s infinite' }}>🧠</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>Generating AI insights... This takes a few seconds.</div>
        </div>
      );
    }

    if (synthError) {
      return (
        <div style={{ padding: 24 }}>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Synthesis Error</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{synthError}</div>
            <button
              onClick={loadSynthesis}
              style={{ marginTop: 12, padding: '8px 20px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (!synthesis) return null;
    const d = synthesis;

    return (
      <div>
        {/* Headline */}
        <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', borderRadius: 12, padding: '20px 24px', marginBottom: 20, border: '1px solid rgba(99,102,241,0.15)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{d.headline || 'Weekly Digest'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>{d.portfolio_summary || ''}</div>
        </div>

        {/* Wins + Concerns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>Wins</div>
            {(d.wins || []).map((w, i) => (
              <div key={'w' + i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, paddingLeft: 8, borderLeft: '2px solid #22c55e', lineHeight: 1.5 }}>{w}</div>
            ))}
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>Concerns</div>
            {(d.concerns || []).map((c, i) => (
              <div key={'c' + i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, paddingLeft: 8, borderLeft: '2px solid #f59e0b', lineHeight: 1.5 }}>{c}</div>
            ))}
          </div>
        </div>

        {/* Action Items */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>Action Items This Week</div>
          {(d.actions || []).map((a, i) => (
            <div key={'a' + i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, padding: '8px 12px', background: 'rgba(99,102,241,0.04)', borderRadius: 6, lineHeight: 1.5 }}>{(i + 1) + '. ' + a}</div>
          ))}
        </div>

        {/* Account Briefs */}
        {d.account_briefs && d.account_briefs.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Account Briefs</div>
            {d.account_briefs.map((ab, i) => {
              const gc = ab.grade === 'A' ? '#22c55e' : ab.grade === 'B' ? '#84cc16' : ab.grade === 'C' ? '#f59e0b' : ab.grade === 'D' ? '#f97316' : '#ef4444';
              return (
                <div key={'ab' + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < d.account_briefs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: gc, minWidth: 24 }}>{ab.grade || ''}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ab.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.5 }}>{ab.brief}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Regenerate button */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => { setSynthesis(null); setSynthError(null); }}
            style={{ padding: '8px 20px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer' }}
          >
            Regenerate Insights
          </button>
        </div>
      </div>
    );
  })();

  return (
    <div style={{ padding: '24px 32px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Intelligence</h1>
      {tabBar}
      {tab === 'alerts' && alertsTab}
      {tab === 'health' && healthTab}
      {tab === 'portfolio' && portfolioTab}
      {tab === 'synthesis' && synthesisTab}
    </div>
  );
}
