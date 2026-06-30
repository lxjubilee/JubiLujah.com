'use strict';
// ============================================================================
// Migration + seed runner for environments that do NOT use docker-compose's
// auto-init (e.g. a managed Neon/Supabase/RDS DATABASE_URL).
//
//   node db/run-migrations.js           # apply pending migrations only
//   node db/run-migrations.js --seed    # apply migrations + seed/*.sql
//
// Tracks applied files in public._migrations so it is safe to re-run.
// docker-compose users do not need this — Postgres auto-loads the same files
// on first boot. This is the idempotent path for everyone else.
// ============================================================================
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEED_DIR = path.join(__dirname, 'seed');

async function applyDir(client, dir, label) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const key = `${label}/${file}`;
    const already = await client.query('SELECT 1 FROM public._migrations WHERE name = $1', [key]);
    if (already.rowCount > 0) {
      console.log(`  skip   ${key} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`  apply  ${key} ... `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO public._migrations (name) VALUES ($1)', [key]);
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      throw err;
    }
  }
}

async function main() {
  const seed = process.argv.includes('--seed');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
    process.exit(1);
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    console.log('Applying migrations...');
    await applyDir(client, MIGRATIONS_DIR, 'migrations');
    if (seed) {
      console.log('Applying seeds...');
      await applyDir(client, SEED_DIR, 'seed');
    }
    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nMigration error:', err.message);
  process.exit(1);
});
