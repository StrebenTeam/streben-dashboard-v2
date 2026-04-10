import { getBenchmarks } from '@/lib/benchmarks';

export async function GET(request, { params }) {
  try {
    const { vertical } = await params;
    const benchmarks = getBenchmarks(vertical);
    return Response.json(benchmarks);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
