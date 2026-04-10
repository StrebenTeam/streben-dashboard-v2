import { query, queryOne } from '@/lib/db';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const weeks = parseInt(searchParams.get('weeks')) || 12;

    const account = await queryOne('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });

    const snapshots = await query(`
      SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT ?
    `, [id, weeks]);

    const latestWeek = snapshots.length > 0 ? snapshots[0].week_start : null;
    const campaigns = latestWeek ? await query(`
      SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ? ORDER BY spend DESC
    `, [id, latestWeek]) : [];

    const priorWeek = snapshots.length > 1 ? snapshots[1].week_start : null;
    const priorCampaigns = priorWeek ? await query(`
      SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ? ORDER BY spend DESC
    `, [id, priorWeek]) : [];

    return Response.json({
      account,
      snapshots: snapshots.reverse(),
      campaigns,
      prior_campaigns: priorCampaigns
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
