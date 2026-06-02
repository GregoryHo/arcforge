/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/scripts/**/*.test.js', '**/skills/**/__tests__/**/*.test.js'],
  // Exclude hooks tests - they use Node.js native test runner
  testPathIgnorePatterns: ['/node_modules/', '/hooks/__tests__/', '/tests/node/'],
  // Coverage gate (TEST-1): a PARTIAL gate — it guards only the jest runner
  // (test:scripts) over the canonical engine (scripts/lib). The node --test,
  // pytest, and bash runners sit outside jest and are not covered here. The line
  // floor sits just below current coverage (~81%) to catch erosion without
  // introducing flakiness; raise it as coverage improves.
  collectCoverage: true,
  collectCoverageFrom: ['scripts/lib/**/*.js'],
  coverageReporters: ['text-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
    },
  },
};
