import { GHLConfigManager } from '@/lib/ghl-client';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET() {
  try {
    if (!ghlConfig) return Response.json([]);
    const locations = ghlConfig.getAllLocations();
    const map = locations.map(loc => ({
      name: loc.ghlLocationName || loc.googleAdsAccountName,
      googleAdsAccountId: loc.googleAdsAccountId || null,
      metaAccountId: loc.metaAccountId || null,
      adPlatform: loc.adPlatform,
      vertical: loc.vertical || 'healthcare',
    }));
    return Response.json(map);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
