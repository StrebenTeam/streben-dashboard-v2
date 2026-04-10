/**
 * rule-engine.js
 * Layer 1 intelligence: deterministic rule-based alerts.
 *
 * Takes weekly snapshot data from the database, applies vertical-specific
 * benchmarks, and produces categorized alerts with severity and actions.
 *
 * No LLM calls. Zero marginal cost per run.
 */

const { getBenchmarks } = require('./benchmarks');

// ─── SEVERITY LEVELS ────────────────────────────────────────────────────────
const CRITICAL = 'critical';    // Immediate action needed, significant waste
const WARNING = 'warning';      // Should address within the week
const INFO = 'info';            // Worth monitoring, no immediate action
const OPPORTUNITY = 'opportunity'; // Potential upside if acted on

// ─── ALERT CATEGORIES ───────────────────────────────────────────────────────
const CATEGORIES = {
  SPEND_EFFICIENCY: 'spend_efficiency',
  IMPRESSION_SHARE: 'impression_share',
  QUALITY: 'quality',
  TREND: 'trend',
  META_CREATIVE: 'meta_creative',
  PIPELINE: 'pipeline',
  DAYPART: 'daypart',
  GEO: 'geo',
  NEGATIVE_KEYWORDS: 'negative_keywords',
  BUDGET: 'budget',
};

/**
 * Run all rules for a single account.
 *
 * @param {Object} params
 * @param {string} params.accountId - Google Ads account ID
 * @param {string} params.vertical - Vertical key (senior_living, fitness, etc.)
 * @param {Array}  params.currentWeek - Array of weekly_snapshots for current week
 * @param {Array}  params.priorWeek - Array of weekly_snapshots for prior week
 * @param {Array}  params.weeklyHistory - Last 8 weeks of weekly_snapshots
 * @param {Array}  params.campaigns - campaign_snapshots for current week
 * @param {Array}  params.priorCampaigns - campaign_snapshots for prior week
 * @param {Array}  params.campaignHistory - Last 8 weeks of campaign_snapshots
 * @param {Object} params.metaData - Meta weekly/campaign data (optional)
 * @param {Object} params.ghlData - GHL pipeline data (optional)
 * @returns {Array} Array of alert objects
 */
function runRules(params) {
  const benchmarks = getBenchmarks(params.vertical);
  const alerts = [];

  // Run each rule category
  alerts.push(...spendEfficiencyRules(params, benchmarks));
  alerts.push(...impressionShareRules(params, benchmarks));
  alerts.push(...trendRules(params, benchmarks));
  alerts.push(...campaignLevelRules(params, benchmarks));
  alerts.push(...campaignTrendRules(params, benchmarks));
  alerts.push(...metaCreativeRules(params, benchmarks));
  alerts.push(...budgetRules(params, benchmarks));

  // Sort by severity (critical first), then by category
  const severityOrder = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  alerts.sort(function(a, b) {
    return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
  });

  return alerts;
}


// ─── SPEND EFFICIENCY RULES ─────────────────────────────────────────────────

function spendEfficiencyRules(params, benchmarks) {
  const alerts = [];
  const current = params.currentWeek;
  if (!current || !current.spend) return alerts;

  const gb = benchmarks.google;

  // Rule: CPC above ceiling
  if (current.clicks > 0) {
    const cpc = current.spend / current.clicks;
    if (cpc > gb.cpc.ceiling) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'CPC above industry ceiling',
        description: 'Average CPC of $' + cpc.toFixed(2) + ' exceeds the ' + benchmarks.label +
          ' ceiling of $' + gb.cpc.ceiling.toFixed(2) + '. Review keyword match types and Quality Scores.',
        metric: 'cpc',
        value: cpc,
        benchmark: gb.cpc.ceiling,
        action: 'Review broad match keywords, pause low-QS terms, check auction insights for new competitors.',
      });
    } else if (cpc > gb.cpc.high) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'CPC running high',
        description: 'Average CPC of $' + cpc.toFixed(2) + ' is above the typical range ($' +
          gb.cpc.expected.toFixed(2) + ') for ' + benchmarks.label + '.',
        metric: 'cpc',
        value: cpc,
        benchmark: gb.cpc.high,
        action: 'Check Quality Scores and auction competition. May be acceptable if conversion rate is strong.',
      });
    }
  }

  // Rule: CTR below critical threshold
  if (current.impressions > 100) {
    const ctr = current.clicks / current.impressions;
    if (ctr < gb.ctr.critical) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'CTR critically low',
        description: 'CTR of ' + (ctr * 100).toFixed(2) + '% is below the critical threshold of ' +
          (gb.ctr.critical * 100).toFixed(1) + '% for ' + benchmarks.label +
          '. Ads may not be relevant to the search queries triggering them.',
        metric: 'ctr',
        value: ctr,
        benchmark: gb.ctr.critical,
        action: 'Review search terms report for irrelevant queries. Check ad copy relevance to keywords. Consider restructuring ad groups for tighter theme matching.',
      });
    } else if (ctr < gb.ctr.low) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'CTR below average',
        description: 'CTR of ' + (ctr * 100).toFixed(2) + '% is below the industry average of ' +
          (gb.ctr.expected * 100).toFixed(1) + '% for ' + benchmarks.label + '.',
        metric: 'ctr',
        value: ctr,
        benchmark: gb.ctr.low,
        action: 'Test new ad copy. Review RSA asset performance and replace low-performing headlines/descriptions.',
      });
    }
  }

  // Rule: Conversion rate below threshold (only if enough clicks for statistical relevance)
  if (current.clicks >= 50) {
    const convRate = current.conversions / current.clicks;
    if (convRate < gb.conversionRate.critical) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'Conversion rate critically low',
        description: 'Conversion rate of ' + (convRate * 100).toFixed(2) + '% is below ' +
          (gb.conversionRate.critical * 100).toFixed(1) + '%. Landing page or tracking issues likely.',
        metric: 'conversion_rate',
        value: convRate,
        benchmark: gb.conversionRate.critical,
        action: 'Check landing page load speed, mobile experience, and conversion tracking setup. Verify tracking pixels are firing correctly.',
      });
    } else if (convRate < gb.conversionRate.low) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'Conversion rate below average',
        description: 'Conversion rate of ' + (convRate * 100).toFixed(2) + '% is below the ' +
          benchmarks.label + ' average of ' + (gb.conversionRate.expected * 100).toFixed(1) + '%.',
        metric: 'conversion_rate',
        value: convRate,
        benchmark: gb.conversionRate.low,
        action: 'Review landing page relevance to ad copy. Test different CTAs. Check form length and friction points.',
      });
    }
  }

  // Rule: Cost per lead above threshold
  if (current.conversions > 0) {
    const cpl = current.spend / current.conversions;
    if (cpl > gb.cpl.critical) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'Cost per lead critically high',
        description: 'CPL of $' + cpl.toFixed(2) + ' is ' +
          (cpl / gb.cpl.expected).toFixed(1) + 'x the industry benchmark of $' +
          gb.cpl.expected.toFixed(0) + ' for ' + benchmarks.label + '.',
        metric: 'cpl',
        value: cpl,
        benchmark: gb.cpl.critical,
        action: 'Pause worst-performing campaigns/ad groups. Shift budget to campaigns with CPL under $' + gb.cpl.high.toFixed(0) + '.',
      });
    } else if (cpl > gb.cpl.high) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'Cost per lead above target',
        description: 'CPL of $' + cpl.toFixed(2) + ' exceeds the high range of $' +
          gb.cpl.high.toFixed(0) + ' for ' + benchmarks.label + '.',
        metric: 'cpl',
        value: cpl,
        benchmark: gb.cpl.high,
        action: 'Review keyword performance. Consider tightening match types or adding negatives to reduce wasted spend.',
      });
    } else if (cpl < gb.cpl.good) {
      alerts.push({
        severity: OPPORTUNITY,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: 'CPL well below average; scale opportunity',
        description: 'CPL of $' + cpl.toFixed(2) + ' is below the industry good mark of $' +
          gb.cpl.good.toFixed(0) + '. This account may benefit from increased budget.',
        metric: 'cpl',
        value: cpl,
        benchmark: gb.cpl.good,
        action: 'Check impression share loss due to budget. If >10%, increase daily budget by 15-20% and monitor for 2 weeks.',
      });
    }
  }

  // Rule: Zero conversions with meaningful spend
  if (current.conversions === 0 && current.spend > gb.cpl.expected * 1.5) {
    alerts.push({
      severity: CRITICAL,
      category: CATEGORIES.SPEND_EFFICIENCY,
      platform: 'google',
      title: 'Spending with zero conversions',
      description: 'Spent $' + current.spend.toFixed(2) + ' this week with zero tracked conversions. ' +
        'This exceeds 1.5x the expected CPL of $' + gb.cpl.expected.toFixed(0) + '.',
      metric: 'conversions',
      value: 0,
      benchmark: 1,
      action: 'First verify conversion tracking is working (check Google Tag Manager). If tracking is fine, pause and restructure. If this is a new campaign, it may need more time; check click quality and landing page.',
    });
  }

  return alerts;
}


// ─── IMPRESSION SHARE RULES ─────────────────────────────────────────────────

function impressionShareRules(params, benchmarks) {
  const alerts = [];
  const current = params.currentWeek;
  if (!current) return alerts;

  const gb = benchmarks.google;

  // Rule: Overall impression share critically low
  if (current.search_impression_share !== null && current.search_impression_share !== undefined) {
    const is = current.search_impression_share;
    if (is < gb.impressionShare.generic.critical) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.IMPRESSION_SHARE,
        platform: 'google',
        title: 'Search impression share critically low',
        description: 'Impression share of ' + (is * 100).toFixed(1) + '% is below ' +
          (gb.impressionShare.generic.critical * 100).toFixed(0) + '%. You are missing the majority of eligible searches.',
        metric: 'search_impression_share',
        value: is,
        benchmark: gb.impressionShare.generic.critical,
        action: 'Check if loss is from budget or rank. Budget loss means you need more daily budget. Rank loss means Quality Score or bids need improvement.',
      });
    }
  }

  // Rule: High budget-lost impression share
  if (current.budget_lost_is !== null && current.budget_lost_is !== undefined && current.budget_lost_is > 0.20) {
    alerts.push({
      severity: current.budget_lost_is > 0.35 ? CRITICAL : WARNING,
      category: CATEGORIES.IMPRESSION_SHARE,
      platform: 'google',
      title: 'Losing ' + (current.budget_lost_is * 100).toFixed(0) + '% impression share to budget',
      description: 'Budget is capping your visibility. You are missing ' +
        (current.budget_lost_is * 100).toFixed(0) + '% of eligible impressions because the daily budget runs out.',
      metric: 'budget_lost_is',
      value: current.budget_lost_is,
      benchmark: 0.20,
      action: current.budget_lost_is > 0.35
        ? 'Significant opportunity being left on the table. Increase daily budget by 25-30% or narrow targeting to focus budget on best-performing segments.'
        : 'Consider a 10-15% budget increase, focusing on peak hours and top-performing geo areas.',
    });
  }

  // Rule: High rank-lost impression share
  if (current.rank_lost_is !== null && current.rank_lost_is !== undefined && current.rank_lost_is > 0.25) {
    alerts.push({
      severity: current.rank_lost_is > 0.40 ? CRITICAL : WARNING,
      category: CATEGORIES.IMPRESSION_SHARE,
      platform: 'google',
      title: 'Losing ' + (current.rank_lost_is * 100).toFixed(0) + '% impression share to ad rank',
      description: 'Ad rank (Quality Score x bid) is too low, causing ' +
        (current.rank_lost_is * 100).toFixed(0) + '% of eligible impressions to be lost.',
      metric: 'rank_lost_is',
      value: current.rank_lost_is,
      benchmark: 0.25,
      action: 'Focus on Quality Score improvement first (cheaper than raising bids). Check ad relevance, expected CTR, and landing page experience ratings. Improving QS from 5 to 7 reduces CPC by ~30-40%.',
    });
  }

  return alerts;
}


// ─── TREND RULES (WEEK-OVER-WEEK) ──────────────────────────────────────────

function trendRules(params, benchmarks) {
  const alerts = [];
  const current = params.currentWeek;
  const prior = params.priorWeek;
  const history = params.weeklyHistory;

  if (!current || !prior) return alerts;

  // Rule: Spend spike (>30% WoW increase)
  if (prior.spend > 0) {
    const spendChange = (current.spend - prior.spend) / prior.spend;
    if (spendChange > 0.30) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.TREND,
        platform: 'google',
        title: 'Spend jumped ' + (spendChange * 100).toFixed(0) + '% week over week',
        description: 'Spend increased from $' + prior.spend.toFixed(2) + ' to $' + current.spend.toFixed(2) +
          '. Verify this was intentional (budget increase, new campaign) and not a runaway broad match issue.',
        metric: 'spend_wow',
        value: spendChange,
        benchmark: 0.30,
        action: 'Check change history for recent budget/bid adjustments. Review search terms for new broad match expansions eating budget.',
      });
    }
  }

  // Rule: Conversion rate declining 2+ consecutive weeks
  if (history && history.length >= 3) {
    const recentThree = history.slice(-3);
    const rates = recentThree.map(function(w) {
      return w.clicks > 0 ? w.conversions / w.clicks : 0;
    });
    if (rates[0] > rates[1] && rates[1] > rates[2] && rates[0] > 0) {
      const totalDecline = (rates[0] - rates[2]) / rates[0];
      if (totalDecline > 0.15) {
        alerts.push({
          severity: WARNING,
          category: CATEGORIES.TREND,
          platform: 'google',
          title: 'Conversion rate declining for 3 consecutive weeks',
          description: 'Conversion rate dropped from ' + (rates[0] * 100).toFixed(2) + '% to ' +
            (rates[2] * 100).toFixed(2) + '% over the last 3 weeks (' + (totalDecline * 100).toFixed(0) + '% decline).',
          metric: 'conv_rate_trend',
          value: totalDecline,
          benchmark: 0.15,
          action: 'Check for landing page changes, new competitors in auction, or search term drift. One bad week is noise; three is a signal.',
        });
      }
    }
  }

  // Rule: CPC trending up while conversions flat/down
  if (prior.clicks > 0 && current.clicks > 0) {
    const priorCPC = prior.spend / prior.clicks;
    const currentCPC = current.spend / current.clicks;
    const cpcChange = (currentCPC - priorCPC) / priorCPC;
    const convChange = prior.conversions > 0
      ? (current.conversions - prior.conversions) / prior.conversions
      : 0;

    if (cpcChange > 0.15 && convChange <= 0) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.TREND,
        platform: 'google',
        title: 'CPC rising while conversions flat or declining',
        description: 'CPC increased ' + (cpcChange * 100).toFixed(0) + '% ($' + priorCPC.toFixed(2) +
          ' to $' + currentCPC.toFixed(2) + ') while conversions ' +
          (convChange < 0 ? 'dropped ' + Math.abs(convChange * 100).toFixed(0) + '%' : 'stayed flat') + '.',
        metric: 'cpc_conv_divergence',
        value: cpcChange,
        benchmark: 0.15,
        action: 'Check auction insights for new competitors. Review Quality Scores for degradation. If auction competition is the cause, do not panic-adjust; competitors often exhaust budget within 2-4 weeks.',
      });
    }
  }

  // Rule: Impression share declining week over week
  if (current.search_impression_share !== null && prior.search_impression_share !== null &&
      current.search_impression_share !== undefined && prior.search_impression_share !== undefined) {
    const isDrop = prior.search_impression_share - current.search_impression_share;
    if (isDrop > 0.10) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.TREND,
        platform: 'google',
        title: 'Impression share dropped ' + (isDrop * 100).toFixed(0) + ' points WoW',
        description: 'Search impression share fell from ' + (prior.search_impression_share * 100).toFixed(1) +
          '% to ' + (current.search_impression_share * 100).toFixed(1) + '%. Competitive pressure may be building.',
        metric: 'is_trend',
        value: isDrop,
        benchmark: 0.10,
        action: 'Cross-reference with budget_lost_is and rank_lost_is to determine cause. Check auction insights for competitors increasing their presence.',
      });
    }
  }

  return alerts;
}


// ─── CAMPAIGN-LEVEL RULES ───────────────────────────────────────────────────

function campaignLevelRules(params, benchmarks) {
  const alerts = [];
  const campaigns = params.campaigns;
  const priorCampaigns = params.priorCampaigns;
  if (!campaigns || campaigns.length === 0) return alerts;

  const gb = benchmarks.google;

  campaigns.forEach(function(camp) {
    // Rule: Campaign spending with zero conversions
    if (camp.conversions === 0 && camp.spend > gb.cpl.expected * 2) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: camp.campaign_name + ': spending with zero conversions',
        description: 'Campaign spent $' + camp.spend.toFixed(2) + ' this week with no conversions. ' +
          'That is ' + (camp.spend / gb.cpl.expected).toFixed(1) + 'x the expected CPL for ' + benchmarks.label + '.',
        metric: 'campaign_zero_conv',
        value: camp.spend,
        benchmark: gb.cpl.expected * 2,
        campaignId: camp.campaign_id,
        campaignName: camp.campaign_name,
        action: 'If running 2+ weeks with no conversions at this spend, pause and diagnose. Check: conversion tracking, landing page, keyword relevance, ad copy.',
      });
    }

    // Rule: Campaign with high budget-lost IS (opportunity)
    if (camp.budget_lost_is !== null && camp.budget_lost_is > 0.25 &&
        camp.conversions > 0 && camp.spend > 0) {
      var campCPL = camp.spend / camp.conversions;
      if (campCPL < gb.cpl.high) {
        alerts.push({
          severity: OPPORTUNITY,
          category: CATEGORIES.BUDGET,
          platform: 'google',
          title: camp.campaign_name + ': good CPL but budget-capped',
          description: 'Campaign has a CPL of $' + campCPL.toFixed(2) + ' (below $' + gb.cpl.high.toFixed(0) +
            ' target) but is losing ' + (camp.budget_lost_is * 100).toFixed(0) + '% impression share to budget.',
          metric: 'budget_capped_good_campaign',
          value: camp.budget_lost_is,
          benchmark: 0.25,
          campaignId: camp.campaign_id,
          campaignName: camp.campaign_name,
          action: 'This campaign is performing well but starved of budget. Increase daily budget by 20% and monitor CPL for 2 weeks.',
        });
      }
    }

    // Rule: Campaign with high rank-lost IS and low Quality Score signal
    if (camp.rank_lost_is !== null && camp.rank_lost_is > 0.30 &&
        camp.budget_lost_is !== null && camp.budget_lost_is < 0.10) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.QUALITY,
        platform: 'google',
        title: camp.campaign_name + ': losing rank, not budget',
        description: 'Campaign loses ' + (camp.rank_lost_is * 100).toFixed(0) +
          '% impression share to rank but only ' + (camp.budget_lost_is * 100).toFixed(0) +
          '% to budget. Ad rank (Quality Score x bid) is the bottleneck, not spend.',
        metric: 'rank_vs_budget_loss',
        value: camp.rank_lost_is,
        benchmark: 0.30,
        campaignId: camp.campaign_id,
        campaignName: camp.campaign_name,
        action: 'Improve Quality Score: tighten ad group themes, improve ad copy relevance, optimize landing page experience. This saves more money than raising bids.',
      });
    }

    // Rule: Campaign WoW spend spike
    if (priorCampaigns) {
      var priorCamp = priorCampaigns.find(function(p) { return p.campaign_id === camp.campaign_id; });
      if (priorCamp && priorCamp.spend > 50) {
        var campSpendChange = (camp.spend - priorCamp.spend) / priorCamp.spend;
        if (campSpendChange > 0.50) {
          alerts.push({
            severity: WARNING,
            category: CATEGORIES.TREND,
            platform: 'google',
            title: camp.campaign_name + ': spend jumped ' + (campSpendChange * 100).toFixed(0) + '% WoW',
            description: 'Campaign spend went from $' + priorCamp.spend.toFixed(2) + ' to $' + camp.spend.toFixed(2) + '.',
            metric: 'campaign_spend_spike',
            value: campSpendChange,
            benchmark: 0.50,
            campaignId: camp.campaign_id,
            campaignName: camp.campaign_name,
            action: 'Verify this was intentional. Check for broad match expansion or bid strategy changes.',
          });
        }
      }
    }
  });

  return alerts;
}


// ─── CAMPAIGN MULTI-WEEK TREND RULES ───────────────────────────────────────
// Uses campaignHistory (all campaign snapshots, last ~8 weeks) to detect
// per-campaign trends that single-week comparisons miss.

function campaignTrendRules(params, benchmarks) {
  const alerts = [];
  const history = params.campaignHistory;
  if (!history || history.length === 0) return alerts;

  const gb = benchmarks.google;

  // Group snapshots by campaign_id
  var byCampaign = {};
  history.forEach(function(row) {
    if (!byCampaign[row.campaign_id]) {
      byCampaign[row.campaign_id] = { name: row.campaign_name, weeks: [] };
    }
    byCampaign[row.campaign_id].weeks.push(row);
  });

  Object.keys(byCampaign).forEach(function(campaignId) {
    var camp = byCampaign[campaignId];
    // Sort oldest to newest
    var weeks = camp.weeks.sort(function(a, b) {
      return a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0;
    });

    if (weeks.length < 3) return; // need at least 3 weeks for trend detection

    // Use last 4 weeks (or fewer if not available)
    var recent = weeks.slice(-4);

    // ── Rule: CPC rising 3+ consecutive weeks ──
    var cpcValues = recent.filter(function(w) { return w.clicks > 0; })
      .map(function(w) { return { cpc: w.spend / w.clicks, week: w.week_start }; });

    if (cpcValues.length >= 3) {
      var consecutiveRises = 0;
      for (var i = 1; i < cpcValues.length; i++) {
        if (cpcValues[i].cpc > cpcValues[i - 1].cpc * 1.05) {
          consecutiveRises++;
        } else {
          consecutiveRises = 0;
        }
      }
      if (consecutiveRises >= 2) {
        var firstCPC = cpcValues[cpcValues.length - 1 - consecutiveRises].cpc;
        var lastCPC = cpcValues[cpcValues.length - 1].cpc;
        var totalIncrease = (lastCPC - firstCPC) / firstCPC;
        if (totalIncrease > 0.15) {
          alerts.push({
            severity: WARNING,
            category: CATEGORIES.TREND,
            platform: 'google',
            title: camp.name + ': CPC rising ' + (consecutiveRises + 1) + ' straight weeks',
            description: 'CPC climbed from $' + firstCPC.toFixed(2) + ' to $' + lastCPC.toFixed(2) +
              ' (+' + (totalIncrease * 100).toFixed(0) + '%) over ' + (consecutiveRises + 1) + ' weeks. ' +
              'Auction competition may be intensifying for this campaign.',
            metric: 'campaign_cpc_trend',
            value: totalIncrease,
            benchmark: 0.15,
            campaignId: campaignId,
            campaignName: camp.name,
            action: 'Check auction insights for new competitors. Review Quality Score trends. If QS is stable, competitors are likely bidding more aggressively — may settle in 2-4 weeks.',
          });
        }
      }
    }

    // ── Rule: Conversion rate declining 3+ consecutive weeks ──
    var convRates = recent.filter(function(w) { return w.clicks >= 20; })
      .map(function(w) { return { rate: w.conversions / w.clicks, week: w.week_start }; });

    if (convRates.length >= 3) {
      var consecutiveDeclines = 0;
      for (var j = 1; j < convRates.length; j++) {
        if (convRates[j].rate < convRates[j - 1].rate * 0.92) {
          consecutiveDeclines++;
        } else {
          consecutiveDeclines = 0;
        }
      }
      if (consecutiveDeclines >= 2) {
        var firstRate = convRates[convRates.length - 1 - consecutiveDeclines].rate;
        var lastRate = convRates[convRates.length - 1].rate;
        var totalDecline = firstRate > 0 ? (firstRate - lastRate) / firstRate : 0;
        if (totalDecline > 0.15) {
          alerts.push({
            severity: WARNING,
            category: CATEGORIES.TREND,
            platform: 'google',
            title: camp.name + ': conversion rate declining ' + (consecutiveDeclines + 1) + ' straight weeks',
            description: 'Conversion rate dropped from ' + (firstRate * 100).toFixed(2) + '% to ' +
              (lastRate * 100).toFixed(2) + '% (-' + (totalDecline * 100).toFixed(0) + '%) over ' +
              (consecutiveDeclines + 1) + ' weeks.',
            metric: 'campaign_conv_rate_trend',
            value: totalDecline,
            benchmark: 0.15,
            campaignId: campaignId,
            campaignName: camp.name,
            action: 'Check landing page for changes, slow load times, or broken forms. Review search term quality for drift. One week is noise; ' + (consecutiveDeclines + 1) + ' weeks is a signal.',
          });
        }
      }
    }

    // ── Rule: Campaign consistently underperforming (spend with low/no conversions 3+ weeks) ──
    var recentWeeks = weeks.slice(-3);
    var totalSpend = recentWeeks.reduce(function(s, w) { return s + w.spend; }, 0);
    var totalConversions = recentWeeks.reduce(function(s, w) { return s + w.conversions; }, 0);
    if (recentWeeks.length >= 3 && totalSpend > gb.cpl.expected * 4 && totalConversions === 0) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'google',
        title: camp.name + ': zero conversions for 3 consecutive weeks',
        description: 'Campaign spent $' + totalSpend.toFixed(2) + ' over the last 3 weeks with zero conversions. ' +
          'That is ' + (totalSpend / gb.cpl.expected).toFixed(1) + 'x the expected CPL for ' + benchmarks.label + '.',
        metric: 'campaign_sustained_zero_conv',
        value: totalSpend,
        benchmark: gb.cpl.expected * 4,
        campaignId: campaignId,
        campaignName: camp.name,
        action: 'Three weeks of zero conversions is a strong signal. Pause this campaign, audit the keywords, ad copy, and landing page, then relaunch or reallocate budget to performing campaigns.',
      });
    }

    // ── Rule: Impression share eroding over multiple weeks ──
    var isValues = recent.filter(function(w) {
      return w.search_impression_share !== null && w.search_impression_share !== undefined;
    });
    if (isValues.length >= 3) {
      var firstIS = isValues[0].search_impression_share;
      var lastIS = isValues[isValues.length - 1].search_impression_share;
      var isDrop = firstIS - lastIS;
      // Check if it's a consistent decline (not just noise)
      var allDeclining = true;
      for (var k = 1; k < isValues.length; k++) {
        if (isValues[k].search_impression_share >= isValues[k - 1].search_impression_share) {
          allDeclining = false;
          break;
        }
      }
      if (allDeclining && isDrop > 0.10) {
        alerts.push({
          severity: WARNING,
          category: CATEGORIES.IMPRESSION_SHARE,
          platform: 'google',
          title: camp.name + ': impression share declining ' + isValues.length + ' straight weeks',
          description: 'Search impression share dropped from ' + (firstIS * 100).toFixed(1) + '% to ' +
            (lastIS * 100).toFixed(1) + '% over ' + isValues.length + ' weeks. Competitors may be gaining ground.',
          metric: 'campaign_is_trend',
          value: isDrop,
          benchmark: 0.10,
          campaignId: campaignId,
          campaignName: camp.name,
          action: 'Check budget_lost_is vs rank_lost_is for this campaign. If budget-driven, increase budget. If rank-driven, improve Quality Score or adjust bids.',
        });
      }
    }
  });

  return alerts;
}


// ─── META CREATIVE RULES ────────────────────────────────────────────────────

function metaCreativeRules(params, benchmarks) {
  const alerts = [];
  const meta = params.metaData;
  if (!meta) return alerts;

  const mb = benchmarks.meta;

  // Account-level Meta checks
  if (meta.current) {
    // Rule: Meta CPL above threshold
    if (meta.current.leads > 0 && meta.current.spend > 0) {
      var metaCPL = meta.current.spend / meta.current.leads;
      if (metaCPL > mb.cpl.critical) {
        alerts.push({
          severity: CRITICAL,
          category: CATEGORIES.SPEND_EFFICIENCY,
          platform: 'meta',
          title: 'Meta cost per lead critically high',
          description: 'Meta CPL of $' + metaCPL.toFixed(2) + ' exceeds $' + mb.cpl.critical.toFixed(0) +
            ' threshold for ' + benchmarks.label + '.',
          metric: 'meta_cpl',
          value: metaCPL,
          benchmark: mb.cpl.critical,
          action: 'Check audience targeting overlap, creative fatigue, and landing page conversion rate. Consider refreshing creatives or testing new audiences.',
        });
      } else if (metaCPL > mb.cpl.high) {
        alerts.push({
          severity: WARNING,
          category: CATEGORIES.SPEND_EFFICIENCY,
          platform: 'meta',
          title: 'Meta cost per lead above target',
          description: 'Meta CPL of $' + metaCPL.toFixed(2) + ' is above the $' + mb.cpl.high.toFixed(0) + ' range.',
          metric: 'meta_cpl',
          value: metaCPL,
          benchmark: mb.cpl.high,
          action: 'Review creative performance. If frequency is climbing, rotate creatives. If CTR is dropping, test new hooks and formats.',
        });
      }
    }

    // Rule: Meta zero leads with spend
    if (meta.current.leads === 0 && meta.current.spend > mb.cpl.expected * 1.5) {
      alerts.push({
        severity: CRITICAL,
        category: CATEGORIES.SPEND_EFFICIENCY,
        platform: 'meta',
        title: 'Meta spending with zero leads',
        description: 'Spent $' + meta.current.spend.toFixed(2) + ' on Meta this week with zero leads.',
        metric: 'meta_zero_leads',
        value: 0,
        benchmark: 1,
        action: 'Check pixel/CAPI event tracking. Verify lead form is working. Check audience size (too narrow can stall delivery).',
      });
    }
  }

  // Campaign-level Meta checks
  if (meta.campaigns && meta.campaigns.length > 0) {
    meta.campaigns.forEach(function(camp) {
      // Rule: Campaign spend with no leads
      if (camp.spend > mb.cpl.expected && camp.leads === 0) {
        alerts.push({
          severity: WARNING,
          category: CATEGORIES.SPEND_EFFICIENCY,
          platform: 'meta',
          title: 'Meta campaign "' + camp.campaign_name + '": no leads',
          description: 'Spent $' + camp.spend.toFixed(2) + ' with zero leads this week.',
          metric: 'meta_camp_zero_leads',
          value: camp.spend,
          benchmark: mb.cpl.expected,
          campaignId: camp.campaign_id,
          campaignName: camp.campaign_name,
          action: 'If this is a TOF awareness campaign, leads may not be the right metric. If it is a lead gen campaign, check ad creative and targeting.',
        });
      }
    });
  }

  // WoW Meta trend
  if (meta.current && meta.prior && meta.prior.spend > 0) {
    // Rule: Meta CPL spiked WoW
    if (meta.current.leads > 0 && meta.prior.leads > 0) {
      var currentMetaCPL = meta.current.spend / meta.current.leads;
      var priorMetaCPL = meta.prior.spend / meta.prior.leads;
      var metaCPLChange = (currentMetaCPL - priorMetaCPL) / priorMetaCPL;
      if (metaCPLChange > 0.30) {
        alerts.push({
          severity: WARNING,
          category: CATEGORIES.TREND,
          platform: 'meta',
          title: 'Meta CPL jumped ' + (metaCPLChange * 100).toFixed(0) + '% week over week',
          description: 'Meta CPL went from $' + priorMetaCPL.toFixed(2) + ' to $' + currentMetaCPL.toFixed(2) +
            '. Possible creative fatigue or audience saturation.',
          metric: 'meta_cpl_wow',
          value: metaCPLChange,
          benchmark: 0.30,
          action: 'Check frequency. If above ' + mb.frequency.warning.toFixed(1) + ', rotate creatives. If frequency is normal, check for audience overlap between ad sets.',
        });
      }
    }
  }

  return alerts;
}


// ─── BUDGET RULES ───────────────────────────────────────────────────────────

function budgetRules(params, benchmarks) {
  const alerts = [];
  const current = params.currentWeek;
  const prior = params.priorWeek;
  if (!current) return alerts;

  // Rule: Spend dropped significantly (possible budget cap hit or paused campaigns)
  if (prior && prior.spend > 100) {
    var spendDrop = (prior.spend - current.spend) / prior.spend;
    if (spendDrop > 0.40) {
      alerts.push({
        severity: WARNING,
        category: CATEGORIES.BUDGET,
        platform: 'google',
        title: 'Spend dropped ' + (spendDrop * 100).toFixed(0) + '% week over week',
        description: 'Spend fell from $' + prior.spend.toFixed(2) + ' to $' + current.spend.toFixed(2) +
          '. Check for paused campaigns, reduced budgets, or payment issues.',
        metric: 'spend_drop',
        value: spendDrop,
        benchmark: 0.40,
        action: 'Verify account is active and billing is current. Check if campaigns were intentionally paused or if a budget change was made.',
      });
    }
  }

  return alerts;
}


module.exports = { runRules, CATEGORIES };
