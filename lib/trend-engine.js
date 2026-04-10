/**
 * trend-engine.js
 * Layer 2 intelligence: multi-week trend detection and account health scoring.
 *
 * Analyzes 8-13 weeks of stored data to detect patterns that single-week
 * comparisons miss: sustained declines, plateaus, momentum shifts, and
 * portfolio-level allocation opportunities.
 *
 * No LLM calls. Zero marginal cost per run.
 */

const { getBenchmarks } = require('./benchmarks');

// ─── UTILITY FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Simple linear regression on an array of numbers.
 * Returns { slope, intercept, r2 } where slope is the per-week change
 * and r2 indicates fit quality (>0.6 = meaningful trend).
 */
function linearRegression(values) {
  var n = values.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0 };

  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }

  var denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  var slope = (n * sumXY - sumX * sumY) / denom;
  var intercept = (sumY - slope * sumX) / n;

  // R-squared
  var meanY = sumY / n;
  var ssTotal = 0, ssResidual = 0;
  for (var j = 0; j < n; j++) {
    ssTotal += (values[j] - meanY) * (values[j] - meanY);
    var predicted = intercept + slope * j;
    ssResidual += (values[j] - predicted) * (values[j] - predicted);
  }
  var r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope: slope, intercept: intercept, r2: r2 };
}

/**
 * 4-week simple moving average. Returns array of averages.
 */
function movingAverage(values, window) {
  window = window || 4;
  var result = [];
  for (var i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      var sum = 0;
      for (var j = i - window + 1; j <= i; j++) sum += values[j];
      result.push(sum / window);
    }
  }
  return result;
}

/**
 * Coefficient of variation (std dev / mean). Low = stable, high = volatile.
 */
function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  var mean = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
  if (mean === 0) return 0;
  var variance = values.reduce(function(a, b) { return a + (b - mean) * (b - mean); }, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Detect plateau: metric has been within +/- threshold% of its mean for N+ weeks.
 */
function detectPlateau(values, thresholdPct, minWeeks) {
  thresholdPct = thresholdPct || 0.10;
  minWeeks = minWeeks || 4;
  if (values.length < minWeeks) return false;

  var recent = values.slice(-minWeeks);
  var mean = recent.reduce(function(a, b) { return a + b; }, 0) / recent.length;
  if (mean === 0) return false;

  return recent.every(function(v) {
    return Math.abs(v - mean) / Math.abs(mean) < thresholdPct;
  });
}


// ─── ACCOUNT HEALTH SCORE ───────────────────────────────────────────────────

/**
 * Compute a 0-100 health score for a Google Ads account based on multiple
 * weighted dimensions. Higher = better.
 *
 * Dimensions (weights):
 *   - CPL efficiency vs benchmark (25%)
 *   - Conversion rate vs benchmark (20%)
 *   - Impression share utilization (15%)
 *   - CTR vs benchmark (10%)
 *   - CPC vs benchmark (10%)
 *   - Trend momentum (is it improving?) (20%)
 */
function computeHealthScore(weeklyHistory, benchmarks, vertical) {
  if (!weeklyHistory || weeklyHistory.length < 2) return null;

  var gb = benchmarks.google;
  var latest = weeklyHistory[weeklyHistory.length - 1];
  var scores = {};

  // CPL score (25%) - lower is better
  if (latest.conversions > 0 && latest.spend > 0) {
    var cpl = latest.spend / latest.conversions;
    if (cpl <= gb.cpl.good) scores.cpl = 100;
    else if (cpl <= gb.cpl.expected) scores.cpl = 75;
    else if (cpl <= gb.cpl.high) scores.cpl = 50;
    else if (cpl <= gb.cpl.critical) scores.cpl = 25;
    else scores.cpl = 10;
  } else if (latest.spend > 0) {
    scores.cpl = 0; // spending with no conversions
  } else {
    scores.cpl = null;
  }

  // Conversion rate score (20%)
  if (latest.clicks >= 20) {
    var convRate = latest.conversions / latest.clicks;
    if (convRate >= gb.conversionRate.expected) scores.convRate = 100;
    else if (convRate >= gb.conversionRate.low) scores.convRate = 60;
    else if (convRate >= gb.conversionRate.critical) scores.convRate = 30;
    else scores.convRate = 10;
  } else {
    scores.convRate = null;
  }

  // Impression share score (15%)
  if (latest.search_impression_share !== null && latest.search_impression_share !== undefined) {
    var is = latest.search_impression_share;
    if (is >= 0.60) scores.impressionShare = 100;
    else if (is >= 0.40) scores.impressionShare = 70;
    else if (is >= 0.25) scores.impressionShare = 40;
    else scores.impressionShare = 15;
  } else {
    scores.impressionShare = null;
  }

  // CTR score (10%)
  if (latest.impressions > 100) {
    var ctr = latest.clicks / latest.impressions;
    if (ctr >= gb.ctr.expected) scores.ctr = 100;
    else if (ctr >= gb.ctr.low) scores.ctr = 60;
    else if (ctr >= gb.ctr.critical) scores.ctr = 20;
    else scores.ctr = 5;
  } else {
    scores.ctr = null;
  }

  // CPC score (10%) - lower is better
  if (latest.clicks > 0) {
    var cpc = latest.spend / latest.clicks;
    if (cpc <= gb.cpc.expected) scores.cpc = 100;
    else if (cpc <= gb.cpc.high) scores.cpc = 60;
    else if (cpc <= gb.cpc.ceiling) scores.cpc = 30;
    else scores.cpc = 10;
  } else {
    scores.cpc = null;
  }

  // Momentum score (20%) - based on 4-week CPL and conversion trends
  var convRates = weeklyHistory.map(function(w) {
    return w.clicks > 0 ? w.conversions / w.clicks : 0;
  });
  var cpls = weeklyHistory.map(function(w) {
    return w.conversions > 0 ? w.spend / w.conversions : null;
  }).filter(function(v) { return v !== null; });

  if (convRates.length >= 4) {
    var convTrend = linearRegression(convRates);
    var cplTrend = cpls.length >= 4 ? linearRegression(cpls) : { slope: 0, r2: 0 };

    // Positive momentum = improving conversion rate AND/OR declining CPL
    var momentumScore = 50; // neutral baseline
    if (convTrend.r2 > 0.3) {
      momentumScore += convTrend.slope > 0 ? 25 : -25;
    }
    if (cplTrend.r2 > 0.3 && cpls.length >= 4) {
      momentumScore += cplTrend.slope < 0 ? 25 : -25;
    }
    scores.momentum = Math.max(0, Math.min(100, momentumScore));
  } else {
    scores.momentum = 50; // neutral if not enough data
  }

  // Weighted composite
  var weights = { cpl: 0.25, convRate: 0.20, impressionShare: 0.15, ctr: 0.10, cpc: 0.10, momentum: 0.20 };
  var totalWeight = 0;
  var weightedSum = 0;
  var breakdown = {};

  Object.keys(weights).forEach(function(key) {
    if (scores[key] !== null && scores[key] !== undefined) {
      weightedSum += scores[key] * weights[key];
      totalWeight += weights[key];
      breakdown[key] = scores[key];
    }
  });

  var composite = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

  return {
    score: composite,
    breakdown: breakdown,
    grade: composite >= 80 ? 'A' : composite >= 65 ? 'B' : composite >= 50 ? 'C' : composite >= 35 ? 'D' : 'F'
  };
}


// ─── TREND ANALYSIS ─────────────────────────────────────────────────────────

/**
 * Analyze multi-week trends for a single account.
 * Returns an object with trend insights and signals.
 */
function analyzeTrends(weeklyHistory, campaignHistory, benchmarks, vertical) {
  var insights = [];
  if (!weeklyHistory || weeklyHistory.length < 4) return { insights: insights, metrics: {} };

  var gb = benchmarks.google;

  // Extract metric arrays (chronological order)
  var spends = weeklyHistory.map(function(w) { return w.spend; });
  var clicks = weeklyHistory.map(function(w) { return w.clicks; });
  var convs = weeklyHistory.map(function(w) { return w.conversions; });
  var convRates = weeklyHistory.map(function(w) {
    return w.clicks > 0 ? w.conversions / w.clicks : 0;
  });
  var cpcs = weeklyHistory.map(function(w) {
    return w.clicks > 0 ? w.spend / w.clicks : 0;
  });
  var cpls = weeklyHistory.map(function(w) {
    return w.conversions > 0 ? w.spend / w.conversions : null;
  });
  var cplsClean = cpls.filter(function(v) { return v !== null; });
  var impressionShares = weeklyHistory.map(function(w) {
    return w.search_impression_share;
  }).filter(function(v) { return v !== null && v !== undefined; });

  // ── Spend trend ──
  var spendTrend = linearRegression(spends);
  var spendMA = movingAverage(spends);
  var latestSpend = spends[spends.length - 1];
  var latestMA = spendMA[spendMA.length - 1];

  if (spendTrend.r2 > 0.5 && Math.abs(spendTrend.slope) > latestSpend * 0.03) {
    var spendDir = spendTrend.slope > 0 ? 'increasing' : 'decreasing';
    var weeklyChange = Math.abs(spendTrend.slope);
    insights.push({
      type: 'trend',
      metric: 'spend',
      direction: spendDir,
      confidence: spendTrend.r2,
      title: 'Spend ' + spendDir + ' steadily',
      description: 'Spend has been ' + spendDir + ' by ~$' + weeklyChange.toFixed(0) +
        '/week over the last ' + spends.length + ' weeks (R\u00B2=' + spendTrend.r2.toFixed(2) + ').',
      action: spendDir === 'increasing'
        ? 'Verify this is intentional. If CPL is also rising, this could be a scaling issue.'
        : 'If intentional, ensure budget isn\'t limiting top campaigns. If not, check for paused campaigns or billing issues.'
    });
  }

  // ── Conversion rate trend ──
  var convTrend = linearRegression(convRates);
  if (convTrend.r2 > 0.4 && convRates.length >= 6) {
    var convDir = convTrend.slope > 0 ? 'improving' : 'declining';
    var totalShift = (convRates[convRates.length - 1] - convRates[0]) * 100;
    insights.push({
      type: 'trend',
      metric: 'conversion_rate',
      direction: convDir,
      confidence: convTrend.r2,
      title: 'Conversion rate ' + convDir + ' over ' + convRates.length + ' weeks',
      description: 'Conversion rate moved from ' + (convRates[0] * 100).toFixed(1) + '% to ' +
        (convRates[convRates.length - 1] * 100).toFixed(1) + '% (' +
        (totalShift > 0 ? '+' : '') + totalShift.toFixed(1) + ' points).',
      action: convDir === 'improving'
        ? 'Positive trend. Consider scaling budget to capture more volume at this improved rate.'
        : 'Investigate: landing page changes, new competitors, or search term drift. Review the last 4 weeks of search terms for quality degradation.'
    });
  }

  // ── CPC trend ──
  var cpcTrend = linearRegression(cpcs);
  if (cpcTrend.r2 > 0.4 && cpcs.length >= 6) {
    var cpcDir = cpcTrend.slope > 0 ? 'rising' : 'falling';
    insights.push({
      type: 'trend',
      metric: 'cpc',
      direction: cpcDir,
      confidence: cpcTrend.r2,
      title: 'CPC ' + cpcDir + ' consistently',
      description: 'CPC moved from $' + cpcs[0].toFixed(2) + ' to $' +
        cpcs[cpcs.length - 1].toFixed(2) + ' over ' + cpcs.length + ' weeks.',
      action: cpcDir === 'rising'
        ? 'Check auction insights for new competitors. Review Quality Scores; a QS drop from 7 to 5 increases CPC ~50%. If competition-driven, consider shifting to longer-tail keywords.'
        : 'Positive. Quality Score improvements or reduced competition. Monitor to sustain.'
    });
  }

  // ── CPL trajectory ──
  if (cplsClean.length >= 5) {
    var cplTrend = linearRegression(cplsClean);
    if (cplTrend.r2 > 0.35) {
      var cplDir = cplTrend.slope > 0 ? 'rising' : 'falling';
      insights.push({
        type: 'trend',
        metric: 'cpl',
        direction: cplDir,
        confidence: cplTrend.r2,
        title: 'Cost per lead ' + cplDir + ' over time',
        description: 'CPL moved from $' + cplsClean[0].toFixed(2) + ' to $' +
          cplsClean[cplsClean.length - 1].toFixed(2) + ' across ' + cplsClean.length + ' data points.',
        action: cplDir === 'rising'
          ? 'Escalating lead costs require intervention. Check: (1) conversion rate changes, (2) CPC changes, (3) impression share. The root cause determines the fix.'
          : 'Excellent trajectory. This account is becoming more efficient. Consider testing budget increases.'
      });
    }
  }

  // ── Impression share trend ──
  if (impressionShares.length >= 5) {
    var isTrend = linearRegression(impressionShares);
    if (isTrend.r2 > 0.35) {
      var isDir = isTrend.slope > 0 ? 'growing' : 'shrinking';
      insights.push({
        type: 'trend',
        metric: 'impression_share',
        direction: isDir,
        confidence: isTrend.r2,
        title: 'Search visibility ' + isDir,
        description: 'Impression share moved from ' + (impressionShares[0] * 100).toFixed(1) +
          '% to ' + (impressionShares[impressionShares.length - 1] * 100).toFixed(1) + '% over ' +
          impressionShares.length + ' weeks.',
        action: isDir === 'growing'
          ? 'Visibility improving. If driven by better Quality Score, this is the best kind of growth.'
          : 'Losing visibility. Cross-reference with budget and rank loss to determine if this is a budget issue or a competitive/quality issue.'
      });
    }
  }

  // ── Plateau detection ──
  if (convRates.length >= 5 && detectPlateau(convRates, 0.15, 5)) {
    insights.push({
      type: 'plateau',
      metric: 'conversion_rate',
      title: 'Conversion rate has plateaued',
      description: 'Conversion rate has been stable within 15% of its mean for the last 5+ weeks at ~' +
        (convRates[convRates.length - 1] * 100).toFixed(1) + '%.',
      action: 'Stable performance, but potential ceiling reached. To break through: test new landing pages, try different CTAs, or expand keyword targeting to find higher-intent searches.'
    });
  }

  if (cplsClean.length >= 5 && detectPlateau(cplsClean, 0.12, 5)) {
    insights.push({
      type: 'plateau',
      metric: 'cpl',
      title: 'Cost per lead has plateaued',
      description: 'CPL has been stable around $' + cplsClean[cplsClean.length - 1].toFixed(2) + ' for the last 5+ weeks.',
      action: 'The account has found its natural equilibrium at current settings. Major improvement requires structural changes: new campaign types, audience expansion, or bidding strategy shifts.'
    });
  }

  // ── Volatility detection ──
  var spendCV = coefficientOfVariation(spends);
  if (spendCV > 0.35) {
    insights.push({
      type: 'volatility',
      metric: 'spend',
      title: 'High spend volatility',
      description: 'Weekly spend varies by ' + (spendCV * 100).toFixed(0) + '% around its average. This inconsistency makes trend detection unreliable and can hurt algorithm learning.',
      action: 'Investigate why spend fluctuates so much. Common causes: manual budget changes, shared budgets with other campaigns, or bid strategy overcorrections. Stable budgets help Google\'s algorithm optimize better.'
    });
  }

  var convCV = coefficientOfVariation(convs);
  if (convCV > 0.45 && convs.length >= 6) {
    insights.push({
      type: 'volatility',
      metric: 'conversions',
      title: 'Conversion volume highly volatile',
      description: 'Weekly conversions vary by ' + (convCV * 100).toFixed(0) + '% around the average of ' +
        (convs.reduce(function(a, b) { return a + b; }, 0) / convs.length).toFixed(1) + '/week.',
      action: 'High variance in conversions may indicate low volume (statistical noise) or inconsistent tracking. For accounts with <30 conversions/month, consider optimizing for micro-conversions (clicks to call, form starts) to give the algorithm more signal.'
    });
  }

  // Build metric summaries
  var metrics = {
    spend: {
      current: latestSpend,
      ma4: latestMA,
      trend: spendTrend.slope > 0 ? 'up' : 'down',
      trendStrength: spendTrend.r2,
      volatility: spendCV
    },
    conversionRate: {
      current: convRates[convRates.length - 1],
      trend: convTrend.slope > 0 ? 'up' : 'down',
      trendStrength: convTrend.r2,
      plateau: convRates.length >= 5 && detectPlateau(convRates, 0.15, 5)
    }
  };

  if (cplsClean.length > 0) {
    metrics.cpl = {
      current: cplsClean[cplsClean.length - 1],
      trend: cplsClean.length >= 4 ? (linearRegression(cplsClean).slope > 0 ? 'up' : 'down') : 'insufficient_data',
      trendStrength: cplsClean.length >= 4 ? linearRegression(cplsClean).r2 : 0,
      plateau: cplsClean.length >= 5 && detectPlateau(cplsClean, 0.12, 5)
    };
  }

  return { insights: insights, metrics: metrics };
}


// ─── META TREND ANALYSIS ────────────────────────────────────────────────────

function analyzeMetaTrends(metaHistory, benchmarks) {
  var insights = [];
  if (!metaHistory || metaHistory.length < 4) return { insights: insights, metrics: {} };

  var mb = benchmarks.meta;

  var spends = metaHistory.map(function(w) { return w.spend; });
  var leads = metaHistory.map(function(w) { return w.leads || 0; });
  var cpls = metaHistory.map(function(w) {
    return w.leads > 0 ? w.spend / w.leads : null;
  }).filter(function(v) { return v !== null; });
  var ctrs = metaHistory.map(function(w) {
    return w.impressions > 0 ? w.clicks / w.impressions : 0;
  });

  // Lead volume trend
  var leadTrend = linearRegression(leads);
  if (leadTrend.r2 > 0.35 && leads.length >= 5) {
    var leadDir = leadTrend.slope > 0 ? 'increasing' : 'decreasing';
    insights.push({
      type: 'trend',
      metric: 'meta_leads',
      direction: leadDir,
      confidence: leadTrend.r2,
      platform: 'meta',
      title: 'Meta lead volume ' + leadDir,
      description: 'Weekly leads moved from ' + leads[0] + ' to ' + leads[leads.length - 1] +
        ' over ' + leads.length + ' weeks.',
      action: leadDir === 'decreasing'
        ? 'Check audience saturation (frequency), creative fatigue, and whether Meta expanded to lower-quality placements. Refresh creatives if frequency >2.5.'
        : 'Volume growing. Monitor CPL to ensure quality is maintained at higher volume.'
    });
  }

  // CPL trend
  if (cpls.length >= 4) {
    var cplTrend = linearRegression(cpls);
    if (cplTrend.r2 > 0.3) {
      var cplDir = cplTrend.slope > 0 ? 'rising' : 'falling';
      insights.push({
        type: 'trend',
        metric: 'meta_cpl',
        direction: cplDir,
        confidence: cplTrend.r2,
        platform: 'meta',
        title: 'Meta CPL ' + cplDir + ' over time',
        description: 'Meta CPL moved from $' + cpls[0].toFixed(2) + ' to $' +
          cpls[cpls.length - 1].toFixed(2) + '.',
        action: cplDir === 'rising'
          ? 'Creative fatigue is the #1 cause of rising Meta CPL. Test new hooks in the first 3 seconds of video, or try static images if using video (and vice versa). Also check lookalike audience decay.'
          : 'Meta efficiency improving. If recent creative tests are driving this, document what works for future reference.'
      });
    }
  }

  // CTR trend (creative fatigue signal)
  var ctrTrend = linearRegression(ctrs);
  if (ctrTrend.r2 > 0.35 && ctrTrend.slope < 0 && ctrs.length >= 5) {
    insights.push({
      type: 'trend',
      metric: 'meta_ctr',
      direction: 'declining',
      confidence: ctrTrend.r2,
      platform: 'meta',
      title: 'Meta CTR declining (creative fatigue signal)',
      description: 'CTR dropped from ' + (ctrs[0] * 100).toFixed(2) + '% to ' +
        (ctrs[ctrs.length - 1] * 100).toFixed(2) + '% over ' + ctrs.length + ' weeks.',
      action: 'Declining CTR is the strongest signal of creative fatigue. Rotate in 2-3 new creatives. Test different formats: if running static, try video; if running video, try carousel or UGC-style content.'
    });
  }

  var metrics = {
    spend: { current: spends[spends.length - 1], volatility: coefficientOfVariation(spends) },
    leads: { current: leads[leads.length - 1], trend: leadTrend.slope > 0 ? 'up' : 'down' }
  };
  if (cpls.length > 0) {
    metrics.cpl = { current: cpls[cpls.length - 1] };
  }

  return { insights: insights, metrics: metrics };
}


// ─── PORTFOLIO ANALYSIS ─────────────────────────────────────────────────────

/**
 * Cross-account portfolio analysis. Identifies where budget should shift
 * based on relative efficiency across accounts.
 */
function portfolioAnalysis(accountResults) {
  var insights = [];

  // Filter to accounts with enough data for meaningful comparison
  var viable = accountResults.filter(function(a) {
    return a.healthScore && a.healthScore.score !== null && a.latestWeek && a.latestWeek.spend > 0;
  });

  if (viable.length < 2) return insights;

  // Sort by health score
  viable.sort(function(a, b) { return (b.healthScore.score || 0) - (a.healthScore.score || 0); });

  // Top performer with budget constraints
  var topPerformers = viable.filter(function(a) {
    return a.healthScore.score >= 65 && a.latestWeek.budget_lost_is > 0.15;
  });

  topPerformers.forEach(function(a) {
    insights.push({
      type: 'portfolio',
      subtype: 'scale_opportunity',
      accountId: a.accountId,
      accountName: a.accountName,
      title: a.accountName + ' is a top performer being starved of budget',
      description: 'Health score of ' + a.healthScore.score + '/100 (grade ' + a.healthScore.grade +
        ') but losing ' + (a.latestWeek.budget_lost_is * 100).toFixed(0) +
        '% impression share to budget. This is your highest-ROI scaling opportunity.',
      action: 'Increase daily budget by 20-25%. This account has proven it can convert efficiently and has room to capture more market share.',
      priority: 1
    });
  });

  // Underperformers consuming significant budget
  var underperformers = viable.filter(function(a) {
    return a.healthScore.score < 40 && a.latestWeek.spend > 200;
  });

  underperformers.forEach(function(a) {
    insights.push({
      type: 'portfolio',
      subtype: 'efficiency_concern',
      accountId: a.accountId,
      accountName: a.accountName,
      title: a.accountName + ' is underperforming with significant spend',
      description: 'Health score of ' + a.healthScore.score + '/100 (grade ' + a.healthScore.grade +
        ') while spending $' + a.latestWeek.spend.toFixed(0) + '/week. This account needs optimization to improve ROI.',
      action: 'Review this account for structural issues: check search terms for wasted spend, audit landing pages, review Quality Scores, and verify conversion tracking. Each client account has its own budget, so focus on improving efficiency within this account.',
      priority: 2
    });
  });

  // Biggest momentum shifts
  var improving = viable.filter(function(a) {
    return a.healthScore.breakdown && a.healthScore.breakdown.momentum >= 75;
  });

  improving.forEach(function(a) {
    insights.push({
      type: 'portfolio',
      subtype: 'positive_momentum',
      accountId: a.accountId,
      accountName: a.accountName,
      title: a.accountName + ' is trending in the right direction',
      description: 'Momentum score of ' + a.healthScore.breakdown.momentum +
        '/100 indicates sustained improvement in conversion efficiency.',
      action: 'Keep current optimizations in place. Do not make major changes to an account that is improving on its own. Let it ride for another 2-3 weeks before scaling.',
      priority: 3
    });
  });

  var declining = viable.filter(function(a) {
    return a.healthScore.breakdown && a.healthScore.breakdown.momentum <= 25;
  });

  declining.forEach(function(a) {
    insights.push({
      type: 'portfolio',
      subtype: 'negative_momentum',
      accountId: a.accountId,
      accountName: a.accountName,
      title: a.accountName + ' is trending downward',
      description: 'Momentum score of ' + a.healthScore.breakdown.momentum +
        '/100 indicates sustained decline in efficiency.',
      action: 'This account needs attention. Start with: (1) search term review for query drift, (2) auction insights for competitive changes, (3) landing page performance check.',
      priority: 2
    });
  });

  // Sort by priority
  insights.sort(function(a, b) { return (a.priority || 3) - (b.priority || 3); });

  return insights;
}


module.exports = {
  linearRegression: linearRegression,
  movingAverage: movingAverage,
  coefficientOfVariation: coefficientOfVariation,
  detectPlateau: detectPlateau,
  computeHealthScore: computeHealthScore,
  analyzeTrends: analyzeTrends,
  analyzeMetaTrends: analyzeMetaTrends,
  portfolioAnalysis: portfolioAnalysis
};