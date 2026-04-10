import { query } from '@/lib/db';

export async function GET() {
  try {
    const accounts = await query(`
      SELECT a.id, a.name, a.parent_id,
        (SELECT week_start FROM weekly_snapshots WHERE account_id = a.id ORDER BY week_start DESC LIMIT 1) as latest_week
      FROM accounts a
      WHERE a.is_manager = 0
      ORDER BY a.name
    `);
    return Response.json(accounts);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
