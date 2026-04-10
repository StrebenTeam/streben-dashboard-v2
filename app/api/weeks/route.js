import { query } from '@/lib/db';

export async function GET() {
  try {
    return Response.json(await query('SELECT DISTINCT week_start, week_end FROM weekly_snapshots ORDER BY week_start DESC'));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
