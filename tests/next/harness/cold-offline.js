const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('./memory-repository');
const { makeFixtures } = require('../fixtures');
const M = require('../../../app-next/js/model');
async function run() {
  const root = path.resolve(__dirname, '../../..');
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, 'tmp/next-cold-'));
  const origin = 'http://127.0.0.1:3171';
  const database = process.argv.includes('--database');
  let persistence = database ? await require('./postgres-repository').openPostgresRepository() : null;
  let server = createApp({ repository: persistence?.repository || new MemoryRepository(makeFixtures().workspaces), mode: database ? 'isolated-postgres' : 'memory-test' }).listen(3171, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile);
    let page = await context.newPage(); await page.goto(origin);
    await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password').fill('reader-fictional-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('button', { name: 'Personal information', exact: true })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The first download precedes its own receipt. Read that acknowledged snapshot before comparison.
    if (database) await page.evaluate(() => window.NextTrial.checkUpdates());
    const saved = JSON.parse(await page.evaluate(() => window.NextTrial.exportText()));
    await context.close(); context = null;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (database) {
      const before = M.canonical((await persistence.pool.query('SELECT id, state FROM next_workspaces ORDER BY id')).rows);
      await persistence.pool.end(); persistence = null;
      persistence = await require('./postgres-repository').openPostgresRepository();
      expect(M.canonical((await persistence.pool.query('SELECT id, state FROM next_workspaces ORDER BY id')).rows)).toBe(before);
      server = createApp({ repository: persistence.repository, mode: 'isolated-postgres' }).listen(3171, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      // App/session secret/pool/browser all restart. Explicit reauthentication is expected.
      context = await chromium.launchPersistentContext(profile); page = await context.newPage(); await page.goto(origin);
      await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password').fill('reader-fictional-only');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Personal information', exact: true })).toBeVisible();
      expect(JSON.parse(await page.evaluate(() => window.NextTrial.exportText()))).toEqual(saved);
      await context.close(); context = null;
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      await persistence.pool.end(); persistence = null;
    }
    // Browser really closes/relaunches; server is stopped, not an intercepted API response.
    context = await chromium.launchPersistentContext(profile);
    page = await context.newPage(); await page.goto(origin);
    await page.getByRole('button', { name: 'Personal information', exact: true }).click();
    await page.getByRole('button', { name: 'Show page', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('My name is Morgan.');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Return', exact: true }).click();
    await page.getByRole('button', { name: 'Communication book Words and phrases by subject', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Please wait.', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Common Phrases', exact: true })).toBeVisible();
    const urls = await page.evaluate(async () => { const urls = []; for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url); return urls; });
    if (urls.some(url => url.includes('/api/'))) throw new Error('Private API in cache');
    fs.mkdirSync(path.join(root, 'test-results/next'), { recursive: true });
    fs.writeFileSync(path.join(root, `test-results/next/cold-offline${database ? '-postgres' : ''}.json`), JSON.stringify({ passed: true, persistence: database ? 'isolated-postgres' : 'memory-test', appPoolRestartUnchanged: database, serverStopped: true, browserRelaunched: true, passage: true, rescue: true, masterBrowse: true, privateCacheEntries: 0 }, null, 2));
    process.stdout.write(`PASS: ${database ? 'PostgreSQL app/pool restart unchanged; ' : ''}cold browser relaunch with server stopped; owned passage, rescue, Book and public-only caches.\n`);
  } finally { if (context) await context.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (persistence) await persistence.pool.end(); }
}
run().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
