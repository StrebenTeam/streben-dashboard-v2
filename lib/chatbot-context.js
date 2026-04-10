/**
 * chatbot-context.js - Gathers account intelligence for chatbot prompts
 * Pulls from DB + Layers 1/2/3 to build compact context strings
 */

const { query, queryOne } = require('./db');
const { getBenchmarks } = require('./benchmarks');
const { computeHealthScore, analyzeTrends } = require('./trend-engine');
const { runRules } = require('./rule-engine');
const { GHLConfigManager } = require('./ghl-client');

const ghlConfig = new GHLConfigManager();

// Cache contexts for 5 min
const ctxCache = {};
const CTX_TTL = 5 * 60 * 1000;

function cached(key) {
  var e = ctxCache[key];
  if (!e || Date.now() - e.ts > CTX_TTL) return null;
  return e.data;
}
function setCtx(key, data) {
  ctxCache[key] = { data: data, ts: Date.now() };
}

/**
 * resolveAccount - Find account config by name, ID, or partial match
 */
function resolveAccount(nameOrId) {
  var locations = ghlConfig.getAllLocations();
  var lower = (nameOrId || '').toLowerCase().trim();

  // Exact ID match
  var exact = locations.find(function(l) {
    return l.googleAdsAccountId === nameOrId || l.metaAccountId === nameOrId;
  });
  if (exact) return exact;

  // Exact name match
  exact = locations.find(function(l) {
    return (l.ghlLocationName || '').toLowerCase() === lower ||
           (l.googleAdsAccountName || '').toLowerCase() === lower;
  });
  if (exact) return exact;

  // Partial match
  var partial = locations.find(function(l) {
    var name = (l.ghlLocationName || l.googleAdsAccountName || '').toLowerCase();
    return name.includes(lower) || lower.includes(name.split(' ')[0]);
  });
  return partial || null;
}

/**
 * buildAccountContext - Full intelligence context for one account
 */
async function buildAccountContext(accountIdOrName) {
  var loc = resolveAccount(accountIdOrName);
  if (!loc) return null;

  var accountId = loc.googleAdsAccountId;
  var ck = 'ctx_' + accountId;
  var c = cached(ck);
  if (c) return c;

  var accountName = loc.ghlLocationName || loc.googleAdsAccountName;
  var vertical = loc.vertical || 'healthcare';
  var benchmarks = getBenchmarks(vertical);

  // Weekly snapshots
  var weeklyHistory = await query(
    'SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC',
    [accountId]);

  if (weeklyHistory.length === 0) {
    return { accountId: accountId, accountName: accountName, error: 'No data' };
  }

  var latest = weeklyHistory[weeklyHistory.length - 1];
  var prior = weeklyHistory.length >= 2 ? weeklyHistory[weeklyHistory.length - 2] : null;

  // Health + trends
  var healthScore = computeHealthScore(weeklyHistory, benchmarks, vertical);
  var trends = analyzeTrends(weeklyHistory, null, benchmarks, vertical);

  // Campaigns
  var campaigns = await query(
    'SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?',
    [accountId, latest.week_start]);
  var priorCampaigns = prior ? await query(
    'SELECT * FROM campaign_snapshots WHERE account_id = ? AND week_start = ?',
    [accountId, prior.week_start]) : [];
  var campaignHistory = await query(
    'SELECT * FROM campaign_snapshots WHERE account_id = ? ORDER BY week_start DESC LIMIT 200',
    [accountId]);

  // Layer 1 alerts
  var alerts = [];
  try {
    var hist = weeklyHistory.slice(-8);
    alerts = runRules({
      accountId: accountId, vertical: vertical,
      currentWeek: latest, priorWeek: prior,
      weeklyHistory: hist, campaigns: campaigns, priorCampaigns: priorCampaigns,
      campaignHistory: campaignHistory, metaData: null, ghlData: null
    });
  } catch (e) { /* alerts optional */ }

  var ctx = {
    accountId: accountId,
    accountName: accountName,
    vertical: vertical,
    verticalLabel: benchmarks.label,
    platform: loc.adPlatform || 'google',
    healthScore: healthScore,
    trends: trends,
    latestWeek: latest,
    priorWeek: prior,
    campaigns: campaigns,
    alerts: alerts,
    benchmarks: {
      google: benchmarks.google
    },
    weeksOfData: weeklyHistory.length,
    weeklyHistory: weeklyHistory.slice(-6) // last 6 weeks for trend context
  };

  setCtx(ck, ctx);
  return ctx;
}

/**
 * contextToPrompt - Converts context object to compact text for system prompt
 */
function contextToPrompt(ctx) {
  if (!ctx || ctx.error) return 'No data available for this account.';

  var h = ctx.healthScore || {};
  var bd = h.breakdown || {};
  var lw = ctx.latestWeek || {};
  var pw = ctx.priorWeek || {};
  var conv = lw.conversions || 0;
  var cpl = conv > 0 ? (lw.spend / conv).toFixed(2) : 'N/A';
  var ctr = lw.clicks > 0 && lw.impressions > 0 ? ((lw.clicks / lw.impressions) * 100).toFixed(2) : '0';
  var cpc = lw.clicks > 0 ? (lw.spend / lw.clicks).toFixed(2) : 'N/A';

  var lines = [
    '== ACCOUNT: ' + ctx.accountName + ' ==',
    'ID: ' + ctx.accountId + ' | Vertical: ' + ctx.verticalLabel + ' | Platform: ' + ctx.platform,
    'Health: ' + (h.grade || 'N/A') + ' (' + (h.score || 0) + '/100)',
    'Breakdown: CPL=' + (bd.cpl||0) + '/100, ConvRate=' + (bd.convRate||0) + '/100, ImpShare=' + (bd.impressionShare||0) + '/100, CTR=' + (bd.ctr||0) + '/100, CPC=' + (bd.cpc||0) + '/100, Momentum=' + (bd.momentum||0) + '/100',
    '',
    'LATEST WEEK (' + lw.week_start + '):',
    '  Spend: $' + (lw.spend||0).toFixed(2) + ' | Impressions: ' + (lw.impressions||0) + ' | Clicks: ' + (lw.clicks||0),
    '  Conversions: ' + conv.toFixed(1) + ' | CPL: $' + cpl + ' | CPC: $' + cpc + ' | CTR: ' + ctr + '%',
    '  Search Impression Share: ' + ((lw.search_impression_share||0)*100).toFixed(1) + '%'
  ];

  if (pw && pw.week_start) {
    var pConv = pw.conversions || 0;
    var pCpl = pConv > 0 ? (pw.spend / pConv).toFixed(2) : 'N/A';
    lines.push('PRIOR WEEK (' + pw.week_start + '):');
    lines.push('  Spend: $' + (pw.spend||0).toFixed(2) + ' | Conv: ' + pConv.toFixed(1) + ' | CPL: $' + pCpl);
  }

  // Weekly trend (compact)
  if (ctx.weeklyHistory && ctx.weeklyHistory.length > 1) {
    lines.push('');
    lines.push('WEEKLY TREND (last ' + ctx.weeklyHistory.length + ' weeks):');
    ctx.weeklyHistory.forEach(function(w) {
      var c = w.conversions || 0;
      var cl = c > 0 ? '$' + (w.spend / c).toFixed(0) : 'N/A';
      lines.push('  ' + w.week_start + ': $' + (w.spend||0).toFixed(0) + ' spend, ' + c.toFixed(0) + ' conv, CPL ' + cl);
    });
  }

  // Trends
  if (ctx.trends && ctx.trends.insights && ctx.trends.insights.length > 0) {
    lines.push('');
    lines.push('DETECTED TRENDS:');
    ctx.trends.insights.forEach(function(t) {
      lines.push('  ' + t.metric + ': ' + t.direction + ' (confidence r2=' + (t.confidence||0).toFixed(2) + ')');
    });
  }

  // Campaigns
  if (ctx.campaigns && ctx.campaigns.length > 0) {
    lines.push('');
    lines.push('CAMPAIGNS (this week):');
    ctx.campaigns.forEach(function(c) {
      lines.push('  ' + (c.campaign_name||'Unknown') + ' [' + (c.campaign_id||'?') + ']: $' + (c.spend||0).toFixed(2) + ', ' + (c.clicks||0) + ' clicks, ' + (c.conversions||0).toFixed(1) + ' conv');
    });
  }

  // Alerts
  if (ctx.alerts && ctx.alerts.length > 0) {
    lines.push('');
    lines.push('ACTIVE ALERTS:');
    ctx.alerts.forEach(function(a) {
      lines.push('  [' + a.severity + '] ' + a.title + (a.description ? ': ' + a.description.slice(0, 100) : ''));
    });
  }

  // Benchmarks
  if (ctx.benchmarks && ctx.benchmarks.google) {
    var bg = ctx.benchmarks.google;
    lines.push('');
    lines.push('INDUSTRY BENCHMARKS (' + ctx.verticalLabel + '):');
    if (bg.cpc) lines.push('  CPC: $' + bg.cpc.low + ' (low) / $' + bg.cpc.expected + ' (expected) / $' + bg.cpc.high + ' (high)');
    if (bg.ctr) lines.push('  CTR: ' + (bg.ctr.low*100).toFixed(1) + '% (low) / ' + (bg.ctr.expected*100).toFixed(1) + '% (expected) / ' + (bg.ctr.good*100).toFixed(1) + '% (good)');
    if (bg.cpl) lines.push('  CPL: $' + bg.cpl.good + ' (good) / $' + bg.cpl.expected + ' (expected) / $' + bg.cpl.high + ' (high)');
    if (bg.impressionShare) lines.push('  Impression Share target: ' + (bg.impressionShare.generic.target*100).toFixed(0) + '%');
  }

  return lines.join('\n');
}

/**
 * buildPortfolioContext - Quick context for all accounts
 */
async function buildPortfolioContext() {
  var locations = ghlConfig.getAllLocations();
  var lines = ['== PORTFOLIO OVERVIEW =='];

  for (var i = 0; i < locations.length; i++) {
    var loc = locations[i];
    if (!loc.googleAdsAccountId || loc.vertical === 'agency') continue;
    var accountId = loc.googleAdsAccountId;
    var vertical = loc.vertical || 'healthcare';
    var benchmarks = getBenchmarks(vertical);
    var weeklyHistory = await query(
      'SELECT * FROM weekly_snapshots WHERE account_id = ? ORDER BY week_start ASC',
      [accountId]);
    if (weeklyHistory.length === 0) continue;
    var h = computeHealthScore(weeklyHistory, benchmarks, vertical);
    var lw = weeklyHistory[weeklyHistory.length - 1];
    var conv = lw.conversions || 0;
    var cpl = conv > 0 ? '$' + (lw.spend / conv).toFixed(0) : 'N/A';
    lines.push((loc.ghlLocationName || loc.googleAdsAccountName) + ' [' + accountId + ']: ' +
      (h.grade || '?') + ' (' + (h.score||0) + '/100), $' + (lw.spend||0).toFixed(0) + '/wk, ' +
      conv.toFixed(0) + ' conv, CPL ' + cpl);
  }

  return lines.join('\n');
}

/**
 * listAccounts - Simple account list for the LLM
 */
function listAccounts() {
  var locations = ghlConfig.getAllLocations();
  return locations
    .filter(function(l) { return l.googleAdsAccountId && l.vertical !== 'agency'; })
    .map(function(l) {
      return { id: l.googleAdsAccountId, name: l.ghlLocationName || l.googleAdsAccountName, vertical: l.vertical };
    });
}

module.exports = {
  resolveAccount: resolveAccount,
  buildAccountContext: buildAccountContext,
  contextToPrompt: contextToPrompt,
  buildPortfolioContext: buildPortfolioContext,
  listAccounts: listAccounts
};
