const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../../../server/next/app');
const { makeFixtures } = require('../fixtures');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('./database');
async function start() {
  const fixtures = makeFixtures();
  let repository, pool;
  const memory = process.argv.includes('--memory');
  if (memory) {
    const { MemoryRepository } = require('./memory-repository'); repository = new MemoryRepository(fixtures.workspaces);
  } else {
    // Guard before constructing a Pool or writing anything. No dotenv.
    const connectionString = validateDatabaseTarget(process.env);
    const { Pool } = require('pg'); pool = new Pool({ connectionString });
    await verifyDatabaseTarget(pool);
    await pool.query(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
    // Never reset existing test records. Repeated startup retains them.
    for (const [id, state] of Object.entries(fixtures.workspaces)) await pool.query('INSERT INTO next_workspaces (id, state) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING', [id, JSON.stringify(state)]);
    const { RevisionRepository } = require('../../../server/next/revision-repository'); repository = new RevisionRepository(pool);
  }
  const port = Number(process.env.NEXT_TEST_PORT || 3162);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) throw new Error('Use a separate loopback port');
  const server = createApp({ repository, mode: memory ? 'memory-test' : 'isolated-postgres' }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`My Words fictional local demo: http://127.0.0.1:${port} (${memory ? 'memory only; server changes reset on exit' : 'disposable PostgreSQL'})\n`);
  });
  const stop = () => server.close(async () => { if (pool) await pool.end(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
start().catch(() => { process.stderr.write('Synthetic harness refused startup. Check explicit disposable configuration; no application DB fallback.\n'); process.exitCode = 1; });
