// Each specification gets a fresh fictional server; no reset endpoints or live services.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('./memory-repository');
const { makeFixtures } = require('../fixtures');
async function run() {
  const args = process.argv.slice(2), requested = args.filter(a => /\.spec\.js$/.test(a));
  const forwarded = args.filter(a => !requested.includes(a));
  const available = fs.readdirSync(path.join(__dirname, '../frontend')).filter(f => f.endsWith('.spec.js')).sort();
  const files = requested.length ? available.filter(f => requested.some(a => path.basename(a) === f)) : available;
  if (!files.length || requested.some(a => !available.includes(path.basename(a)))) throw new Error('Use existing .spec.js filenames.');
  const port = Number(process.env.NEXT_TEST_PORT || 3170);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) throw new Error('Use a separate loopback port.');
  let failed = 0;
  for (const file of files) {
    const server = createApp({ repository: new MemoryRepository(makeFixtures().workspaces), mode: 'memory-test' });
    const listener = server.listen(port, '127.0.0.1');
    try {
      await new Promise((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config=tests/next/playwright.config.js', file, ...(forwarded.some(a => a === '--output' || a.startsWith('--output=')) ? [] : ['--output=test-results/next/browser-run/' + file]), ...forwarded], { stdio: 'inherit', env: { ...process.env, NEXT_TEST_PORT: String(port), NEXT_TEST_EXTERNAL: '1' } });
        child.once('error', reject); child.once('exit', resolve);
      });
      if (code !== 0) failed++;
    } finally { listener.closeAllConnections(); if (listener.listening) await new Promise(resolve => listener.close(resolve)); }
  }
  console.log('Specifications: ' + (files.length - failed) + ' passed, ' + failed + ' failed, ' + files.length + ' total.');
  process.exitCode = failed ? 1 : 0;
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
