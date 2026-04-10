import { GHLConfigManager } from '@/lib/ghl-client';

let configManager;
try {
  configManager = new GHLConfigManager();
} catch (e) {
  configManager = null;
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!configManager) return Response.json({ error: 'GHL not configured' }, { status: 500 });

    const locationConfig = configManager.getLocationConfig(id);
    if (!locationConfig) {
      return Response.json({ error: 'Location not found' }, { status: 404 });
    }

    return Response.json({
      id: locationConfig.ghlLocationId,
      name: locationConfig.ghlLocationName,
      googleAdsAccountId: locationConfig.googleAdsAccountId,
      googleAdsAccountName: locationConfig.googleAdsAccountName,
      adPlatform: locationConfig.adPlatform,
    });
  } catch (error) {
    console.error(`Error in GET /api/ghl/locations/${(await params).id}:`, error);
    return Response.json({ error: error.message || 'Failed to get location' }, { status: error.status || 500 });
  }
}
