// Direct Playwright invocation uses the maintained My Words disposable harness.
const path = require('node:path');
const config = require('./tests/next/playwright.config');
module.exports = {
  ...config,
  testDir: path.resolve(__dirname, 'tests/next/frontend'),
  outputDir: path.resolve(__dirname, 'test-results/next/browser-run'),
  webServer: config.webServer && {
    ...config.webServer,
    command: 'node tests/next/harness/start.js --memory'
  }
};
