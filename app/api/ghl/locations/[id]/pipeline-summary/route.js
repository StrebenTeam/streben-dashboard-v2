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

    // Fetch all pipelines to build stage name map
    const pipelinesResult = await client.getPipelines(locationId);
    const pipelines = pipelinesResult.pipelines || pipelinesResult.data || [];

    const stageMap = {};
    for (const pipeline of pipelines) {
      if (pipeline.stages) {
        for (const stage of pipeline.stages) {
          stageMap[stage.id] = stage.name;
        }
      }
    }

    const stageBreakdown = {};
    let totalValue = 0;
    let totalOpportunities = 0;

    for (const pipeline of pipelines) {
      const result = await client.getOpportunities(locationId, pipeline.id);
      const opportunities = result.opportunities || result.data || [];

      for (const opp of opportunities) {
        totalOpportunities++;

        const stageName = opp.stageName || stageMap[opp.pipelineStageId] || 'Unknown';
        if (!stageBreakdown[stageName]) {
          stageBreakdown[stageName] = { count: 0, value: 0, sources: {} };
        }

        stageBreakdown[stageName].count++;
        stageBreakdown[stageName].value += parseFloat(opp.value) || 0;

        if (opp.source) {
          const source = opp.source;
          stageBreakdown[stageName].sources[source] = (stageBreakdown[stageName].sources[source] || 0) + 1;
        }

        totalValue += parseFloat(opp.value) || 0;
      }
    }

    return Response.json({
      stages: stageBreakdown,
      summary: {
        total_opportunities: totalOpportunities,
        total_value: totalValue,
      },
    });
  } catch (error) {
    console.error(`Error in GET /api/ghl/locations/pipeline-summary:`, error);
    return Response.json({ error: error.message || 'Failed to get pipeline summary' }, { status: error.status || 500 });
  }
}
