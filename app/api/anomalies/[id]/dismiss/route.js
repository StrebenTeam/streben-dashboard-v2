import { run } from '@/lib/db';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    await run('UPDATE anomalies SET dismissed = 1 WHERE id = ?', [parseInt(id)]);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
