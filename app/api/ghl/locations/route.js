import { GHLConfigManager } from '@/lib/ghl-client';

let configManager;
try {
  configManager = new GHLConfigManager();
} catch (e) {
  configManager = null;
}

export async function GET() {
  try {
    if (!configManager) return Response.json({ locations: [], total: 0 });
    const locations = configManager.getLocations();
    return Response.json({
      locations: locations.map(loc => ({
        id: loc.ghlLocationId,
        name: loc.ghlLocationName,
        googleAdsAccountId: loc.googleAdsAccountId,
        googleAdsAccountName: loc.googleAdsAccountName,
        adPlatform: loc.adPlatform,
      })),
      total: locations.length,
    });
  } catch (error) {
    console.error('Error in GET /api/ghl/locations:', error);
    return Response.json({ error: error.message || 'Failed to list locations' }, { status: 500 });
  }
}
