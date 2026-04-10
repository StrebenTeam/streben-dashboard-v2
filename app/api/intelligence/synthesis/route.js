import { query, queryOne } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';
import { getBenchmarks } from '@/lib/benchmarks';
import { runRules } from '@/lib/rule-engine';
import { computeHealthScore, analyzeTrends, portfolioAnalysis } from '@/lib/trend-engine';
import { synthesizePortfolio, synthesizeWeeklyDigest } from '@/lib/synthesis-engine';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    if (!ghlConfig) return Response.json({ error: 'GHL not configured' }, { status: 500 });

    const locations = ghlConfig.getAllLocations();

    // Gather Layer 2 health data
    const healthAccounts = [];
    for (const loc of locations) {
      if (loc.vertical === 'agency') continue;
      if (!loc.googleAdsAccountId) continue;
      const accountId = loc.googleAdsAccountId;
      const vertical = loc.vertical || 'healthcare';
      const benchmarks = getBenchmarks(vertical);
      const weeklyHistory = await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC', [accountId]);
      if (weeklyHistory.length === 0) continue;
      healthAccounts.push({
        accountId, accountName: loc.ghlLocationName || loc.googleAdsAccountName,
        vertical, verticalLabel: benchmarks.label,
        platform: loc.adPlatform,
        healthScore: computeHealthScore(weeklyHistory, benchmarks, vertical),
        trends: analyzeTrends(weeklyHistory, null, benchmarks, vertical),
        latestWeek: weeklyHistory[weeklyHistory.length - 1],
        weeksOfData: weeklyHistory.length
      });
    }

    // Gather Layer 1 alerts
    const latestWeekRow = await queryOne('SELECT week_start FROM weekly_snapshots ORDER BY week_start DESC LIMIT 1');
    const latestWeek = latestWeekRow ? latestWeekRow.week_start : null;
    const priorDate = latestWeek ? new Date(latestWeek + 'T00:00:00Z') : new Date();
    priorDate.setUTCDate(priorDate.getUTCDate() - 7);
    const priorWeek = priorDate.toISOString().split('T')[0];

    const allAlerts = [];
    for (const loc of locations) {
      if (!loc.googleAdsAccountId || loc.vertical === 'agency') continue;
      const accountId = loc.googleAdsAccountId;
      const vertical = loc.vertical || 'healthcare';
      const currentWeek = await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [accountId, latestWeek]);
      const priorWeekData = await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [accountId, priorWeek]);
      const weeklyHistory = (await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 8', [accountId])).reverse();
      if (!currentWeek) continue;
      const campaigns = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [accountId, latestWeek]);
      const priorCamps = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [accountId, priorWeek]);
      const campHistory = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 200', [accountId]);
      const alerts = runRules({
        accountId, vertical, currentWeek, priorWeek: priorWeekData,
        weeklyHistory, campaigns, priorCampaigns: priorCamps,
        campaignHistory: campHistory, metaData: null, ghlData: null
      });
      alerts.forEach(function(a) { a.accountId = accountId; a.accountName = loc.ghlLocationName || loc.googleAdsAccountName; });
      allAlerts.push(...alerts);
    }

    const portData = portfolioAnalysis(healthAccounts);
    const type = searchParams.get('type') || 'digest';

    if (type === 'portfolio') {
      const result = synthesizePortfolio(healthAccounts, allAlerts, portData);
      return Response.json({ type: 'portfolio', narrative: result, generated_at: new Date().toISOString() });
    } else {
      const result = synthesizeWeeklyDigest(healthAccounts, allAlerts, portData);
      return Response.json({ type: 'digest', digest: result, generated_at: new Date().toISOString() });
    }
  } catch (err) {
    console.error('Synthesis error:', err.message);
    return Response.json({ error: 'Synthesis failed: ' + err.message }, { status: 500 });
  }
}
