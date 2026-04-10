import { GHLConfigManager } from '@/lib/ghl-client';

let ghlConfig;
try {
  ghlConfig = new GHLConfigManager();
} catch (e) {
  ghlConfig = null;
}

export async function GET() {
  try {
    if (!ghlConfig) return Response.json({ googleToMeta: {}, metaToGoogle: {}, metaOnly: [], metaNames: {} });

    const locations = ghlConfig.getAllLocations();
    const map = {
      googleToMeta: {},
      metaToGoogle: {},
      metaOnly: [],
    };
    const metaOnlySet = new Set();
    const metaNames = {};

    locations.forEach(loc => {
      if (loc.metaAccountId) {
        metaNames[loc.metaAccountId] = loc.metaAccountName || loc.ghlLocationName || loc.metaAccountId;
      }
      if (loc.metaAccountId && loc.googleAdsAccountId) {
        map.googleToMeta[loc.googleAdsAccountId] = loc.metaAccountId;
        map.metaToGoogle[loc.metaAccountId] = loc.googleAdsAccountId;
      } else if (loc.metaAccountId && !loc.googleAdsAccountId) {
        metaOnlySet.add(loc.metaAccountId);
      }
    });
    map.metaOnly = Array.from(metaOnlySet);
    map.metaNames = metaNames;
    return Response.json(map);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
