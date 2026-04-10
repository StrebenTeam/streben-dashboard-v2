import { query, queryOne } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';

const ACCOUNT_GROUPS = {
  'push-fitness': {
    name: 'Push Fitness',
    accountIds: ['7302638252', '1770197758', '8069761184', '8948630925'],
    locations: [
      { accountId: '7302638252', label: 'College Point' },
      { accountId: '1770197758', label: 'Melville' },
      { accountId: '8069761184', label: 'Fresh Meadows' },
      { accountId: '8948630925', label: 'New Hyde Park' }
    ]
  }
};

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET(request, { params }) {
  try {
    const { groupId } = await params;
    const group = ACCOUNT_GROUPS[groupId];
    if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const weeks = parseInt(searchParams.get('weeks')) || 12;

    const subAccounts = await Promise.all(group.locations.map(async (loc) => {
      const account = await queryOne('SELECT * FROM accounts WHERE id = ?', [loc.accountId]);
      const snapshots = await query(`
        SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT ?
      `, [loc.accountId, weeks]);

      const latestWeek = snapshots.length > 0 ? snapshots[0].week_start : null;
      const campaigns = latestWeek ? await query(`
        SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ? ORDER BY spend DESC
      `, [loc.accountId, latestWeek]) : [];

      const priorWeek = snapshots.length > 1 ? snapshots[1].week_start : null;
      const priorCampaigns = priorWeek ? await query(`
        SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ? ORDER BY spend DESC
      `, [loc.accountId, priorWeek]) : [];

      return {
        accountId: loc.accountId,
        label: loc.label,
        account,
        snapshots: snapshots.reverse(),
        campaigns,
        prior_campaigns: priorCampaigns
      };
    }));

    // Aggregate snapshots across all sub-accounts by week
    const weekMap = {};
    subAccounts.forEach(sa => {
      sa.snapshots.forEach(s => {
        if (!weekMap[s.week_start]) {
          weekMap[s.week_start] = { week_start: s.week_start, week_end: s.week_end, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, search_impression_share: 0, count: 0 };
        }
        const w = weekMap[s.week_start];
        w.spend += s.spend || 0;
        w.impressions += s.impressions || 0;
        w.clicks += s.clicks || 0;
        w.conversions += s.conversions || 0;
        w.conversions_value += s.conversions_value || 0;
        w.search_impression_share += s.search_impression_share || 0;
        w.count++;
      });
    });

    const aggregatedSnapshots = Object.values(weekMap)
      .map(w => ({ ...w, search_impression_share: w.count > 0 ? w.search_impression_share / w.count : 0 }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start));

    // Get GHL data for each sub-account location
    const ghlLocations = group.locations.map(loc => {
      let ghlLoc = null;
      if (ghlConfig) {
        try { ghlLoc = ghlConfig.getLocationByGoogleAdsId(loc.accountId); } catch (e) { /* skip */ }
      }
      return {
        accountId: loc.accountId,
        label: loc.label,
        ghlLocationId: ghlLoc ? ghlLoc.ghlLocationId : null,
        ghlLocationName: ghlLoc ? ghlLoc.ghlLocationName : null
      };
    });

    return Response.json({
      group: { id: groupId, name: group.name },
      subAccounts,
      aggregatedSnapshots,
      ghlLocations
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
