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

async function getAccountsForDateRange(startDate, endDate) {
  return await query(`
    SELECT ws.account_id, a.name as account_name,
      SUM(ws.spend) as spend,
      SUM(ws.impressions) as impressions,
      SUM(ws.clicks) as clicks,
      SUM(ws.conversions) as conversions,
      SUM(ws.conversions_value) as conversions_value,
      AVG(ws.search_impression_share) as search_impression_share,
      AVG(ws.budget_lost_is) as budget_lost_is,
      AVG(ws.rank_lost_is) as rank_lost_is,
      COUNT(*) as week_count
    FROM weekly_snapshots ws
    JOIN accounts a ON a.id = ws.account_id
    WHERE ws.week_start >= ? AND ws.week_start <= ? AND a.is_manager = 0
    GROUP BY ws.account_id, a.name
    ORDER BY spend DESC
  `, [startDate, endDate]);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range');
    let week = searchParams.get('week');

    if (range) {
      const today = new Date().toISOString().split('T')[0];
      const bounds = getDateRangeForType(range, today);

      if (!bounds) return Response.json({ error: 'Invalid range type' }, { status: 400 });

      const currentAccounts = await getAccountsForDateRange(bounds.currentStart, bounds.currentEnd);
      const priorAccounts = await getAccountsForDateRange(bounds.priorStart, bounds.priorEnd);

      const sumRow = (rows) => {
        if (!rows || rows.length === 0) return { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, search_impression_share: 0, budget_lost_is: 0, rank_lost_is: 0 };
        return {
          spend: rows.reduce((sum, r) => sum + (r.spend || 0), 0),
          impressions: rows.reduce((sum, r) => sum + (r.impressions || 0), 0),
          clicks: rows.reduce((sum, r) => sum + (r.clicks || 0), 0),
          conversions: rows.reduce((sum, r) => sum + (r.conversions || 0), 0),
          conversions_value: rows.reduce((sum, r) => sum + (r.conversions_value || 0), 0),
          search_impression_share: rows.length > 0 ? rows.reduce((sum, r) => sum + (r.search_impression_share || 0), 0) / rows.length : 0,
          budget_lost_is: rows.length > 0 ? rows.reduce((sum, r) => sum + (r.budget_lost_is || 0), 0) / rows.length : 0,
          rank_lost_is: rows.length > 0 ? rows.reduce((sum, r) => sum + (r.rank_lost_is || 0), 0) / rows.length : 0
        };
      };

      return Response.json({
        range: range,
        range_start: bounds.currentStart,
        range_end: bounds.currentEnd,
        prior_range_start: bounds.priorStart,
        prior_range_end: bounds.priorEnd,
        current: sumRow(currentAccounts),
        prior: sumRow(priorAccounts),
        accounts: currentAccounts,
        prior_accounts: priorAccounts
      });
    }

    // Single week logic
    if (!week) {
      const latest = await queryOne('SELECT week_start FROM weekly_snapshots ORDER BY week_start DESC LIMIT 1');
      week = latest ? latest.week_start : null;
    }

    if (!week) return Response.json({ current: null, prior: null, accounts: [] });

    const priorWeek = await queryOne('SELECT DISTINCT week_start FROM weekly_snapshots WHERE week_start < ? ORDER BY week_start DESC LIMIT 1', [week]);
    const priorWeekStart = priorWeek ? priorWeek.week_start : null;

    const currentAccounts = await query(`
      SELECT ws.*, a.name as account_name
      FROM weekly_snapshots ws
      JOIN accounts a ON a.id = ws.account_id
      WHERE ws.week_start = ? AND a.is_manager = 0
      ORDER BY ws.spend DESC
    `, [week]);

    const priorAccounts = priorWeekStart ? await query(`
      SELECT ws.*, a.name as account_name
      FROM weekly_snapshots ws
      JOIN accounts a ON a.id = ws.account_id
      WHERE ws.week_start = ? AND a.is_manager = 0
      ORDER BY ws.spend DESC
    `, [priorWeekStart]) : [];

    const sumRow = (rows) => rows.reduce((acc, r) => ({
      spend: acc.spend + (r.spend || 0),
      impressions: acc.impressions + (r.impressions || 0),
      clicks: acc.clicks + (r.clicks || 0),
      conversions: acc.conversions + (r.conversions || 0),
      conversions_value: acc.conversions_value + (r.conversions_value || 0),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0 });

    return Response.json({
      week_start: week,
      prior_week_start: priorWeekStart,
      current: sumRow(currentAccounts),
      prior: sumRow(priorAccounts),
      accounts: currentAccounts,
      prior_accounts: priorAccounts
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
