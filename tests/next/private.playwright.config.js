const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './private-frontend', workers: 1, retries: 0, timeout: 45000, outputDir: '../../test-results/next/private-browser-run', reporter: 'list', use: { baseURL: 'http://127.0.0.1:3179', browserName: 'chromium' } });
