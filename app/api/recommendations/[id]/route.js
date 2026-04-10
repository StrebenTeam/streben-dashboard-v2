import { run } from '@/lib/db';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (status && ['open', 'done', 'dismissed'].includes(status)) {
      await run('UPDATE recommendations SET status = ? WHERE id = ?', [status, parseInt(id)]);
    }
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
