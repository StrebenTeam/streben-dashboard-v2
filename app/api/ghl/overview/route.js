import { GHLConfigManager } from '@/lib/ghl-client';

let configManager;
try {
  configManager = new GHLConfigManager();
} catch (e) {
  configManager = null;
}

function categorize(source) {
  if (!source) return 'other';
  if (source.includes('Google Ads')) return 'google';
  if (source.includes('Paid Search')) return 'paidSearch';
  if (source.includes('Organic')) return 'organic';
  if (source.includes('Direct')) return 'direct';
  if (source.includes('Referral')) return 'referral';
  return 'other';
}

export async function GET() {
  try {
    if (!configManager) return Response.json({ locations: [], totals: {}, last_updated: new Date().toISOString() });

    const configLocations = configManager.getLocations();
    const locationResults = [];

    const totals = {
      contacts: 0,
      googleAdsLeads: 0,
      paidSearchLeads: 0,
      organicLeads: 0,
      directLeads: 0,
      referralLeads: 0,
      otherLeads: 0,
      totalPipeline: 0,
      booked: 0,
      closed: 0,
      badLeads: 0,
    };

    for (const loc of configLocations) {
      const locationId = loc.ghlLocationId;
      let locData = {
        ghlLocationId: locationId,
        ghlLocationName: loc.ghlLocationName,
        googleAdsAccountId: loc.googleAdsAccountId,
        googleAdsAccountName: loc.googleAdsAccountName,
        adPlatform: loc.adPlatform,
        contacts: { total: 0, sources: {}, tags: {} },
        pipeline: { stages: {}, total: 0 },
      };

      try {
        const client = configManager.getClientForLocation(locationId);

        const contactsResult = await client.getContacts(locationId, { limit: 100 });
        const contacts = contactsResult.contacts || [];
        const totalCount = contactsResult.meta?.total || contactsResult.total || contacts.length;
        locData.contacts.total = totalCount;
        totals.contacts += totalCount;

        contacts.forEach(c => {
          const src = c.source || 'unknown';
          locData.contacts.sources[src] = (locData.contacts.sources[src] || 0) + 1;

          if (c.tags && c.tags.length > 0) {
            c.tags.forEach(t => {
              locData.contacts.tags[t] = (locData.contacts.tags[t] || 0) + 1;
            });
          }

          const cat = categorize(src);
          if (cat === 'google') totals.googleAdsLeads++;
          else if (cat === 'paidSearch') totals.paidSearchLeads++;
          else if (cat === 'organic') totals.organicLeads++;
          else if (cat === 'direct') totals.directLeads++;
          else if (cat === 'referral') totals.referralLeads++;
          else totals.otherLeads++;
        });

        const pipelinesResult = await client.getPipelines(locationId);
        const pipelines = pipelinesResult.pipelines || [];

        for (const pipeline of pipelines) {
          const stageMap = {};
          (pipeline.stages || []).forEach(s => { stageMap[s.id] = s.name; });

          const oppsResult = await client.getOpportunities(locationId, pipeline.id);
          const opps = oppsResult.opportunities || [];

          opps.forEach(opp => {
            const stageName = stageMap[opp.pipelineStageId] || opp.stageName || 'Unknown';
            locData.pipeline.stages[stageName] = (locData.pipeline.stages[stageName] || 0) + 1;
            locData.pipeline.total++;
            totals.totalPipeline++;

            if (stageName === 'Booked') totals.booked++;
            if (stageName === 'Closed') totals.closed++;
            if (stageName === 'Bad Lead') totals.badLeads++;
          });
        }
      } catch (err) {
        console.warn(`[GHL Overview] Error for ${loc.ghlLocationName}: ${err.message || err}`);
        locData.error = err.message || 'Failed to fetch data';
      }

      locationResults.push(locData);
    }

    return Response.json({
      locations: locationResults,
      totals,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in GET /api/ghl/overview:', error);
    return Response.json({ error: error.message || 'Failed to get overview' }, { status: error.status || 500 });
  }
}
