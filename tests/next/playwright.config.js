const { defineConfig } = require('@playwright/test');
const port = process.env.NEXT_TEST_PORT || '3162';
module.exports = defineConfig({
  testDir: './frontend', fullyParallel: false, workers: 1, retries: 0, timeout: 45000,
  // Playwright clears outputDir on every run. Keep print/offline/restart evidence outside it.
  outputDir: '../../test-results/next/browser-run', reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: process.env.NEXT_TEST_EXTERNAL ? undefined : { command: 'node harness/start.js --memory', url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 15000 }
});
