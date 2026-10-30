const https = require('node:https');
const { chromium } = require('@playwright/test');
const { openMultiAccount } = require('../harness/multi-account-app');
const { accountJourney } = require('../harness/account-journey');
const { httpJourney } = require('../../../scripts/lib/synthetic-http.cjs');
const run = process.env.NEXT_TEST_DATABASE_URL ? describe : describe.skip;
run('REAL account browser and hosted HTTP journeys on guarded PostgreSQL', () => {
  test('secure browser sign-in, saves, switching, offline drafts and export stay owned', async () => {
    let fixture, browser;
    try {
      fixture = await openMultiAccount({ database: true });
      browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, args: ['--ignore-certificate-errors'] });
      await accountJourney(browser, fixture);
    } finally { await browser?.close(); await fixture?.close(); }
  }, 45000);
  test('the hosted HTTP acceptance code preserves real SQL envelopes and restore retries', async () => {
    const fixture = await openMultiAccount({ database: true, synthetic: true });
    try {
      // Per-request loopback certificate exception only. Actual HTTPS/API/session
      // bodies are untouched; no auth interception or global TLS bypass.
      const localFetch = (url, options = {}) => new Promise((resolve, reject) => {
        if (new URL(url).origin !== fixture.origin) return reject(new Error('Refuse non-loopback test transport'));
        const req = https.request(url, { ...options, rejectUnauthorized: false }, res => {
          const chunks = []; res.on('data', chunk => chunks.push(chunk));
          res.once('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
          res.once('error', reject);
        });
        req.once('error', reject); if (options.body) req.write(options.body); req.end();
      });
      // Password generation remains the hosted helper's real suffix convention.
      const secret = 'fictional-http-test-secret';
      const bcrypt = require('bcrypt');
      for (const account of fixture.accounts) await fixture.pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(secret + '-' + account.id, 4), account.id]);
      await httpJourney({ state: { origin: fixture.origin }, secrets: { login: secret }, fetch: localFetch });
    } finally { await fixture.close(); }
  }, 30000);
});
