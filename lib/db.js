/**
 * db.js - Database connection layer for Turso (libSQL)
 *
 * Replaces the old sql.js in-memory approach with Turso cloud SQLite.
 * All queries are async. No more getDb()/saveDb() dance.
 *
 * Supports two modes:
 *   1. Turso (production): Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
 *   2. Local file (dev fallback): Set LOCAL_DB_PATH to a .db file path
 */

const { createClient } = require('@libsql/client');

let client = null;

function getClient() {
  if (client) return client;

  if (process.env.TURSO_DATABASE_URL) {
    // Production: connect to Turso
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else if (process.env.LOCAL_DB_PATH) {
    // Dev fallback: local SQLite file via libSQL
    client = createClient({
      url: `file:${process.env.LOCAL_DB_PATH}`,
    });
  } else {
    // Default: point to the old dev DB location
    const path = require('path');
    const dbPath = path.join(process.cwd(), '..', 'streben-dashboard', 'data', 'streben.db');
    client = createClient({
      url: `file:${dbPath}`,
    });
  }

  return client;
}

/**
 * Execute a SELECT query and return an array of row objects.
 * @param {string} sql - SQL query string with ? placeholders
 * @param {Array} params - Bind parameters
 * @returns {Promise<Array<Object>>} Array of row objects
 */
async function query(sql, params = []) {
  const db = getClient();
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

/**
 * Execute a SELECT query and return the first row, or null.
 * @param {string} sql - SQL query string with ? placeholders
 * @param {Array} params - Bind parameters
 * @returns {Promise<Object|null>} Single row object or null
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a non-SELECT statement (INSERT, UPDATE, DELETE).
 * @param {string} sql - SQL statement with ? placeholders
 * @param {Array} params - Bind parameters
 * @returns {Promise<Object>} Result with rowsAffected, lastInsertRowid
 */
async function run(sql, params = []) {
  const db = getClient();
  return await db.execute({ sql, args: params });
}

/**
 * Execute multiple statements in a transaction.
 * @param {Array<{sql: string, args: Array}>} statements
 * @returns {Promise<Array>} Array of results
 */
async function batch(statements) {
  const db = getClient();
  return await db.batch(statements);
}

/**
 * Get the raw libSQL client (for advanced use cases).
 */
function getRawClient() {
  return getClient();
}

module.exports = { query, queryOne, run, batch, getRawClient };
