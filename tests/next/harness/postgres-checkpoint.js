// Compare the complete fictional database envelope before/after an externally controlled engine restart.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateDatabaseTarget } = require('./database');
const M = require('../../../app-next/js/model');
async function run() {
  const connectionString = validateDatabaseTarget(process.env);
  const { Pool } = require('pg'); const pool = new Pool({ connectionString });
  try {
    const actual = (await pool.query('SELECT current_database() AS name, version() AS engine, host(inet_server_addr()) AS host, inet_server_port() AS port, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser')).rows[0];
    if (actual.name !== new URL(connectionString).pathname.slice(1) || actual.superuser) throw new Error('Unexpected disposable target or privileged test role');
    const rows = (await pool.query('SELECT id, state FROM next_workspaces ORDER BY id')).rows;
    if (!rows.length) throw new Error('No persisted fictional evidence');
    const digest = createHash('sha256').update(M.canonical(rows)).digest('hex');
    const file = path.resolve(__dirname, '../../../test-results/next/postgres-restart.json');
    if (process.argv.includes('--verify')) {
      const before = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (before.digest !== digest || before.database !== actual.name) throw new Error('Database changed across engine restart');
      before.engineRestartUnchanged = true; fs.writeFileSync(file, JSON.stringify(before, null, 2));
      process.stdout.write('PASS: complete PostgreSQL rows unchanged after engine restart.\n');
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ database: actual.name, engine: actual.engine, host: actual.host, port: actual.port, superuser: actual.superuser, rows: rows.length, digest, engineRestartUnchanged: false }, null, 2));
      process.stdout.write('Saved complete-envelope digest for engine restart comparison.\n');
    }
  } finally { await pool.end(); }
}
run().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
