import { query } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';
import { getBenchmarks } from '@/lib/benchmarks';
import { computeHealthScore, analyzeTrends, portfolioAnalysis } from '@/lib/trend-engine';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET() {
  try {
    if (!ghlConfig) return Response.json({ summary: {}, accounts: [], insights: [], generated_at: new Date().toISOString() });

    const locations = ghlConfig.getAllLocations();
    const accountResults = [];

    for (const loc of locations) {
      if (loc.vertical === 'agency') continue;
      if (!loc.googleAdsAccountId) continue;

      const accountId = loc.googleAdsAccountId;
      const vertical = loc.vertical || 'healthcare';
      const benchmarks = getBenchmarks(vertical);

      const weeklyHistory = await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC', [accountId]);
      if (weeklyHistory.length < 3) continue;

      const latestWeek = weeklyHistory[weeklyHistory.length - 1];
      const healthScore = computeHealthScore(weeklyHistory, benchmarks, vertical);
      const trends = analyzeTrends(weeklyHistory, null, benchmarks, vertical);

      accountResults.push({
        accountId, accountName: loc.ghlLocationName || loc.googleAdsAccountName,
        vertical, healthScore, trends, latestWeek, weeksOfData: weeklyHistory.length
      });
    }

    const portfolioInsights = portfolioAnalysis(accountResults);

    const totalSpend = accountResults.reduce((sum, a) => sum + (a.latestWeek ? a.latestWeek.spend : 0), 0);
    const avgHealth = accountResults.filter(a => a.healthScore && a.healthScore.score !== null);
    const avgScore = avgHealth.length > 0
      ? Math.round(avgHealth.reduce((s, a) => s + a.healthScore.score, 0) / avgHealth.length)
      : null;

    return Response.json({
      summary: {
        total_accounts: accountResults.length,
        total_weekly_spend: totalSpend,
        average_health_score: avgScore,
        accounts_above_65: accountResults.filter(a => a.healthScore && a.healthScore.score >= 65).length,
        accounts_below_40: accountResults.filter(a => a.healthScore && a.healthScore.score !== null && a.healthScore.score < 40).length,
      },
      accounts: accountResults.map(a => ({
        accountId: a.accountId,
        accountName: a.accountName,
        vertical: a.vertical,
        healthScore: a.healthScore,
        weeklySpend: a.latestWeek ? a.latestWeek.spend : 0,
        weeksOfData: a.weeksOfData,
        trendCount: a.trends.insights.length
      })),
      insights: portfolioInsights,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
