import { query, queryOne } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';
import { runRules } from '@/lib/rule-engine';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetAccountId = searchParams.get('accountId') || null;

    if (!ghlConfig) return Response.json({ alerts: [], generated_at: new Date().toISOString(), accounts_analyzed: 0 });

    const locations = ghlConfig.getAllLocations();
    const allAlerts = [];

    const latestWeekRow = await queryOne('SELECT week_start FROM weekly_snapshots ORDER BY week_start DESC LIMIT 1');
    if (!latestWeekRow) {
      return Response.json({ alerts: [], generated_at: new Date().toISOString(), accounts_analyzed: 0 });
    }
    const latestWeek = latestWeekRow.week_start;
    const latestDate = new Date(latestWeek + 'T00:00:00Z');
    const priorDate = new Date(latestDate);
    priorDate.setUTCDate(priorDate.getUTCDate() - 7);
    const priorWeek = priorDate.toISOString().split('T')[0];

    let accountsAnalyzed = 0;

    for (const loc of locations) {
      if (!loc.googleAdsAccountId) continue;
      if (loc.vertical === 'agency') continue;
      if (targetAccountId && loc.googleAdsAccountId !== targetAccountId) continue;

      const accountId = loc.googleAdsAccountId;
      const vertical = loc.vertical || 'healthcare';

      const currentWeek = await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [accountId, latestWeek]);
      const priorWeekData = await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [accountId, priorWeek]);
      const weeklyHistory = (await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 8', [accountId])).reverse();
      const campaigns = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [accountId, latestWeek]);
      const priorCampaigns = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [accountId, priorWeek]);
      const campaignHistory = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 200', [accountId]);

      let metaData = null;
      if (loc.metaAccountId) {
        const metaCurrent = await queryOne('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, latestWeek]);
        const metaPrior = await queryOne('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, priorWeek]);
        const metaCampaigns = await query('SELECT * FROM meta_campaign_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, latestWeek]);
        if (metaCurrent || metaPrior) {
          metaData = { current: metaCurrent, prior: metaPrior, campaigns: metaCampaigns };
        }
      }

      const alerts = runRules({
        accountId, vertical, currentWeek, priorWeek: priorWeekData,
        weeklyHistory, campaigns, priorCampaigns, campaignHistory, metaData, ghlData: null
      });

      alerts.forEach(function(alert) {
        alert.accountId = accountId;
        alert.accountName = loc.ghlLocationName || loc.googleAdsAccountName;
        alert.vertical = vertical;
      });

      allAlerts.push(...alerts);
      accountsAnalyzed++;
    }

    // Meta-only accounts
    for (const loc of locations) {
      if (loc.googleAdsAccountId) continue;
      if (!loc.metaAccountId) continue;
      if (loc.vertical === 'agency') continue;

      const vertical = loc.vertical || 'healthcare';
      const metaCurrent = await queryOne('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, latestWeek]);
      const metaPrior = await queryOne('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, priorWeek]);
      const metaCampaigns = await query('SELECT * FROM meta_campaign_snapshots WHERE account_id = ? AND week_start = ?', [loc.metaAccountId, latestWeek]);

      if (!metaCurrent && !metaPrior) continue;
      const metaData = { current: metaCurrent, prior: metaPrior, campaigns: metaCampaigns };

      const alerts = runRules({
        accountId: loc.metaAccountId, vertical,
        currentWeek: null, priorWeek: null, weeklyHistory: [],
        campaigns: [], priorCampaigns: [], campaignHistory: [],
        metaData, ghlData: null
      });

      alerts.forEach(function(alert) {
        alert.accountId = loc.metaAccountId;
        alert.accountName = loc.ghlLocationName;
        alert.vertical = vertical;
      });

      allAlerts.push(...alerts);
      accountsAnalyzed++;
    }

    const severityOrder = { critical: 0, warning: 1, opportunity: 2, info: 3 };
    allAlerts.sort(function(a, b) {
      const diff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
      if (diff !== 0) return diff;
      return (a.accountName || '').localeCompare(b.accountName || '');
    });

    return Response.json({
      alerts: allAlerts,
      generated_at: new Date().toISOString(),
      accounts_analyzed: accountsAnalyzed,
      latest_week: latestWeek,
      prior_week: priorWeek,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
