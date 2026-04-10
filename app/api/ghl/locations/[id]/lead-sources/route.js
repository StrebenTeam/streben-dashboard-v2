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

    const client = configManager.getClientForLocation(locationId);

    const sources = {};
    const tags = {};
    let total = 0;
    let startAfterId = null;

    let hasMore = true;
    while (hasMore) {
      const result = await client.getContacts(locationId, { limit: 500, startAfterId });
      const contacts = result.contacts || result.data || [];

      if (contacts.length === 0) {
        hasMore = false;
      } else {
        for (const contact of contacts) {
          total++;

          const source = contact.source || 'Unknown';
          sources[source] = (sources[source] || 0) + 1;

          if (contact.tags && Array.isArray(contact.tags)) {
            for (const tag of contact.tags) {
              const tagName = tag.toLowerCase();
              tags[tagName] = (tags[tagName] || 0) + 1;
            }
          }
        }

        if (result.startAfter) {
          startAfterId = result.startAfter;
        } else {
          hasMore = false;
        }
      }
    }

    return Response.json({ sources, tags, total });
  } catch (error) {
    console.error(`Error in GET /api/ghl/locations/lead-sources:`, error);
    return Response.json({ error: error.message || 'Failed to get lead sources' }, { status: error.status || 500 });
  }
}
