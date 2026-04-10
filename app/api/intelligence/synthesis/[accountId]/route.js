import { query, queryOne } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';
import { getBenchmarks } from '@/lib/benchmarks';
import { runRules } from '@/lib/rule-engine';
import { computeHealthScore, analyzeTrends } from '@/lib/trend-engine';
import { synthesizeAccount } from '@/lib/synthesis-engine';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET(request, { params }) {
  try {
    const { accountId } = await params;

    if (!ghlConfig) return Response.json({ error: 'GHL not configured' }, { status: 500 });

    const locations = ghlConfig.getAllLocations();
    const loc = locations.find(l => l.googleAdsAccountId === accountId);
    if (!loc) return Response.json({ error: 'Account not found' }, { status: 404 });

    const vertical = loc.vertical || 'healthcare';
    const benchmarks = getBenchmarks(vertical);
    const weeklyHistory = await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC', [accountId]);
    if (weeklyHistory.length === 0) return Response.json({ narrative: 'No data available.' });

    const account = {
      accountId, accountName: loc.ghlLocationName || loc.googleAdsAccountName,
      vertical, verticalLabel: benchmarks.label,
      platform: loc.adPlatform,
      healthScore: computeHealthScore(weeklyHistory, benchmarks, vertical),
      trends: analyzeTrends(weeklyHistory, null, benchmarks, vertical),
      latestWeek: weeklyHistory[weeklyHistory.length - 1],
      weeksOfData: weeklyHistory.length
    };

    const lw = weeklyHistory[weeklyHistory.length - 1].week_start;
    const pd = new Date(lw + 'T00:00:00Z');
    pd.setUTCDate(pd.getUTCDate() - 7);
    const pw = pd.toISOString().split('T')[0];

    const cw = await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [accountId, lw]);
    const pwData = await queryOne('SELECT * FROM weekly_snapshots WHERE account_id = ? AND week_start = ?', [accountId, pw]);
    const hist = (await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 8', [accountId])).reverse();

    let alerts = [];
    if (cw) {
      const synthCampaigns = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [accountId, lw]);
      const synthPriorCamps = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?', [accountId, pw]);
      const synthCampHistory = await query('SELECT * FROM campaign_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 200', [accountId]);
      alerts = runRules({
        accountId, vertical, currentWeek: cw, priorWeek: pwData,
        weeklyHistory: hist, campaigns: synthCampaigns, priorCampaigns: synthPriorCamps,
        campaignHistory: synthCampHistory, metaData: null, ghlData: null
      });
    }

    const narrative = synthesizeAccount(account, alerts);
    return Response.json({ accountId, accountName: account.accountName, narrative, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('Account synthesis error:', err.message);
    return Response.json({ error: 'Synthesis failed: ' + err.message }, { status: 500 });
  }
}
