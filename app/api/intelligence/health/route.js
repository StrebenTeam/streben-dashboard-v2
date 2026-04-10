import { query } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';
import { getBenchmarks } from '@/lib/benchmarks';
import { computeHealthScore, analyzeTrends, analyzeMetaTrends } from '@/lib/trend-engine';

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

    if (!ghlConfig) return Response.json({ accounts: [], generated_at: new Date().toISOString(), accounts_analyzed: 0 });

    const locations = ghlConfig.getAllLocations();
    const results = [];

    for (const loc of locations) {
      if (loc.vertical === 'agency') continue;
      if (!loc.googleAdsAccountId && !loc.metaAccountId) continue;
      if (targetAccountId && loc.googleAdsAccountId !== targetAccountId && loc.metaAccountId !== targetAccountId) continue;

      const accountId = loc.googleAdsAccountId || loc.metaAccountId;
      const accountName = loc.ghlLocationName || loc.googleAdsAccountName || loc.metaAccountName;
      const vertical = loc.vertical || 'healthcare';
      const benchmarks = getBenchmarks(vertical);

      const result = {
        accountId, accountName, vertical,
        verticalLabel: benchmarks.label,
        platform: loc.adPlatform,
        healthScore: null,
        trends: { insights: [], metrics: {} },
        metaTrends: { insights: [], metrics: {} },
        latestWeek: null
      };

      if (loc.googleAdsAccountId) {
        const weeklyHistory = await query('SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC', [loc.googleAdsAccountId]);
        if (weeklyHistory.length > 0) {
          result.latestWeek = weeklyHistory[weeklyHistory.length - 1];
          result.healthScore = computeHealthScore(weeklyHistory, benchmarks, vertical);
          result.trends = analyzeTrends(weeklyHistory, null, benchmarks, vertical);
          result.weeksOfData = weeklyHistory.length;
        }
      }

      if (loc.metaAccountId) {
        const metaHistory = await query('SELECT * FROM meta_weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC', [loc.metaAccountId]);
        if (metaHistory.length > 0) {
          result.metaTrends = analyzeMetaTrends(metaHistory, benchmarks);
          result.metaWeeksOfData = metaHistory.length;
        }
      }

      results.push(result);
    }

    results.sort(function(a, b) {
      const sa = a.healthScore ? a.healthScore.score : -1;
      const sb = b.healthScore ? b.healthScore.score : -1;
      return sb - sa;
    });

    return Response.json({
      accounts: results,
      generated_at: new Date().toISOString(),
      accounts_analyzed: results.length
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
