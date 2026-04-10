const initSqlJs = require("sql.js");
const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

// Load .env.local from project root
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const LOCAL_DB_PATH = path.resolve(__dirname, "../../streben-dashboard/data/streben.db");
const BATCH_SIZE = 100;

// Tables to skip during migration
const SKIP_TABLES = new Set(["sqlite_sequence"]);

async function main() {
  console.log("=== Turso Migration Script ===\n");

  // --- Validate environment ---
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
  if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
    console.error("ERROR: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env.local");
    process.exit(1);
  }

  // --- Open local SQLite database ---
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`ERROR: Local database not found at ${LOCAL_DB_PATH}`);
    process.exit(1);
  }

  console.log(`Reading local database: ${LOCAL_DB_PATH}`);
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(LOCAL_DB_PATH);
  const localDb = new SQL.Database(fileBuffer);

  // --- Connect to Turso ---
  console.log(`Connecting to Turso: ${TURSO_DATABASE_URL}\n`);
  const turso = createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN,
  });

  try {
    // --- Extract schemas ---
    const schemaRows = localDb.exec(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name"
    );

    if (!schemaRows.length || !schemaRows[0].values.length) {
      console.error("ERROR: No tables found in local database.");
      process.exit(1);
    }

    const tables = schemaRows[0].values.filter(([name]) => !SKIP_TABLES.has(name));
    console.log(`Found ${tables.length} tables to migrate.\n`);

    // --- Create tables in Turso ---
    console.log("--- Creating tables ---");
    for (const [name, sql] of tables) {
      console.log(`  Creating: ${name}`);
      await turso.execute(sql);
    }
    console.log("All tables created.\n");

    // --- Migrate data ---
    console.log("--- Migrating data ---");
    let totalRows = 0;

    for (const [tableName] of tables) {
      const result = localDb.exec(`SELECT * FROM "${tableName}"`);

      if (!result.length || !result[0].values.length) {
        console.log(`  ${tableName}: 0 rows (empty)`);
        continue;
      }

      const columns = result[0].columns;
      const rows = result[0].values;
      const rowCount = rows.length;

      // Build parameterized insert statement
      const placeholders = columns.map(() => "?").join(", ");
      const columnList = columns.map((c) => `"${c}"`).join(", ");
      const insertSql = `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`;

      // Insert in batches
      const batchCount = Math.ceil(rowCount / BATCH_SIZE);

      for (let i = 0; i < rowCount; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const statements = chunk.map((row) => ({
          sql: insertSql,
          args: row.map((v) => (v === null ? null : v)),
        }));

        await turso.batch(statements);

        const end = Math.min(i + BATCH_SIZE, rowCount);
        if (batchCount > 1) {
          process.stdout.write(`  ${tableName}: ${end}/${rowCount} rows\r`);
        }
      }

      console.log(`  ${tableName}: ${rowCount} rows migrated`);
      totalRows += rowCount;
    }

    console.log(`\n=== Migration complete: ${totalRows} total rows across ${tables.length} tables ===`);
  } catch (err) {
    console.error("\nMigration failed:", err.message || err);
    process.exit(1);
  } finally {
    localDb.close();
    turso.close();
  }
}

main();
