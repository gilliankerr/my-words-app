// Real persistence, guarded before any connection/schema write. Existing rows are never reset.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createApp } = require('../../../server/next/app');
const { openPostgresRepository } = require('./postgres-repository');
async function run() {
  const { repository, pool } = await openPostgresRepository();
  const port = Number(process.env.NEXT_TEST_PORT || 3170);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) { await pool.end(); throw new Error('Use a separate loopback port'); }
  const server = createApp({ repository, mode: 'isolated-postgres' }).listen(port, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config=tests/next/playwright.config.js', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NEXT_TEST_PORT: String(port), NEXT_TEST_EXTERNAL: '1' } });
      child.once('error', reject); child.once('exit', resolve);
    });
    process.exitCode = code === null ? 1 : code;
  } finally {
    server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
}
run().catch(() => { process.stderr.write('PostgreSQL browser harness failed; no application DB fallback.\n'); process.exitCode = 1; });
