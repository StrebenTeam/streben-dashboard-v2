/**
 * pull-ghl-live.js
 * Pulls live lead + pipeline data from GHL API for each sub-account
 * and saves JSON files for weekly-pull.js to ingest into Turso.
 *
 * Output: data/weekly-pull/ghl-leads-{locationId}.json
 *         data/weekly-pull/ghl-pipeline-{locationId}.json
 *
 * Usage: node scripts/pull-ghl-live.js
 */

const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../lib/ghl-config.json');
const PULL_DIR = path.join(__dirname, '..', '..', 'streben-dashboard', 'data', 'weekly-pull');

const LOCATIONS = CONFIG.locations
  .filter(l => l.ghlToken && !l.skipGhl)
  .map(l => ({ id: l.ghlLocationId, name: l.ghlLocationName, token: l.ghlToken }));

// ============================================
// HTTP helper (same pattern as ghl-client.js)
// ============================================
function ghlRequest(method, endpoint, token, queryParams = {}) {
  const url = new URL(endpoint, 'https://services.leadconnectorhq.com');
  Object.entries(queryParams).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.append(k, v);
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, message: parsed?.message || `HTTP ${res.statusCode}`, data: parsed });
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ============================================
// Source categorization
// ============================================
function categorizeSource(source) {
  if (!source) return 'other';
  const s = source.toLowerCase();
  // Google Ads specific
  if (s.includes('google ads') || s.includes('google ad') || s.includes('google_ads')) return 'google_ads';
  // Meta/Facebook/Instagram
  if (s.includes('facebook') || s.includes('meta') || s.includes('instagram') || s.includes('fb ')) return 'meta';
  // Paid Search (generic — could be Google or Bing)
  if (s.includes('paid search') || s.includes('ppc') || s.includes('cpc')) return 'paid_search';
  // Organic
  if (s.includes('organic')) return 'organic';
  // Direct
  if (s.includes('direct')) return 'direct';
  // Referral
  if (s.includes('referral')) return 'referral';
  return 'other';
}

function isAdSource(category) {
  return category === 'google_ads' || category === 'meta' || category === 'paid_search';
}

// ============================================
// Pull contacts for a location (paginated)
// ============================================
async function pullContacts(locationId, token) {
  const sourceCounts = {};
  let total = 0;
  let hasMore = true;
  let startAfterId = null;

  while (hasMore) {
    const params = { locationId, limit: 100 };
    if (startAfterId) params.startAfterId = startAfterId;

    const result = await ghlRequest('GET', '/contacts/', token, params);
    const contacts = result.contacts || result.data || [];

    if (contacts.length === 0) {
      hasMore = false;
    } else {
      for (const c of contacts) {
        total++;
        const cat = categorizeSource(c.source);
        sourceCounts[cat] = (sourceCounts[cat] || 0) + 1;
      }

      if (result.startAfter) {
        startAfterId = result.startAfter;
      } else if (result.meta?.startAfterId) {
        startAfterId = result.meta.startAfterId;
      } else {
        hasMore = false;
      }
    }

    // Safety: cap at 5000 contacts to avoid infinite loops
    if (total >= 5000) {
      console.log(`    [!] Hit 5000 contact cap, stopping pagination`);
      hasMore = false;
    }
  }

  return {
    total,
    google_ads: sourceCounts.google_ads || 0,
    meta: sourceCounts.meta || 0,
    paid_search: sourceCounts.paid_search || 0,
    organic: sourceCounts.organic || 0,
    direct: sourceCounts.direct || 0,
    referral: sourceCounts.referral || 0,
    other: sourceCounts.other || 0,
  };
}

// ============================================
// Pull pipeline + revenue data for a location
// ============================================
async function pullPipeline(locationId, token) {
  // 1. Get all pipelines and build stage name map
  const pipelinesResult = await ghlRequest('GET', '/opportunities/pipelines', token, { locationId });
  const pipelines = pipelinesResult.pipelines || pipelinesResult.data || [];

  const results = [];

  for (const pipeline of pipelines) {
    const stageMap = {};
    (pipeline.stages || []).forEach(s => { stageMap[s.id] = s.name; });

    // 2. Get all opportunities for this pipeline (paginated via cursor)
    let opps = [];
    let hasMoreOpps = true;
    let cursor = {};
    while (hasMoreOpps) {
      const params = { location_id: locationId, pipeline_id: pipeline.id, limit: 100 };
      if (cursor.startAfter) params.startAfter = cursor.startAfter;
      if (cursor.startAfterId) params.startAfterId = cursor.startAfterId;

      const oppsResult = await ghlRequest('GET', '/opportunities/search', token, params);
      const batch = oppsResult.opportunities || oppsResult.data || [];
      if (batch.length === 0) {
        hasMoreOpps = false;
      } else {
        opps = opps.concat(batch);
        // Use cursor from meta for next page
        if (oppsResult.meta?.startAfterId) {
          cursor = { startAfter: oppsResult.meta.startAfter, startAfterId: oppsResult.meta.startAfterId };
        } else {
          hasMoreOpps = false;
        }
        // Safety cap
        if (opps.length >= 2000) {
          console.log(`    [!] Hit 2000 opportunity cap for pipeline ${pipeline.name}`);
          hasMoreOpps = false;
        }
        // If batch < limit, no more pages
        if (batch.length < 100) hasMoreOpps = false;
      }
    }

    // Stage counters
    const stages = {
      new_lead: { count: 0, value: 0 },
      contacted: { count: 0, value: 0 },
      opportunity: { count: 0, value: 0 },
      booked: { count: 0, value: 0 },
      no_show: { count: 0, value: 0 },
      closed: { count: 0, value: 0 },
      bad_lead: { count: 0, value: 0 },
      other: { count: 0, value: 0 },
    };

    // Revenue by source (for all stages, and specifically for closed)
    const revenueBySource = {
      google_ads: 0,
      meta: 0,
      paid_search: 0,
      organic: 0,
      direct: 0,
      referral: 0,
      other: 0,
    };

    // Ad-attributed metrics
    let adAttributedCount = 0;
    let adAttributedValue = 0;
    let totalValue = 0;

    for (const opp of opps) {
      const rawStage = (stageMap[opp.pipelineStageId] || opp.stageName || 'Unknown').toLowerCase().trim();
      const value = parseFloat(opp.monetaryValue) || parseFloat(opp.monetary_value) || parseFloat(opp.value) || 0;
      const source = categorizeSource(opp.source);

      // Map to normalized stage name
      let stageKey = 'other';
      if (rawStage.includes('new') && rawStage.includes('lead')) stageKey = 'new_lead';
      else if (rawStage.includes('contact')) stageKey = 'contacted';
      else if (rawStage === 'opportunity') stageKey = 'opportunity';
      else if (rawStage.includes('book')) stageKey = 'booked';
      else if (rawStage.includes('no show') || rawStage.includes('no-show')) stageKey = 'no_show';
      else if (rawStage.includes('close') || rawStage.includes('won')) stageKey = 'closed';
      else if (rawStage.includes('bad') || rawStage.includes('lost') || rawStage.includes('disqualif') || rawStage.includes('dead')) stageKey = 'bad_lead';
      else if (rawStage.includes('future')) stageKey = 'new_lead'; // future leads count as new

      stages[stageKey].count++;
      stages[stageKey].value += value;
      totalValue += value;

      // Track revenue by source for closed deals
      if (stageKey === 'closed') {
        revenueBySource[source] += value;
      }

      // Track ad-attributed opportunities
      if (isAdSource(source)) {
        adAttributedCount++;
        adAttributedValue += value;
      }
    }

    results.push({
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      new_lead: stages.new_lead.count,
      new_lead_value: stages.new_lead.value,
      contacted: stages.contacted.count,
      contacted_value: stages.contacted.value,
      opportunity: stages.opportunity.count,
      opportunity_value: stages.opportunity.value,
      booked: stages.booked.count,
      booked_value: stages.booked.value,
      no_show: stages.no_show.count,
      no_show_value: stages.no_show.value,
      closed: stages.closed.count,
      closed_value: stages.closed.value,
      bad_lead: stages.bad_lead.count,
      bad_lead_value: stages.bad_lead.value,
      total_opportunities: opps.length,
      total_value: totalValue,
      // Revenue from closed deals broken down by source
      closed_revenue_google_ads: revenueBySource.google_ads,
      closed_revenue_meta: revenueBySource.meta,
      closed_revenue_paid_search: revenueBySource.paid_search,
      closed_revenue_organic: revenueBySource.organic,
      closed_revenue_direct: revenueBySource.direct,
      closed_revenue_referral: revenueBySource.referral,
      closed_revenue_other: revenueBySource.other,
      // Ad-attributed totals (across all stages)
      ad_attributed_count: adAttributedCount,
      ad_attributed_value: adAttributedValue,
    });
  }

  return { pipelines: results };
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('GHL Live Pull');
  console.log('=============');
  console.log(`Locations: ${LOCATIONS.length}`);
  console.log(`Output: ${PULL_DIR}\n`);

  if (!fs.existsSync(PULL_DIR)) {
    fs.mkdirSync(PULL_DIR, { recursive: true });
  }

  let success = 0;
  let errors = 0;

  for (const loc of LOCATIONS) {
    console.log(`${loc.name} (${loc.id})`);

    try {
      // Pull contacts
      const leads = await pullContacts(loc.id, loc.token);
      const leadsPath = path.join(PULL_DIR, `ghl-leads-${loc.id}.json`);
      fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
      console.log(`  Contacts: ${leads.total} (Google Ads: ${leads.google_ads}, Meta: ${leads.meta}, Paid: ${leads.paid_search}, Organic: ${leads.organic})`);

      // Pull pipeline
      const pipeline = await pullPipeline(loc.id, loc.token);
      const pipePath = path.join(PULL_DIR, `ghl-pipeline-${loc.id}.json`);
      fs.writeFileSync(pipePath, JSON.stringify(pipeline, null, 2));

      for (const p of pipeline.pipelines) {
        console.log(`  Pipeline "${p.pipeline_name}": ${p.total_opportunities} opps, $${p.total_value.toFixed(2)} total`);
        console.log(`    Closed: ${p.closed} ($${p.closed_value.toFixed(2)}) | Booked: ${p.booked} | Bad: ${p.bad_lead}`);
        console.log(`    Ad-attributed: ${p.ad_attributed_count} opps, $${p.ad_attributed_value.toFixed(2)}`);
        if (p.closed_revenue_google_ads > 0 || p.closed_revenue_meta > 0) {
          console.log(`    Closed from ads: Google $${p.closed_revenue_google_ads.toFixed(2)}, Meta $${p.closed_revenue_meta.toFixed(2)}`);
        }
      }

      success++;
    } catch (err) {
      console.log(`  ERROR: ${err.message || JSON.stringify(err)}`);
      errors++;
    }

    // Rate limiting — GHL has strict limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=============`);
  console.log(`Done: ${success}/${LOCATIONS.length} locations (${errors} errors)`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
