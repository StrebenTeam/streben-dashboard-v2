import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    let sql = 'SELECT r.*, a.name as account_name FROM recommendations r JOIN accounts a ON a.id = r.account_id WHERE 1=1';
    const params = [];

    const week = searchParams.get('week');
    const accountId = searchParams.get('account_id');
    const status = searchParams.get('status');

    if (week) { sql += ' AND r.week_start = ?'; params.push(week); }
    if (accountId) { sql += ' AND r.account_id = ?'; params.push(accountId); }
    if (status) { sql += ' AND r.status = ?'; params.push(status); }

    sql += ' ORDER BY r.priority ASC, r.created_at DESC';
    return Response.json(await query(sql, params));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
