import { GHLConfigManager } from '@/lib/ghl-client';

let configManager;
try {
  configManager = new GHLConfigManager();
} catch (e) {
  configManager = null;
}

export async function GET(request, { params }) {
  try {
    const { id: locationId } = await params;
    if (!configManager) return Response.json({ error: 'GHL not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit')) || 100, 500);
    const startAfterId = searchParams.get('startAfterId') || null;

    const client = configManager.getClientForLocation(locationId);
    const result = await client.getContacts(locationId, { limit, startAfterId });

    return Response.json(result);
  } catch (error) {
    console.error(`Error in GET /api/ghl/locations/contacts:`, error);
    return Response.json({ error: error.message || 'Failed to get contacts' }, { status: error.status || 500 });
  }
}
