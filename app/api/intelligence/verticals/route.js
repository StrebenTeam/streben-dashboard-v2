import { getVerticals } from '@/lib/benchmarks';

export async function GET() {
  try {
    return Response.json(getVerticals());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
