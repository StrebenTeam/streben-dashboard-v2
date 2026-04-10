/**
 * data-bridge.js - Bridges chatbot tool calls to real data
 * Queries SQLite database for cached data, and internal APIs for live data.
 * This replaces the placeholder mcpProxy with actual data access.
 */

const { query, queryOne, run, batch } = require('./db');

// Ensure search_terms table exists
async function ensureSearchTermsTable() {
  await run(`CREATE TABLE IF NOT EXISTS search_terms_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    search_term TEXT NOT NULL,
    status TEXT,
    campaign_name TEXT,
    ad_group_name TEXT,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr REAL DEFAULT 0,
    cost REAL DEFAULT 0,
    conversions REAL DEFAULT 0,
    cached_at TEXT DEFAULT (datetime('now'))
  )`);
}

// Store search terms for an account
async function cacheSearchTerms(accountId, terms) {
  await run('DELETE FROM search_terms_cache WHERE account_id = ?', [accountId]);

  const statements = terms.map(function(t) {
    return {
      sql: 'INSERT INTO search_terms_cache (account_id, search_term, status, campaign_name, ad_group_name, impressions, clicks, ctr, cost, conversions) VALUES (?,?,?,?,?,?,?,?,?,?)',
      args: [
        accountId,
        t['search_term_view.search_term'] || t.search_term,
        t['search_term_view.status'] || t.status || 'NONE',
        t['campaign.name'] || t.campaign_name || '',
        t['ad_group.name'] || t.ad_group_name || '',
        t['metrics.impressions'] || t.impressions || 0,
        t['metrics.clicks'] || t.clicks || 0,
        t['metrics.ctr'] || t.ctr || 0,
        t['metrics.cost'] || t.cost || 0,
        t['metrics.conversions'] || t.conversions || 0
      ]
    };
  });

  if (statements.length > 0) {
    await batch(statements);
  }
}

// Get cached search terms for an account
async function getSearchTerms(accountId, minClicks) {
  minClicks = minClicks || 1;
  return await query(
    'SELECT * FROM search_terms_cache WHERE account_id = ? AND clicks >= ? ORDER BY cost DESC',
    [accountId, minClicks]
  );
}

// Get keyword performance from weekly_snapshots
async function getKeywordPerformance(accountId) {
  return await query(
    'SELECT * FROM weekly_snapshots WHERE google_ads_account_id = ? ORDER BY week_start DESC',
    [accountId]
  );
}

// Execute a raw query against the database (for query_google_ads tool)
async function executeQuery(accountId, queryStr) {
  // We can only run queries against our local cache, not live GAQL
  // Return a helpful message
  return {
    note: 'Live GAQL queries are not available in local mode. Data shown is from the most recent cache.',
    cached_data: true,
    account_id: accountId
  };
}

// Get account summary data
async function getAccountSummary(accountId) {
  return await query(
    'SELECT * FROM weekly_snapshots WHERE google_ads_account_id = ? ORDER BY week_start DESC LIMIT 4',
    [accountId]
  );
}

module.exports = {
  ensureSearchTermsTable,
  cacheSearchTerms,
  getSearchTerms,
  getKeywordPerformance,
  executeQuery,
  getAccountSummary
};
