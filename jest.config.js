/**
 * Jest Configuration
 *
 * Shared Jest settings. Maintained My Words commands select tests/next.
 * Tests run automatically before Railway deployments.
 */

module.exports = {
  // Use Node.js test environment (not browser)
  testEnvironment: 'node',

  // Where to find test files
  testMatch: [
    '**/tests/**/*.test.js'
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/'
  ],

  // Show verbose output so you can see which tests pass/fail
  verbose: true,

  // Stop after first failure (helpful for debugging)
  bail: false,

  // Collect coverage information (optional - shows which code is tested)
  collectCoverage: false,

  // Timeout for each test (10 seconds)
  testTimeout: 10000
};
