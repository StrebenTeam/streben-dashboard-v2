'use client';

import MetricCard from './MetricCard';
import { fmt, fmtCurrency, fmtPct } from '@/lib/formatters';
import { aggregateSourcesByCategory } from '@/lib/sources';

export default function OverviewPage({ data, ghlData, accountGroups, metaOverview, platformMap, onSelectAccount, onSelectGroup, onSelectMetaAccount }) {
  if (!data || !data.current) {
    return (
      <div className="empty-state">
        <h3>No data available</h3>
        <p>Run a weekly review to populate the dashboard.</p>
      </div>
    );
  }

  const { current: c, prior: p, accounts, prior_accounts } = data;

  // Combine Google + Meta totals for summary cards
  const metaTotal = (metaOverview && metaOverview.accounts)
    ? metaOverview.accounts.reduce((s, a) => s + (a.spend || 0), 0) : 0;
  const metaTotalLeads = (metaOverview && metaOverview.accounts)
    ? metaOverview.accounts.reduce((s, a) => s + (a.leads || 0), 0) : 0;
  const combinedSpend = (c.spend || 0) + metaTotal;

  const priorMap = {};
  (prior_accounts || []).forEach(a => { priorMap[a.account_id] = a; });

  // Build GHL lookup
  const ghlLookup = {};
  if (ghlData && ghlData.locations) {
    ghlData.locations.forEach(loc => {
      if (loc.googleAdsAccountId) {
        const adLeads = aggregateSourcesByCategory(loc.contacts.sources);
        ghlLookup[loc.googleAdsAccountId] = {
          adLeads: adLeads.google + adLeads['paid-search'],
          booked: loc.pipeline.stages['Booked'] || 0,
          totalContacts: loc.contacts.total,
          pipeline: loc.pipeline
        };
      }
    });
  }

  // Build Meta lookup
  const metaLookup = {};
  const metaAccountsById = {};
  if (metaOverview && metaOverview.accounts) {
    metaOverview.accounts.forEach(ma => {
      metaAccountsById[ma.account_id] = ma;
    });
  }
  if (platformMap && platformMap.googleToMeta) {
    Object.entries(platformMap.googleToMeta).forEach(([googleId, metaId]) => {
      if (metaAccountsById[metaId]) {
        metaLookup[googleId] = metaAccountsById[metaId];
      }
    });
  }

  // Meta-only accounts
  const metaOnlyAccounts = [];
  if (platformMap && platformMap.metaOnly && metaOverview && metaOverview.accounts) {
    platformMap.metaOnly.forEach(metaId => {
      const ma = metaAccountsById[metaId];
      if (ma) metaOnlyAccounts.push(ma);
    });
  }

  // Build grouped account IDs set
  const groupedIds = new Set();
  Object.values(accountGroups || {}).forEach(g => {
    g.accountIds.forEach(id => groupedIds.add(id));
  });

  const standaloneAccounts = accounts.filter(a => !groupedIds.has(a.account_id));

  // Build grouped rows
  const groupRows = Object.entries(accountGroups || {}).map(([groupId, group]) => {
    const memberAccounts = accounts.filter(a => group.accountIds.includes(a.account_id));
    if (memberAccounts.length === 0) return null;

    const sumMetric = (key) => memberAccounts.reduce((s, a) => s + (a[key] || 0), 0);
    const totalSpend = sumMetric('spend');
    const totalClicks = sumMetric('clicks');
    const totalConversions = sumMetric('conversions');
    const totalImpressions = sumMetric('impressions');
    const avgSearchIS = memberAccounts.reduce((s, a) => s + (a.search_impression_share || 0), 0) / memberAccounts.length;

    let groupAdLeads = 0;
    let groupBooked = 0;
    memberAccounts.forEach(a => {
      const ghl = ghlLookup[a.account_id];
      if (ghl) {
        groupAdLeads += ghl.adLeads;
        groupBooked += ghl.booked;
      }
    });

    return {
      groupId,
      name: group.name,
      spend: totalSpend,
      clicks: totalClicks,
      conversions: totalConversions,
      impressions: totalImpressions,
      search_impression_share: avgSearchIS,
      adLeads: groupAdLeads,
      booked: groupBooked,
      members: memberAccounts
    };
  }).filter(Boolean);

  // Combine and sort all rows
  const allRows = [];
  standaloneAccounts.forEach(a => {
    const ghl = ghlLookup[a.account_id] || {};
    const meta = metaLookup[a.account_id];
    allRows.push({
      type: 'account',
      key: a.account_id,
      name: a.account_name,
      platform: meta ? 'google+meta' : 'google',
      spend: a.spend,
      clicks: a.clicks,
      conversions: a.conversions,
      impressions: a.impressions,
      search_impression_share: a.search_impression_share,
      adLeads: ghl.adLeads || 0,
      booked: ghl.booked || 0,
      metaSpend: meta ? meta.spend : 0,
      metaLeads: meta ? meta.leads : 0,
      metaClicks: meta ? meta.clicks : 0,
      accountId: a.account_id,
      prior: priorMap[a.account_id]
    });
  });

  groupRows.forEach(g => {
    let groupMetaSpend = 0;
    let groupMetaLeads = 0;
    let groupMetaClicks = 0;
    let hasMeta = false;
    g.members.forEach(m => {
      const meta = metaLookup[m.account_id];
      if (meta) {
        groupMetaSpend += meta.spend || 0;
        groupMetaLeads += meta.leads || 0;
        groupMetaClicks += meta.clicks || 0;
        hasMeta = true;
      }
    });
    allRows.push({
      type: 'group',
      key: g.groupId,
      name: g.name,
      platform: hasMeta ? 'google+meta' : 'google',
      spend: g.spend,
      clicks: g.clicks,
      conversions: g.conversions,
      impressions: g.impressions,
      search_impression_share: g.search_impression_share,
      adLeads: g.adLeads,
      booked: g.booked,
      metaSpend: groupMetaSpend,
      metaLeads: groupMetaLeads,
      metaClicks: groupMetaClicks,
      groupId: g.groupId,
      members: g.members
    });
  });

  // Add Google+Meta accounts where Google Ads had no data this period
  if (platformMap && platformMap.googleToMeta) {
    const existingGoogleIds = new Set(allRows.map(r => r.accountId || '').concat(
      allRows.filter(r => r.members).flatMap(r => r.members.map(m => m.account_id))
    ));
    Object.entries(platformMap.googleToMeta).forEach(([googleId, metaId]) => {
      if (!existingGoogleIds.has(googleId)) {
        const meta = metaAccountsById[metaId];
        if (meta) {
          let acctName = meta.client_name || meta.account_name || googleId;
          if (ghlData && ghlData.locations) {
            const loc = ghlData.locations.find(l => l.googleAdsAccountId === googleId);
            if (loc) acctName = loc.googleAdsAccountName || loc.ghlLocationName;
          }
          const ghl = ghlLookup[googleId] || {};
          allRows.push({
            type: 'account',
            key: googleId,
            name: acctName,
            platform: 'google+meta',
            spend: 0, clicks: 0, conversions: 0, impressions: 0,
            search_impression_share: null,
            adLeads: ghl.adLeads || 0,
            booked: ghl.booked || 0,
            metaSpend: meta.spend || 0,
            metaLeads: meta.leads || 0,
            metaClicks: meta.clicks || 0,
            accountId: googleId,
            prior: null
          });
        }
      }
    });
  }

  // Add Meta-only accounts
  metaOnlyAccounts.forEach(ma => {
    allRows.push({
      type: 'meta-account',
      key: 'meta-' + ma.account_id,
      name: ma.client_name || ma.account_name,
      platform: 'meta',
      spend: 0,
      clicks: 0,
      conversions: 0,
      impressions: 0,
      search_impression_share: null,
      adLeads: 0,
      booked: 0,
      metaSpend: ma.spend || 0,
      metaLeads: ma.leads || 0,
      metaClicks: ma.clicks || 0,
      metaAccountId: ma.account_id
    });
  });

  allRows.sort((a, b) => ((b.spend || 0) + (b.metaSpend || 0)) - ((a.spend || 0) + (a.metaSpend || 0)));

  const totalAdLeads = allRows.reduce((s, r) => s + (r.adLeads || 0), 0);
  const totalBooked = allRows.reduce((s, r) => s + (r.booked || 0), 0);

  return (
    <>
      <div className="metrics-grid">
        <MetricCard label="Total Spend" value={fmtCurrency(combinedSpend)} />
        <MetricCard label="Google Spend" value={fmtCurrency(c.spend)} current={c.spend} prior={p?.spend} />
        <MetricCard label="Meta Spend" value={fmtCurrency(metaTotal)} />
        <MetricCard label="Google Conv" value={fmt(c.conversions, 1)} current={c.conversions} prior={p?.conversions} />
        <MetricCard label="Meta Leads" value={fmt(metaTotalLeads)} />
        <MetricCard label="CRM Leads" value={fmt(totalAdLeads)} />
        <MetricCard label="Booked (CRM)" value={fmt(totalBooked)} />
      </div>
      <div className="section-title">Account Breakdown</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Platform</th>
              <th>Google Spend</th>
              <th>Meta Spend</th>
              <th>Total Spend</th>
              <th>Clicks</th>
              <th>Conv</th>
              <th>Meta Leads</th>
              <th>CPA</th>
              <th>Search IS</th>
              <th style={{ borderLeft: '2px solid #6EC1E4' }}>CRM Leads</th>
              <th>Booked</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map(row => {
              const totalSpend = (row.spend || 0) + (row.metaSpend || 0);
              const totalClicks = (row.clicks || 0) + (row.metaClicks || 0);
              const aCpa = row.conversions > 0 ? row.spend / row.conversions : null;
              const platformBadge = row.platform === 'google+meta' ? 'G + M'
                : row.platform === 'meta' ? 'Meta'
                : 'Google';
              const platformColor = row.platform === 'meta' ? '#3b82f6'
                : row.platform === 'google+meta' ? '#a855f7'
                : '#8AC245';

              const clickHandler = row.type === 'group'
                ? () => onSelectGroup(row.groupId)
                : row.type === 'meta-account'
                ? () => (onSelectMetaAccount ? onSelectMetaAccount(row.metaAccountId) : null)
                : () => onSelectAccount(row.accountId);

              return (
                <tr
                  key={row.key}
                  className={'clickable' + (row.type === 'group' ? ' group-row' : '')}
                  onClick={clickHandler}
                >
                  <td>{row.name + (row.type === 'group' ? ' (' + row.members.length + ' loc)' : '')}</td>
                  <td>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', color: platformColor }}>
                      {platformBadge}
                    </span>
                  </td>
                  <td>{row.spend > 0 ? fmtCurrency(row.spend) : '\u2014'}</td>
                  <td>{row.metaSpend > 0 ? fmtCurrency(row.metaSpend) : '\u2014'}</td>
                  <td style={{ fontWeight: 600 }}>{fmtCurrency(totalSpend)}</td>
                  <td>{fmt(totalClicks)}</td>
                  <td>{row.conversions > 0 ? fmt(row.conversions, 1) : '\u2014'}</td>
                  <td>{row.metaLeads > 0 ? fmt(row.metaLeads) : '\u2014'}</td>
                  <td>{aCpa != null ? fmtCurrency(aCpa) : '\u2014'}</td>
                  <td>{row.search_impression_share != null ? fmtPct(row.search_impression_share) : '\u2014'}</td>
                  <td style={{ borderLeft: '2px solid #6EC1E4' }}>{fmt(row.adLeads)}</td>
                  <td>{fmt(row.booked)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
