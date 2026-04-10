import { query } from '@/lib/db';
import { GHLConfigManager } from '@/lib/ghl-client';

let configManager;
try {
  configManager = new GHLConfigManager();
} catch (e) {
  configManager = null;
}

function getDateRangeForType(rangeType) {
  const today = new Date();
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - today.getUTCDay() + (today.getUTCDay() === 0 ? -6 : 1) - 1);

  let start, priorStart, priorEnd;

  if (rangeType === 'last-week') {
    start = new Date(end); start.setUTCDate(start.getUTCDate() - 6);
    priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 6);
  } else if (rangeType === 'last-2-weeks') {
    start = new Date(end); start.setUTCDate(start.getUTCDate() - 13);
    priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 13);
  } else if (rangeType === 'last-month') {
    start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
    priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 27);
  } else if (rangeType === 'last-quarter') {
    start = new Date(end); start.setUTCDate(start.getUTCDate() - 90);
    priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 90);
  } else if (rangeType === 'ytd') {
    start = new Date(end.getUTCFullYear(), 0, 1);
    priorStart = new Date(start.getUTCFullYear() - 1, 0, 1);
    priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  } else {
    start = new Date(end); start.setUTCDate(start.getUTCDate() - 6);
    priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 6);
  }

  return {
    currentStart: start.toISOString().split('T')[0],
    currentEnd: end.toISOString().split('T')[0],
    priorStart: priorStart.toISOString().split('T')[0],
    priorEnd: priorEnd.toISOString().split('T')[0],
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'last-week';
    const dates = getDateRangeForType(range);

    // Get location metadata from config
    const locations = configManager ? configManager.getAllLocations() : [];

    // Query lead snapshots for current and prior periods
    const currentLeads = await query(
      `SELECT location_id,
        MAX(snapshot_date) as snapshot_date,
        total_contacts, google_ads_leads, paid_search_leads, organic_leads,
        direct_leads, referral_leads, other_leads, meta_leads
      FROM ghl_lead_snapshots
      WHERE snapshot_date BETWEEN ? AND ?
      GROUP BY location_id`,
      [dates.currentStart, dates.currentEnd]
    );

    const priorLeads = await query(
      `SELECT location_id,
        MAX(snapshot_date) as snapshot_date,
        total_contacts, google_ads_leads, paid_search_leads, organic_leads,
        direct_leads, referral_leads, other_leads, meta_leads
      FROM ghl_lead_snapshots
      WHERE snapshot_date BETWEEN ? AND ?
      GROUP BY location_id`,
      [dates.priorStart, dates.priorEnd]
    );

    // Query pipeline snapshots for current and prior periods
    const currentPipeline = await query(
      `SELECT location_id, pipeline_id,
        MAX(snapshot_date) as snapshot_date,
        new_lead, contacted, opportunity_count, booked, no_show, closed, bad_lead,
        total_value, new_lead_value, contacted_value, opportunity_value,
        booked_value, no_show_value, closed_value, bad_lead_value,
        closed_revenue_google_ads, closed_revenue_meta, closed_revenue_paid_search,
        closed_revenue_organic, closed_revenue_direct, closed_revenue_referral, closed_revenue_other,
        ad_attributed_count, ad_attributed_value
      FROM ghl_pipeline_snapshots
      WHERE snapshot_date BETWEEN ? AND ?
      GROUP BY location_id, pipeline_id`,
      [dates.currentStart, dates.currentEnd]
    );

    const priorPipeline = await query(
      `SELECT location_id, pipeline_id,
        MAX(snapshot_date) as snapshot_date,
        new_lead, contacted, opportunity_count, booked, no_show, closed, bad_lead,
        total_value, closed_value,
        closed_revenue_google_ads, closed_revenue_meta, closed_revenue_paid_search,
        ad_attributed_count, ad_attributed_value
      FROM ghl_pipeline_snapshots
      WHERE snapshot_date BETWEEN ? AND ?
      GROUP BY location_id, pipeline_id`,
      [dates.priorStart, dates.priorEnd]
    );

    // Index prior data by location_id
    const priorLeadMap = {};
    for (const row of priorLeads) {
      priorLeadMap[row.location_id] = row;
    }
    const priorPipeMap = {};
    for (const row of priorPipeline) {
      if (!priorPipeMap[row.location_id]) priorPipeMap[row.location_id] = [];
      priorPipeMap[row.location_id].push(row);
    }

    // Build response per location
    const locationResults = [];
    const totals = {
      contacts: 0, googleAdsLeads: 0, metaLeads: 0, paidSearchLeads: 0,
      organicLeads: 0, directLeads: 0, referralLeads: 0, otherLeads: 0,
      totalPipeline: 0, booked: 0, closed: 0, badLeads: 0,
      closedValue: 0, adAttributedValue: 0,
      closedRevenueGoogleAds: 0, closedRevenueMeta: 0, closedRevenuePaidSearch: 0,
      // Prior period totals for deltas
      priorContacts: 0, priorClosed: 0, priorClosedValue: 0, priorBooked: 0,
    };

    const currentLeadMap = {};
    for (const row of currentLeads) {
      currentLeadMap[row.location_id] = row;
    }
    const currentPipeMap = {};
    for (const row of currentPipeline) {
      if (!currentPipeMap[row.location_id]) currentPipeMap[row.location_id] = [];
      currentPipeMap[row.location_id].push(row);
    }

    for (const loc of locations) {
      const locationId = loc.ghlLocationId;
      const leads = currentLeadMap[locationId];
      const pipes = currentPipeMap[locationId] || [];
      const priorLead = priorLeadMap[locationId];
      const priorPipes = priorPipeMap[locationId] || [];

      // Aggregate pipeline stages
      let locPipeline = { newLead: 0, contacted: 0, opportunity: 0, booked: 0, noShow: 0, closed: 0, badLead: 0, total: 0 };
      let locRevenue = { closedValue: 0, googleAds: 0, meta: 0, paidSearch: 0, organic: 0, direct: 0, referral: 0, other: 0, adCount: 0, adValue: 0 };
      let priorPipeTotals = { closed: 0, closedValue: 0, booked: 0 };

      for (const p of pipes) {
        locPipeline.newLead += Number(p.new_lead) || 0;
        locPipeline.contacted += Number(p.contacted) || 0;
        locPipeline.opportunity += Number(p.opportunity_count) || 0;
        locPipeline.booked += Number(p.booked) || 0;
        locPipeline.noShow += Number(p.no_show) || 0;
        locPipeline.closed += Number(p.closed) || 0;
        locPipeline.badLead += Number(p.bad_lead) || 0;
        locPipeline.total += (Number(p.new_lead) || 0) + (Number(p.contacted) || 0) + (Number(p.booked) || 0) + (Number(p.closed) || 0) + (Number(p.bad_lead) || 0) + (Number(p.no_show) || 0) + (Number(p.opportunity_count) || 0);
        locRevenue.closedValue += Number(p.closed_value) || 0;
        locRevenue.googleAds += Number(p.closed_revenue_google_ads) || 0;
        locRevenue.meta += Number(p.closed_revenue_meta) || 0;
        locRevenue.paidSearch += Number(p.closed_revenue_paid_search) || 0;
        locRevenue.organic += Number(p.closed_revenue_organic) || 0;
        locRevenue.direct += Number(p.closed_revenue_direct) || 0;
        locRevenue.referral += Number(p.closed_revenue_referral) || 0;
        locRevenue.other += Number(p.closed_revenue_other) || 0;
        locRevenue.adCount += Number(p.ad_attributed_count) || 0;
        locRevenue.adValue += Number(p.ad_attributed_value) || 0;
      }

      for (const p of priorPipes) {
        priorPipeTotals.closed += Number(p.closed) || 0;
        priorPipeTotals.closedValue += Number(p.closed_value) || 0;
        priorPipeTotals.booked += Number(p.booked) || 0;
      }

      const locData = {
        ghlLocationId: locationId,
        ghlLocationName: loc.ghlLocationName,
        googleAdsAccountId: loc.googleAdsAccountId,
        adPlatform: loc.adPlatform,
        contacts: {
          total: Number(leads?.total_contacts) || 0,
          googleAds: Number(leads?.google_ads_leads) || 0,
          meta: Number(leads?.meta_leads) || 0,
          paidSearch: Number(leads?.paid_search_leads) || 0,
          organic: Number(leads?.organic_leads) || 0,
          direct: Number(leads?.direct_leads) || 0,
          referral: Number(leads?.referral_leads) || 0,
          other: Number(leads?.other_leads) || 0,
          priorTotal: Number(priorLead?.total_contacts) || 0,
        },
        pipeline: {
          stages: {
            'New Lead': locPipeline.newLead,
            'Contacted': locPipeline.contacted,
            'Opportunity': locPipeline.opportunity,
            'Booked': locPipeline.booked,
            'No Show': locPipeline.noShow,
            'Closed': locPipeline.closed,
            'Bad Lead': locPipeline.badLead,
          },
          total: locPipeline.total,
        },
        revenue: locRevenue,
        prior: priorPipeTotals,
      };

      // Accumulate totals
      totals.contacts += locData.contacts.total;
      totals.googleAdsLeads += locData.contacts.googleAds;
      totals.metaLeads += locData.contacts.meta;
      totals.paidSearchLeads += locData.contacts.paidSearch;
      totals.organicLeads += locData.contacts.organic;
      totals.directLeads += locData.contacts.direct;
      totals.referralLeads += locData.contacts.referral;
      totals.otherLeads += locData.contacts.other;
      totals.totalPipeline += locPipeline.total;
      totals.booked += locPipeline.booked;
      totals.closed += locPipeline.closed;
      totals.badLeads += locPipeline.badLead;
      totals.closedValue += locRevenue.closedValue;
      totals.adAttributedValue += locRevenue.adValue;
      totals.closedRevenueGoogleAds += locRevenue.googleAds;
      totals.closedRevenueMeta += locRevenue.meta;
      totals.closedRevenuePaidSearch += locRevenue.paidSearch;
      totals.priorContacts += Number(priorLead?.total_contacts) || 0;
      totals.priorClosed += priorPipeTotals.closed;
      totals.priorClosedValue += priorPipeTotals.closedValue;
      totals.priorBooked += priorPipeTotals.booked;

      locationResults.push(locData);
    }

    return Response.json({
      locations: locationResults,
      totals,
      range: dates,
      source: 'turso',
    });
  } catch (error) {
    console.error('Error in GET /api/ghl/snapshots:', error);
    return Response.json({ error: error.message || 'Failed to get GHL snapshots' }, { status: 500 });
  }
}
