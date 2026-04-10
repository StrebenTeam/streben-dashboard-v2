import { GHLConfigManager } from '@/lib/ghl-client';
import { getBenchmarks } from '@/lib/benchmarks';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET(request, { params }) {
  try {
    const { accountId } = await params;
    if (!ghlConfig) return Response.json({ error: 'GHL not configured' }, { status: 500 });

    const locations = ghlConfig.getAllLocations();
    const loc = locations.find(l => l.googleAdsAccountId === accountId || l.metaAccountId === accountId);

    if (!loc) {
      return Response.json({ error: 'Account not found in config' }, { status: 404 });
    }

    const vertical = loc.vertical || 'healthcare';
    const benchmarks = getBenchmarks(vertical);

    return Response.json({
      account: {
        id: accountId,
        name: loc.ghlLocationName || loc.googleAdsAccountName,
        vertical: vertical,
        verticalLabel: benchmarks.label,
      },
      benchmarks: {
        google: benchmarks.google,
        meta: benchmarks.meta,
        pipeline: benchmarks.pipeline,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
