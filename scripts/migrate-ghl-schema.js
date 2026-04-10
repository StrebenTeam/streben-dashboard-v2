/**
 * migrate-ghl-schema.js
 * Adds revenue tracking and source attribution columns to GHL tables.
 * Safe to run multiple times — uses IF NOT EXISTS / try-catch.
 *
 * Usage: node scripts/migrate-ghl-schema.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  console.log('GHL Schema Migration');
  console.log('====================');
  console.log('Target:', process.env.TURSO_DATABASE_URL);

  // Add 'meta' column to ghl_lead_snapshots (was missing — only had google_ads, paid_search)
  const leadColumns = [
    'meta_leads INTEGER DEFAULT 0',
  ];

  // Expand ghl_pipeline_snapshots with per-stage values and revenue attribution
  const pipelineColumns = [
    'new_lead_value REAL DEFAULT 0',
    'contacted_value REAL DEFAULT 0',
    'opportunity_count INTEGER DEFAULT 0',
    'opportunity_value REAL DEFAULT 0',
    'booked_value REAL DEFAULT 0',
    'no_show_value REAL DEFAULT 0',
    'closed_value REAL DEFAULT 0',
    'bad_lead_value REAL DEFAULT 0',
    // Revenue from closed deals by source
    'closed_revenue_google_ads REAL DEFAULT 0',
    'closed_revenue_meta REAL DEFAULT 0',
    'closed_revenue_paid_search REAL DEFAULT 0',
    'closed_revenue_organic REAL DEFAULT 0',
    'closed_revenue_direct REAL DEFAULT 0',
    'closed_revenue_referral REAL DEFAULT 0',
    'closed_revenue_other REAL DEFAULT 0',
    // Ad-attributed totals (across all stages)
    'ad_attributed_count INTEGER DEFAULT 0',
    'ad_attributed_value REAL DEFAULT 0',
  ];

  for (const col of leadColumns) {
    const name = col.split(' ')[0];
    try {
      await db.execute(`ALTER TABLE ghl_lead_snapshots ADD COLUMN ${col}`);
      console.log(`  + ghl_lead_snapshots.${name}`);
    } catch (e) {
      if (e.message && e.message.includes('duplicate column')) {
        console.log(`  = ghl_lead_snapshots.${name} (already exists)`);
      } else {
        console.log(`  ! ghl_lead_snapshots.${name}: ${e.message}`);
      }
    }
  }

  for (const col of pipelineColumns) {
    const name = col.split(' ')[0];
    try {
      await db.execute(`ALTER TABLE ghl_pipeline_snapshots ADD COLUMN ${col}`);
      console.log(`  + ghl_pipeline_snapshots.${name}`);
    } catch (e) {
      if (e.message && e.message.includes('duplicate column')) {
        console.log(`  = ghl_pipeline_snapshots.${name} (already exists)`);
      } else {
        console.log(`  ! ghl_pipeline_snapshots.${name}: ${e.message}`);
      }
    }
  }

  console.log('\nDone.');
  db.close();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
