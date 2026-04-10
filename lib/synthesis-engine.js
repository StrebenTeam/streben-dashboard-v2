/**
 * synthesis-engine.js - Layer 3: Template-Based Narrative Synthesis
 * 
 * Generates actionable narrative insights from Layers 1+2 data
 * using deterministic templates and logic. No LLM, no API key,
 * instant results. Can be upgraded to LLM later by swapping the
 * generate functions.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n, dec) { return (n || 0).toFixed(dec === undefined ? 2 : dec); }
function fmtDollars(n) { return '$' + fmt(n, 2); }
function fmtPct(n) { return fmt((n || 0) * 100, 1) + '%'; }
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

function gradeLabel(grade) {
  var labels = { A: 'strong', B: 'solid', C: 'average', D: 'underperforming', F: 'critical' };
  return labels[grade] || 'unknown';
}

// ─── Trend Narration ─────────────────────────────────────────────────────────

function narrateTrend(insight) {
  if (!insight) return '';
  var metric = (insight.metric || '').replace(/_/g, ' ');
  var dir = insight.direction || '';
  var conf = insight.confidence || 0;
  if (conf < 0.3) return '';

  var strength = conf > 0.7 ? 'clearly' : 'moderately';
  if (dir === 'falling' || dir === 'declining' || dir === 'decreasing' || dir === 'shrinking') {
    return metric + ' is ' + strength + ' trending down';
  }
  if (dir === 'growing' || dir === 'rising' || dir === 'improving') {
    return metric + ' is ' + strength + ' trending up';
  }
  return metric + ' is ' + dir;
}

function topTrends(trends, maxCount) {
  if (!trends || !trends.insights) return [];
  return trends.insights
    .filter(function(t) { return t.confidence > 0.3; })
    .sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); })
    .slice(0, maxCount || 2);
}

// ─── Account Brief Generator ─────────────────────────────────────────────────

function generateAccountBrief(account, accountAlerts) {
  var h = account.healthScore || {};
  var bd = h.breakdown || {};
  var grade = h.grade || 'N/A';
  var score = h.score || 0;
  var lw = account.latestWeek || {};
  var spend = lw.spend || 0;
  var conv = lw.conversions || 0;
  var cpl = conv > 0 ? spend / conv : 0;
  var trends = topTrends(account.trends, 2);
  var critAlerts = (accountAlerts || []).filter(function(a) { return a.severity === 'critical'; });
  var warnAlerts = (accountAlerts || []).filter(function(a) { return a.severity === 'warning'; });

  var parts = [];

  // Lead with health status
  if (grade === 'A') {
    parts.push('Performing well at ' + score + '/100');
    if (conv > 0) parts[0] += ' with ' + fmt(conv, 0) + ' conversions last week at ' + fmtDollars(cpl) + ' CPL';
  } else if (grade === 'B') {
    parts.push('Running steady at ' + score + '/100');
    if (conv > 0) parts[0] += ', ' + fmt(conv, 0) + ' conversions at ' + fmtDollars(cpl) + ' each';
  } else if (grade === 'F' || grade === 'D') {
    if (critAlerts.length > 0) {
      parts.push('Needs immediate attention (' + score + '/100): ' + critAlerts[0].title);
    } else {
      parts.push('Struggling at ' + score + '/100');
      if (conv === 0) parts[0] += ' with zero conversions last week on ' + fmtDollars(spend) + ' spend';
    }
  } else {
    parts.push('Holding at ' + score + '/100');
  }

  // Add trend context
  if (trends.length > 0) {
    var trendText = trends.map(narrateTrend).filter(Boolean).join('; ');
    if (trendText) parts.push(trendText);
  }

  // Dimension-specific callouts
  if (bd.impressionShare !== undefined && bd.impressionShare < 30) {
    parts.push('low impression share is limiting reach');
  }
  if (bd.momentum !== undefined && bd.momentum >= 80) {
    parts.push('strong recent momentum');
  }
  if (bd.momentum !== undefined && bd.momentum < 20) {
    parts.push('momentum has stalled');
  }

  return {
    name: account.accountName,
    grade: grade,
    brief: parts.join('. ') + '.'
  };
}

// ─── Wins Detector ───────────────────────────────────────────────────────────

function detectWins(accounts, alerts) {
  var wins = [];

  // Sort by health score descending
  var sorted = accounts.slice().sort(function(a, b) {
    return ((b.healthScore || {}).score || 0) - ((a.healthScore || {}).score || 0);
  });

  // Top performer
  var top = sorted[0];
  if (top && top.healthScore && top.healthScore.grade === 'A') {
    var tw = top.latestWeek || {};
    wins.push(top.accountName + ' leads the portfolio at ' + top.healthScore.score + '/100' +
      (tw.conversions > 0 ? ' with ' + fmt(tw.conversions, 0) + ' conversions last week' : ''));
  }

  // Improving trends
  accounts.forEach(function(a) {
    var trends = topTrends(a.trends, 3);
    trends.forEach(function(t) {
      if (t.confidence > 0.6) {
        if (t.metric === 'cpl' && (t.direction === 'falling' || t.direction === 'decreasing')) {
          wins.push(a.accountName + ': CPL trending down with high confidence (r2: ' + fmt(t.confidence, 2) + ')');
        }
        if (t.metric === 'conversion_rate' && (t.direction === 'improving' || t.direction === 'growing')) {
          wins.push(a.accountName + ': conversion rate improving steadily');
        }
        if (t.metric === 'impression_share' && (t.direction === 'growing')) {
          wins.push(a.accountName + ': gaining search visibility');
        }
      }
    });
  });

  // Opportunity alerts (these are positive)
  var opps = (alerts || []).filter(function(a) { return a.severity === 'opportunity'; });
  opps.slice(0, 2).forEach(function(a) {
    wins.push(a.accountName + ': ' + a.title);
  });

  return wins.slice(0, 4);
}

// ─── Concerns Detector ───────────────────────────────────────────────────────

function detectConcerns(accounts, alerts) {
  var concerns = [];

  // Critical alerts first
  var crits = (alerts || []).filter(function(a) { return a.severity === 'critical'; });
  crits.slice(0, 2).forEach(function(a) {
    concerns.push(a.accountName + ': ' + a.title);
  });

  // F-grade accounts
  accounts.forEach(function(a) {
    if (a.healthScore && a.healthScore.grade === 'F') {
      var lw = a.latestWeek || {};
      if (lw.conversions === 0 && lw.spend > 50) {
        concerns.push(a.accountName + ' spent ' + fmtDollars(lw.spend) + ' last week with zero conversions');
      }
    }
  });

  // Declining trends with high confidence
  accounts.forEach(function(a) {
    var trends = topTrends(a.trends, 3);
    trends.forEach(function(t) {
      if (t.confidence > 0.5) {
        if (t.metric === 'conversion_rate' && (t.direction === 'declining' || t.direction === 'falling')) {
          concerns.push(a.accountName + ': conversion rate declining over ' + (a.weeksOfData || 0) + ' weeks');
        }
        if (t.metric === 'impression_share' && t.direction === 'shrinking') {
          concerns.push(a.accountName + ': losing search visibility');
        }
      }
    });
  });

  // Warning alerts
  var warns = (alerts || []).filter(function(a) { return a.severity === 'warning'; });
  warns.slice(0, 2).forEach(function(a) {
    if (concerns.length < 4) concerns.push(a.accountName + ': ' + a.title);
  });

  return concerns.slice(0, 4);
}

// ─── Action Items Generator ──────────────────────────────────────────────────

function generateActions(accounts, alerts, portfolio) {
  var actions = [];

  // F-grade accounts get action items
  accounts.forEach(function(a) {
    if (!a.healthScore) return;
    var bd = a.healthScore.breakdown || {};

    if (a.healthScore.grade === 'F') {
      var lw = a.latestWeek || {};
      if (lw.conversions === 0 && lw.spend > 0) {
        actions.push('Audit ' + a.accountName + ' ad copy and landing pages; ' + fmtDollars(lw.spend) + ' spent with no conversions');
      } else if (bd.impressionShare < 20) {
        actions.push('Review bid strategy for ' + a.accountName + '; impression share is critically low at ' + fmtPct(bd.impressionShare / 100));
      } else {
        actions.push('Deep-dive ' + a.accountName + ' (grade F, ' + a.healthScore.score + '/100) to identify root cause of poor performance');
      }
    }
  });

  // Scale opportunities from portfolio
  if (portfolio && portfolio.recommendations) {
    portfolio.recommendations.forEach(function(r) {
      if (r.type === 'scale_opportunity' && actions.length < 4) {
        actions.push('Consider increasing budget for ' + (r.accountName || r.accountId) + ' (healthy account with room to grow)');
      }
    });
  }

  // Search term mining for high-spend accounts
  var highSpend = accounts.filter(function(a) {
    return a.latestWeek && a.latestWeek.spend > 500;
  }).sort(function(a, b) { return (b.latestWeek.spend || 0) - (a.latestWeek.spend || 0); });

  if (highSpend.length > 0 && actions.length < 4) {
    actions.push('Run search term reports for ' + highSpend[0].accountName + ' (' + fmtDollars(highSpend[0].latestWeek.spend) + '/wk) to find negative keyword opportunities');
  }

  return actions.slice(0, 4);
}

// ─── Headline Generator ──────────────────────────────────────────────────────

function generateHeadline(accounts, alerts, portfolio) {
  var summary = (portfolio && portfolio.summary) ? portfolio.summary : null;
  if (!summary) {
    var totalSpend = 0;
    accounts.forEach(function(a) { totalSpend += (a.latestWeek ? a.latestWeek.spend : 0); });
    var withScores = accounts.filter(function(a) { return a.healthScore && a.healthScore.score !== null; });
    var avgScore = withScores.length > 0
      ? Math.round(withScores.reduce(function(s, a) { return s + a.healthScore.score; }, 0) / withScores.length) : 0;
    summary = { total_accounts: accounts.length, total_weekly_spend: totalSpend, average_health_score: avgScore,
      accounts_above_65: accounts.filter(function(a) { return a.healthScore && a.healthScore.score >= 65; }).length,
      accounts_below_40: accounts.filter(function(a) { return a.healthScore && a.healthScore.score !== null && a.healthScore.score < 40; }).length };
  }
  var crits = (alerts || []).filter(function(a) { return a.severity === 'critical'; });
  var aGrade = accounts.filter(function(a) { return a.healthScore && a.healthScore.grade === 'A'; });
  var fGrade = accounts.filter(function(a) { return a.healthScore && a.healthScore.grade === 'F'; });

  if (crits.length >= 3) {
    return plural(crits.length, 'critical alert') + ' across the portfolio need attention';
  }
  if (fGrade.length >= 3) {
    return plural(fGrade.length, 'account') + ' in critical territory; portfolio health at ' + (summary ? summary.average_health_score : '?') + '/100';
  }
  if (aGrade.length > fGrade.length && aGrade.length >= 2) {
    return 'Portfolio trending positive with ' + plural(aGrade.length, 'A-grade account');
  }
  if (summary) {
    return 'Portfolio at ' + summary.average_health_score + '/100 across ' + plural(summary.total_accounts, 'account') + ', ' + fmtDollars(summary.total_weekly_spend) + '/wk';
  }
  return 'Weekly portfolio digest: ' + plural(accounts.length, 'account') + ' analyzed';
}

// ─── Portfolio Summary Generator ─────────────────────────────────────────────

function generatePortfolioSummary(accounts, portfolio) {
  // Build summary from accounts if not provided
  var summary;
  if (portfolio && portfolio.summary) {
    summary = portfolio.summary;
  } else {
    var totalSpend = 0;
    accounts.forEach(function(a) { totalSpend += (a.latestWeek ? a.latestWeek.spend : 0); });
    var withScores = accounts.filter(function(a) { return a.healthScore && a.healthScore.score !== null; });
    var avgScore = withScores.length > 0
      ? Math.round(withScores.reduce(function(s, a) { return s + a.healthScore.score; }, 0) / withScores.length)
      : 0;
    summary = {
      total_accounts: accounts.length,
      total_weekly_spend: totalSpend,
      average_health_score: avgScore,
      accounts_above_65: accounts.filter(function(a) { return a.healthScore && a.healthScore.score >= 65; }).length,
      accounts_below_40: accounts.filter(function(a) { return a.healthScore && a.healthScore.score !== null && a.healthScore.score < 40; }).length
    };
  }
  if (!summary) return 'No portfolio data available.';

  var parts = [];
  parts.push('Managing ' + plural(summary.total_accounts, 'active account') + ' with ' + fmtDollars(summary.total_weekly_spend) + ' in weekly spend.');
  parts.push('Average portfolio health is ' + summary.average_health_score + '/100 with ' +
    plural(summary.accounts_above_65, 'account') + ' scoring healthy (65+) and ' +
    plural(summary.accounts_below_40, 'account') + ' at risk (below 40).');

  // Spend distribution insight
  var topSpender = accounts.slice().sort(function(a, b) {
    return ((b.latestWeek || {}).spend || 0) - ((a.latestWeek || {}).spend || 0);
  })[0];
  if (topSpender && topSpender.latestWeek) {
    var pct = summary.total_weekly_spend > 0 ? (topSpender.latestWeek.spend / summary.total_weekly_spend * 100) : 0;
    if (pct > 30) {
      parts.push(topSpender.accountName + ' represents ' + fmt(pct, 0) + '% of total spend.');
    }
  }

  return parts.join(' ');
}

// ─── Main Public Functions ───────────────────────────────────────────────────

/**
 * synthesizeWeeklyDigest - Full portfolio digest (matches LLM output format)
 * Returns: { headline, portfolio_summary, wins, concerns, actions, account_briefs }
 */
function synthesizeWeeklyDigest(accounts, alerts, portfolio) {
  var alertsByAccount = {};
  (alerts || []).forEach(function(a) {
    var key = a.accountId;
    if (!alertsByAccount[key]) alertsByAccount[key] = [];
    alertsByAccount[key].push(a);
  });

  var briefs = accounts
    .filter(function(a) { return a.healthScore; })
    .sort(function(a, b) { return ((b.healthScore || {}).score || 0) - ((a.healthScore || {}).score || 0); })
    .map(function(a) {
      return generateAccountBrief(a, alertsByAccount[a.accountId] || []);
    });

  return {
    headline: generateHeadline(accounts, alerts, portfolio),
    portfolio_summary: generatePortfolioSummary(accounts, portfolio),
    wins: detectWins(accounts, alerts),
    concerns: detectConcerns(accounts, alerts),
    actions: generateActions(accounts, alerts, portfolio),
    account_briefs: briefs
  };
}

/**
 * synthesizePortfolio - Narrative text for portfolio overview
 */
function synthesizePortfolio(accounts, alerts, portfolio) {
  var digest = synthesizeWeeklyDigest(accounts, alerts, portfolio);
  var parts = [digest.portfolio_summary, ''];
  if (digest.concerns.length > 0) {
    parts.push('Accounts needing attention:');
    digest.concerns.forEach(function(c) { parts.push('  ' + c); });
  }
  return parts.join('\n');
}

/**
 * synthesizeAccount - Single account narrative
 */
function synthesizeAccount(account, alerts) {
  var brief = generateAccountBrief(account, alerts);
  return brief.brief;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  synthesizeWeeklyDigest: synthesizeWeeklyDigest,
  synthesizePortfolio: synthesizePortfolio,
  synthesizeAccount: synthesizeAccount
};
