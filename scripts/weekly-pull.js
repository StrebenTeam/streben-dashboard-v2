/**
 * weekly-pull.js (Turso version)
 * Loads fresh Google Ads, Meta, and GHL data into Turso.
 *
 * Reads JSON files produced by pull-google-live.js and pull-meta-live.js
 * from the old project's data/weekly-pull/ directory, then writes to Turso.
 *
 * Usage: node scripts/weekly-pull.js [--google] [--meta] [--ghl] [--all]
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// JSON files live in the old project
const PULL_DIR = path.join(__dirname, '..', '..', 'streben-dashboard', 'data', 'weekly-pull');
const CONFIG = require('../lib/ghl-config.json');

// Account maps from config
const GOOGLE_ACCOUNTS = CONFIG.locations
  .filter(l => l.googleAdsAccountId)
  .map(l => ({ id: l.googleAdsAccountId, name: l.googleAdsAccountName }));

const META_ACCOUNTS = CONFIG.locations
  .filter(l => l.metaAccountId && l.adPlatform && l.adPlatform.includes('meta'))
  .map(l => ({ id: l.metaAccountId, name: l.metaAccountName, clientName: l.ghlLocationName }));

const GHL_LOCATIONS = CONFIG.locations
  .filter(l => !l.skipGhl && l.ghlLocationId && l.ghlToken)
  .map(l => ({ id: l.ghlLocationId, name: l.ghlLocationName, token: l.ghlToken }));

let db;

function getDb() {
  if (db) return db;
  if (process.env.TURSO_DATABASE_URL) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else if (process.env.LOCAL_DB_PATH) {
    db = createClient({ url: `file:${process.env.LOCAL_DB_PATH}` });
  } else {
    const dbPath = path.join(__dirname, '..', '..', 'streben-dashboard', 'data', 'streben.db');
    db = createClient({ url: `file:${dbPath}` });
  }
  return db;
}

async function run(sql, params = []) {
  return await getDb().execute({ sql, args: params });
}

async function runBatch(statements) {
  return await getDb().batch(statements);
}

function readPullFile(filename) {
  const fp = path.join(PULL_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error('  Failed to read ' + filename + ': ' + e.message);
    return null;
  }
}

// ========================================
// GOOGLE ADS
// ========================================
async function loadGoogleAds() {
  console.log('\n=== Google Ads ===');
  let loaded = 0;
  let errors = 0;

  for (const acct of GOOGLE_ACCOUNTS) {
    console.log('  ' + acct.name + ' (' + acct.id + ')');

    // Ensure account exists
    await run(
      "INSERT OR REPLACE INTO accounts (id, name, is_manager, parent_id, updated_at) VALUES (?, ?, 0, '5130868844', datetime('now'))",
      [acct.id, acct.name]
    );

    // Load campaign performance
    const campData = readPullFile('google-campaigns-' + acct.id + '.json');
    if (campData && campData.rows) {
      let weekMap = {};
      const campStatements = [];

      for (const row of campData.rows) {
        var ws = row.week_start || row['segments.week'] || '';
        var we = row.week_end || '';
        if (!ws) continue;

        var campId = row['campaign.id'] || row.campaign_id || '';
        var campName = row['campaign.name'] || row.campaign_name || '';
        var spend = parseFloat(row['metrics.cost_micros'] || row.cost || 0);
        if (row['metrics.cost_micros']) spend = spend / 1000000;
        var impressions = parseInt(row['metrics.impressions'] || row.impressions || 0);
        var clicks = parseInt(row['metrics.clicks'] || row.clicks || 0);
        var conversions = parseFloat(row['metrics.conversions'] || row.conversions || 0);
        var convValue = parseFloat(row['metrics.conversions_value'] || row.conversions_value || 0);
        var sis = parseFloat(row['metrics.search_impression_share'] || row.search_impression_share || 0);
        var blis = parseFloat(row['metrics.search_budget_lost_impression_share'] || row.budget_lost_is || 0);
        var rlis = parseFloat(row['metrics.search_rank_lost_impression_share'] || row.rank_lost_is || 0);
        var bidStrategy = row['campaign.bidding_strategy_type'] || row.bid_strategy || '';

        if (campId) {
          campStatements.push({
            sql: "INSERT OR REPLACE INTO campaign_snapshots (account_id, campaign_id, campaign_name, bid_strategy, week_start, week_end, spend, impressions, clicks, conversions, conversions_value, search_impression_share, budget_lost_is, rank_lost_is, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
            args: [acct.id, campId, campName, bidStrategy, ws, we, spend, impressions, clicks, conversions, convValue, sis, blis, rlis]
          });
        }

        if (!weekMap[ws]) {
          weekMap[ws] = { we, spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0, sis: 0, blis: 0, rlis: 0, count: 0 };
        }
        var w = weekMap[ws];
        w.spend += spend; w.impressions += impressions; w.clicks += clicks;
        w.conversions += conversions; w.convValue += convValue;
        w.sis += sis; w.blis += blis; w.rlis += rlis; w.count++;
      }

      // Batch insert campaign snapshots (chunks of 50)
      for (let i = 0; i < campStatements.length; i += 50) {
        await runBatch(campStatements.slice(i, i + 50));
      }

      // Weekly account-level snapshots
      const weekStatements = [];
      for (const [ws, w] of Object.entries(weekMap)) {
        var avgSis = w.count > 0 ? w.sis / w.count : 0;
        var avgBlis = w.count > 0 ? w.blis / w.count : 0;
        var avgRlis = w.count > 0 ? w.rlis / w.count : 0;
        weekStatements.push({
          sql: "INSERT OR REPLACE INTO weekly_snapshots (account_id, week_start, week_end, spend, impressions, clicks, conversions, conversions_value, search_impression_share, budget_lost_is, rank_lost_is, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
          args: [acct.id, ws, w.we, w.spend, w.impressions, w.clicks, w.conversions, w.convValue, avgSis, avgBlis, avgRlis]
        });
      }
      if (weekStatements.length > 0) await runBatch(weekStatements);

      console.log('    Campaigns: ' + campData.rows.length + ' rows, ' + Object.keys(weekMap).length + ' weeks');
      loaded++;
    } else {
      console.log('    No campaign data file found');
      errors++;
    }

    // Load search terms
    const stData = readPullFile('google-search-terms-' + acct.id + '.json');
    if (stData && stData.rows) {
      await run('DELETE FROM search_terms_cache WHERE account_id = ?', [acct.id]);

      const stStatements = [];
      for (const t of stData.rows) {
        var term = t['search_term_view.search_term'] || t.search_term || '';
        var status = t['search_term_view.status'] || t.status || 'NONE';
        var campName2 = t['campaign.name'] || t.campaign_name || '';
        var agName = t['ad_group.name'] || t.ad_group_name || '';
        var imp = parseInt(t['metrics.impressions'] || t.impressions || 0);
        var clk = parseInt(t['metrics.clicks'] || t.clicks || 0);
        var ctr2 = parseFloat(t['metrics.ctr'] || t.ctr || 0);
        var cost2 = parseFloat(t['metrics.cost_micros'] || t['metrics.cost'] || t.cost || 0);
        if (t['metrics.cost_micros']) cost2 = cost2 / 1000000;
        var conv2 = parseFloat(t['metrics.conversions'] || t.conversions || 0);

        stStatements.push({
          sql: "INSERT INTO search_terms_cache (account_id, search_term, status, campaign_name, ad_group_name, impressions, clicks, ctr, cost, conversions, cached_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))",
          args: [acct.id, term, status, campName2, agName, imp, clk, ctr2, cost2, conv2]
        });
      }

      // Batch in chunks of 100
      for (let i = 0; i < stStatements.length; i += 100) {
        await runBatch(stStatements.slice(i, i + 100));
      }
      console.log('    Search terms: ' + stData.rows.length + ' terms cached');
    } else {
      console.log('    No search term data file found');
    }
  }

  return { loaded, errors, total: GOOGLE_ACCOUNTS.length };
}

// ========================================
// META ADS
// ========================================
async function loadMeta() {
  console.log('\n=== Meta Ads ===');
  let loaded = 0;
  let errors = 0;

  for (const acct of META_ACCOUNTS) {
    console.log('  ' + acct.name + ' (' + acct.id + ')');

    await run(
      "INSERT OR REPLACE INTO meta_accounts (id, name, client_name, updated_at) VALUES (?, ?, ?, datetime('now'))",
      [acct.id, acct.name, acct.clientName]
    );

    const metaData = readPullFile('meta-campaigns-' + acct.id + '.json');
    if (metaData && metaData.weeks) {
      const weekStatements = [];
      for (const w of metaData.weeks) {
        var cpl = w.leads > 0 ? (w.spend / w.leads) : 0;
        var ctr = w.impressions > 0 ? (w.clicks / w.impressions * 100) : 0;
        var cpc = w.clicks > 0 ? (w.spend / w.clicks) : 0;

        weekStatements.push({
          sql: "INSERT OR REPLACE INTO meta_weekly_snapshots (account_id, week_start, week_end, spend, impressions, clicks, leads, landing_page_views, ctr, cpc, cost_per_lead, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
          args: [acct.id, w.start, w.end, w.spend, w.impressions, w.clicks, w.leads || 0, w.lpv || 0, ctr, cpc, cpl]
        });
      }
      if (weekStatements.length > 0) await runBatch(weekStatements);
      console.log('    Weekly snapshots: ' + metaData.weeks.length + ' weeks');

      if (metaData.campaigns) {
        const campStatements = [];
        for (const c of metaData.campaigns) {
          var campCpl = c.leads > 0 ? (c.spend / c.leads) : 0;
          campStatements.push({
            sql: "INSERT OR REPLACE INTO meta_campaign_snapshots (account_id, campaign_id, campaign_name, campaign_status, week_start, week_end, spend, impressions, clicks, leads, cost_per_lead, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
            args: [acct.id, c.campaign_id, c.campaign_name, c.status || 'ACTIVE', c.week_start, c.week_end, c.spend, c.impressions, c.clicks, c.leads || 0, campCpl]
          });
        }
        for (let i = 0; i < campStatements.length; i += 50) {
          await runBatch(campStatements.slice(i, i + 50));
        }
        console.log('    Campaign snapshots: ' + metaData.campaigns.length + ' rows');
      }
      loaded++;
    } else {
      console.log('    No meta data file found');
      errors++;
    }
  }

  return { loaded, errors, total: META_ACCOUNTS.length };
}

// ========================================
// GHL
// ========================================
async function loadGHL() {
  console.log('\n=== GHL / CRM ===');
  let loaded = 0;
  let errors = 0;
  var today = new Date().toISOString().split('T')[0];

  for (const loc of GHL_LOCATIONS) {
    console.log('  ' + loc.name + ' (' + loc.id + ')');

    const leadData = readPullFile('ghl-leads-' + loc.id + '.json');
    if (leadData) {
      await run(
        "INSERT OR REPLACE INTO ghl_lead_snapshots (location_id, snapshot_date, total_contacts, google_ads_leads, paid_search_leads, organic_leads, direct_leads, referral_leads, other_leads, meta_leads) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [loc.id, today, leadData.total || 0, leadData.google_ads || 0, leadData.paid_search || 0, leadData.organic || 0, leadData.direct || 0, leadData.referral || 0, leadData.other || 0, leadData.meta || 0]
      );
      const adLeads = (leadData.google_ads || 0) + (leadData.meta || 0) + (leadData.paid_search || 0);
      console.log('    Leads: ' + (leadData.total || 0) + ' total, ' + adLeads + ' from ads (Google: ' + (leadData.google_ads || 0) + ', Meta: ' + (leadData.meta || 0) + ')');
    }

    const pipeData = readPullFile('ghl-pipeline-' + loc.id + '.json');
    if (pipeData && pipeData.pipelines) {
      const pipeStatements = [];
      for (const p of pipeData.pipelines) {
        pipeStatements.push({
          sql: `INSERT OR REPLACE INTO ghl_pipeline_snapshots (
            location_id, pipeline_id, snapshot_date,
            new_lead, contacted, opportunity, booked, no_show, closed, bad_lead, total_value,
            new_lead_value, contacted_value, opportunity_count, opportunity_value,
            booked_value, no_show_value, closed_value, bad_lead_value,
            closed_revenue_google_ads, closed_revenue_meta, closed_revenue_paid_search,
            closed_revenue_organic, closed_revenue_direct, closed_revenue_referral, closed_revenue_other,
            ad_attributed_count, ad_attributed_value
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            loc.id, p.pipeline_id, today,
            p.new_lead || 0, p.contacted || 0, p.opportunity || 0, p.booked || 0,
            p.no_show || 0, p.closed || 0, p.bad_lead || 0, p.total_value || 0,
            p.new_lead_value || 0, p.contacted_value || 0, p.opportunity || 0, p.opportunity_value || 0,
            p.booked_value || 0, p.no_show_value || 0, p.closed_value || 0, p.bad_lead_value || 0,
            p.closed_revenue_google_ads || 0, p.closed_revenue_meta || 0, p.closed_revenue_paid_search || 0,
            p.closed_revenue_organic || 0, p.closed_revenue_direct || 0, p.closed_revenue_referral || 0,
            p.closed_revenue_other || 0,
            p.ad_attributed_count || 0, p.ad_attributed_value || 0,
          ]
        });
      }
      if (pipeStatements.length > 0) await runBatch(pipeStatements);
      for (const p of pipeData.pipelines) {
        const adRevenue = (p.closed_revenue_google_ads || 0) + (p.closed_revenue_meta || 0) + (p.closed_revenue_paid_search || 0);
        console.log('    Pipeline "' + (p.pipeline_name || p.pipeline_id) + '": ' + (p.total_opportunities || 0) + ' opps, $' + (p.total_value || 0).toFixed(2));
        console.log('      Closed: ' + (p.closed || 0) + ' ($' + (p.closed_value || 0).toFixed(2) + ') | Ad revenue: $' + adRevenue.toFixed(2));
      }
      loaded++;
    } else {
      if (leadData) loaded++;
      else {
        console.log('    No GHL data files found');
        errors++;
      }
    }
  }

  return { loaded, errors, total: GHL_LOCATIONS.length };
}

// ========================================
// PULL LOG
// ========================================
async function logPull(platform, result, durationMs, notes) {
  await run(
    "INSERT INTO pull_log (pull_date, platform, accounts_total, accounts_loaded, accounts_errors, duration_ms, notes) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)",
    [platform, result.total, result.loaded, result.errors, durationMs, notes || '']
  );
}

// ========================================
// MAIN
// ========================================
async function main() {
  var args = process.argv.slice(2);
  var doAll = args.includes('--all') || args.length === 0;
  var doGoogle = doAll || args.includes('--google');
  var doMeta = doAll || args.includes('--meta');
  var doGhl = doAll || args.includes('--ghl');

  console.log('Weekly Data Pull (Turso)');
  console.log('========================');
  console.log('Target: ' + (process.env.TURSO_DATABASE_URL ? 'Turso Cloud' : 'Local SQLite'));
  console.log('Google: ' + (doGoogle ? 'YES' : 'skip'));
  console.log('Meta:   ' + (doMeta ? 'YES' : 'skip'));
  console.log('GHL:    ' + (doGhl ? 'YES' : 'skip'));

  if (!fs.existsSync(PULL_DIR)) {
    fs.mkdirSync(PULL_DIR, { recursive: true });
  }

  var summary = [];

  if (doGoogle) {
    var t0 = Date.now();
    var gResult = await loadGoogleAds();
    var dur = Date.now() - t0;
    await logPull('google_ads', gResult, dur);
    summary.push('Google Ads: ' + gResult.loaded + '/' + gResult.total + ' accounts (' + gResult.errors + ' errors)');
  }

  if (doMeta) {
    var t1 = Date.now();
    var mResult = await loadMeta();
    var dur1 = Date.now() - t1;
    await logPull('meta_ads', mResult, dur1);
    summary.push('Meta Ads: ' + mResult.loaded + '/' + mResult.total + ' accounts (' + mResult.errors + ' errors)');
  }

  if (doGhl) {
    var t2 = Date.now();
    var ghlResult = await loadGHL();
    var dur2 = Date.now() - t2;
    await logPull('ghl', ghlResult, dur2);
    summary.push('GHL: ' + ghlResult.loaded + '/' + ghlResult.total + ' locations (' + ghlResult.errors + ' errors)');
  }

  console.log('\n========================');
  console.log('SUMMARY');
  console.log('========================');
  summary.forEach(s => console.log('  ' + s));

  // Write summary for scheduled tasks
  var summaryPath = path.join(PULL_DIR, 'last-pull-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    target: process.env.TURSO_DATABASE_URL ? 'turso' : 'local',
    results: summary,
    google: doGoogle,
    meta: doMeta,
    ghl: doGhl
  }, null, 2));
  console.log('Summary written to ' + summaryPath);

  getDb().close();
}

main().catch(e => {
  console.error('FATAL: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
