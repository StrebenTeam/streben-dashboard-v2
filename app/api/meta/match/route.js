import { GHLConfigManager } from '@/lib/ghl-client';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET() {
  try {
    if (!ghlConfig) return Response.json({});
    const locations = ghlConfig.getLocations();
    const matchMap = {};
    locations.forEach(loc => {
      if (loc.metaAccountId) {
        if (!matchMap[loc.metaAccountId]) {
          matchMap[loc.metaAccountId] = {
            ghlLocations: [],
            metaAccountName: loc.metaAccountName
          };
        }
        matchMap[loc.metaAccountId].ghlLocations.push({
          ghlLocationId: loc.ghlLocationId,
          ghlLocationName: loc.ghlLocationName
        });
      }
    });
    return Response.json(matchMap);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
