import { query, queryOne } from '@/lib/db';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const weeks = parseInt(searchParams.get('weeks')) || 12;

    const account = await queryOne('SELECT * FROM meta_accounts WHERE id = ?', [id]);
    if (!account) return Response.json({ error: 'Meta account not found' }, { status: 404 });

    const snapshots = await query(`
      SELECT * FROM meta_weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT ?
    `, [id, weeks]);

    const latestWeek = snapshots.length > 0 ? snapshots[0].week_start : null;
    const campaigns = latestWeek ? await query(`
      SELECT campaign_id, campaign_name, campaign_status,
        SUM(spend) as spend, SUM(impressions) as impressions,
        SUM(clicks) as clicks, SUM(leads) as leads,
        CASE WHEN SUM(leads) > 0 THEN SUM(spend) / SUM(leads) ELSE 0 END as cost_per_lead
      FROM meta_campaign_snapshots
      WHERE account_id = ?
      GROUP BY campaign_id, campaign_name, campaign_status
      ORDER BY spend DESC
    `, [id]) : [];

    const campaignLatest = latestWeek ? await query(`
      SELECT * FROM meta_campaign_snapshots
      WHERE account_id = ? AND week_start = ?
      ORDER BY spend DESC
    `, [id, latestWeek]) : [];

    const priorWeek = snapshots.length > 1 ? snapshots[1].week_start : null;
    const campaignPrior = priorWeek ? await query(`
      SELECT * FROM meta_campaign_snapshots
      WHERE account_id = ? AND week_start = ?
      ORDER BY spend DESC
    `, [id, priorWeek]) : [];

    return Response.json({
      account,
      snapshots: snapshots.reverse(),
      campaigns,
      campaignLatest,
      campaignPrior
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
