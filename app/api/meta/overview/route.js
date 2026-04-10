import { query, queryOne } from '@/lib/db';

function getDateRangeForType(rangeType, referenceDate) {
  const today = new Date(referenceDate + 'T00:00:00Z');

  if (rangeType === 'last-week') {
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - today.getUTCDay() + (today.getUTCDay() === 0 ? -6 : 1) - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return {
      currentStart: start.toISOString().split('T')[0],
      currentEnd: end.toISOString().split('T')[0],
      priorStart: new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priorEnd: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  } else if (rangeType === 'last-2-weeks') {
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - today.getUTCDay() + (today.getUTCDay() === 0 ? -6 : 1) - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 13);
    return {
      currentStart: start.toISOString().split('T')[0],
      currentEnd: end.toISOString().split('T')[0],
      priorStart: new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priorEnd: new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  } else if (rangeType === 'last-month') {
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - today.getUTCDay() + (today.getUTCDay() === 0 ? -6 : 1) - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27);
    return {
      currentStart: start.toISOString().split('T')[0],
      currentEnd: end.toISOString().split('T')[0],
      priorStart: new Date(start.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priorEnd: new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  } else if (rangeType === 'last-quarter') {
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - today.getUTCDay() + (today.getUTCDay() === 0 ? -6 : 1) - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 90);
    return {
      currentStart: start.toISOString().split('T')[0],
      currentEnd: end.toISOString().split('T')[0],
      priorStart: new Date(start.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priorEnd: new Date(end.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  } else if (rangeType === 'ytd') {
    const year = today.getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    return {
      currentStart: start.toISOString().split('T')[0],
      currentEnd: today.toISOString().split('T')[0],
      priorStart: new Date(Date.UTC(year - 1, 0, 1)).toISOString().split('T')[0],
      priorEnd: new Date(Date.UTC(year - 1, today.getUTCMonth(), today.getUTCDate())).toISOString().split('T')[0]
    };
  }
  return null;
}

async function getMetaAccountsForDateRange(startDate, endDate) {
  return await query(`
    SELECT mws.account_id, ma.name as account_name, ma.client_name,
      SUM(mws.spend) as spend,
      SUM(mws.impressions) as impressions,
      SUM(mws.clicks) as clicks,
      SUM(mws.leads) as leads,
      SUM(mws.landing_page_views) as landing_page_views,
      AVG(mws.ctr) as ctr,
      AVG(mws.cpc) as cpc,
      CASE WHEN SUM(mws.leads) > 0 THEN SUM(mws.spend) / SUM(mws.leads) ELSE 0 END as cost_per_lead,
      COUNT(*) as week_count
    FROM meta_weekly_snapshots mws
    JOIN meta_accounts ma ON ma.id = mws.account_id
    WHERE mws.week_start >= ? AND mws.week_start <= ?
    GROUP BY mws.account_id, ma.name
    ORDER BY spend DESC
  `, [startDate, endDate]);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range');

    if (range) {
      const today = new Date().toISOString().split('T')[0];
      const bounds = getDateRangeForType(range, today);
      if (!bounds) return Response.json({ error: 'Invalid range type' }, { status: 400 });

      const currentAccounts = await getMetaAccountsForDateRange(bounds.currentStart, bounds.currentEnd);
      const priorAccounts = await getMetaAccountsForDateRange(bounds.priorStart, bounds.priorEnd);

      return Response.json({
        range,
        range_start: bounds.currentStart,
        range_end: bounds.currentEnd,
        accounts: currentAccounts,
        prior_accounts: priorAccounts
      });
    }

    // Default: latest week
    const latest = await queryOne('SELECT week_start FROM meta_weekly_snapshots ORDER BY week_start DESC LIMIT 1');
    const week = latest ? latest.week_start : null;
    if (!week) return Response.json({ accounts: [], prior_accounts: [] });

    const currentAccounts = await query(`
      SELECT mws.*, ma.name as account_name, ma.client_name
      FROM meta_weekly_snapshots mws
      JOIN meta_accounts ma ON ma.id = mws.account_id
      WHERE mws.week_start = ?
      ORDER BY mws.spend DESC
    `, [week]);

    const priorWeek = await queryOne('SELECT DISTINCT week_start FROM meta_weekly_snapshots WHERE week_start < ? ORDER BY week_start DESC LIMIT 1', [week]);
    const priorAccounts = priorWeek ? await query(`
      SELECT mws.*, ma.name as account_name, ma.client_name
      FROM meta_weekly_snapshots mws
      JOIN meta_accounts ma ON ma.id = mws.account_id
      WHERE mws.week_start = ?
      ORDER BY mws.spend DESC
    `, [priorWeek.week_start]) : [];

    return Response.json({
      week_start: week,
      accounts: currentAccounts,
      prior_accounts: priorAccounts
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
