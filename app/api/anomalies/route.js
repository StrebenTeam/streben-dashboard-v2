import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    let sql = 'SELECT an.*, a.name as account_name FROM anomalies an JOIN accounts a ON a.id = an.account_id WHERE 1=1';
    const params = [];

    const week = searchParams.get('week');
    const accountId = searchParams.get('account_id');
    const showDismissed = searchParams.get('show_dismissed');

    if (week) { sql += ' AND an.week_start = ?'; params.push(week); }
    if (accountId) { sql += ' AND an.account_id = ?'; params.push(accountId); }
    if (!showDismissed) { sql += ' AND an.dismissed = 0'; }

    sql += ` ORDER BY CASE an.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, an.created_at DESC`;
    return Response.json(await query(sql, params));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
