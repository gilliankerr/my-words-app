// Test-only setup; never import legacy startup, dotenv or application DB credentials.
const fs = require('node:fs');
const path = require('node:path');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('./database');
const { makeFixtures } = require('../fixtures');
const { RevisionRepository } = require('../../../server/next/revision-repository');
async function openPostgresRepository(env = process.env) {
  const connectionString = validateDatabaseTarget(env);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString });
  try {
    await verifyDatabaseTarget(pool, env);
    await pool.query(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
    for (const [id, state] of Object.entries(makeFixtures().workspaces)) {
      await pool.query('INSERT INTO next_workspaces (id, state) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING', [id, JSON.stringify(state)]);
    }
    return { pool, repository: new RevisionRepository(pool) };
  } catch (error) { await pool.end(); throw error; }
}
module.exports = { openPostgresRepository };
