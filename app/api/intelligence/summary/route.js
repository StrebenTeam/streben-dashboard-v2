import { query, queryOne } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';
import { runRules } from '@/lib/rule-engine';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET() {
  try {
    if (!ghlConfig) {
      return Response.json({ total_alerts: 0, by_severity: {}, by_platform: {}, accounts_with_critical: [] });
    }

    const locations = ghlConfig.getAllLocations();
    const latestWeekRow = await queryOne('SELECT week_start FROM weekly_snapshots ORDER BY week_start DESC LIMIT 1');
    if (!latestWeekRow) {
      return Response.json({ total_alerts: 0, by_severity: {}, by_platform: {}, accounts_with_critical: [] });
    }

    const latestWeek = latestWeekRow.week_start;
    const latestDate = new Date(latestWeek + 'T00:00:00Z');
    const priorDate = new Date(latestDate);
    priorDate.setUTCDate(priorDate.getUTCDate() - 7);
    const priorWeek = priorDate.toISOString().split('T')[0];

    let totalAlerts = 0;
    const bySeverity = { critical: 0, warning: 0, opportunity: 0, info: 0 };
    const byPlatform = { google: 0, meta: 0 };
    const accountsWithCritical = [];

    for (const loc of locations) {
      if (!loc.googleAdsAccountId && !loc.metaAccountId) continue;
      if (loc.vertical === 'agency') continue;

      const accountId = loc.googleAdsAccountId || loc.metaAccountId;
      const vertical = loc.vertical || 'healthcare';

      const currentWeek = loc.googleAdsAccountId
        ? await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.googleAdsAccountId, latestWeek])
        : null;
      const priorWeekData = loc.googleAdsAccountId
        ? await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.googleAdsAccountId, priorWeek])
        : null;
      const weeklyHistory = loc.googleAdsAccountId
        ? (await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 8', [loc.googleAdsAccountId])).reverse()
        : [];
      const campaigns = loc.googleAdsAccountId
        ? await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [loc.googleAdsAccountId, latestWeek])
        : [];
      const priorCampaigns = loc.googleAdsAccountId
        ? await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [loc.googleAdsAccountId, priorWeek])
        : [];
      const campaignHistory = loc.googleAdsAccountId
        ? await query('SELECT * FROM campaign_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 200', [loc.googleAdsAccountId])
        : [];

      let metaData = null;
      if (loc.metaAccountId) {
        const mc = await queryOne('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, latestWeek]);
        const mp = await queryOne('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, priorWeek]);
        const mcamps = await query('SELECT * FROM meta_campaign_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, latestWeek]);
        if (mc || mp) metaData = { current: mc, prior: mp, campaigns: mcamps };
      }

      const alerts = runRules({
        accountId, vertical, currentWeek, priorWeek: priorWeekData,
        weeklyHistory, campaigns, priorCampaigns, campaignHistory, metaData, ghlData: null
      });

      totalAlerts += alerts.length;
      alerts.forEach(function(a) {
        bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
        byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
        if (a.severity === 'critical') {
          const name = loc.ghlLocationName || loc.googleAdsAccountName;
          if (accountsWithCritical.indexOf(name) === -1) {
            accountsWithCritical.push(name);
          }
        }
      });
    }

    return Response.json({
      total_alerts: totalAlerts,
      by_severity: bySeverity,
      by_platform: byPlatform,
      accounts_with_critical: accountsWithCritical,
      latest_week: latestWeek,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
