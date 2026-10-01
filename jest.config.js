/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/scripts/**/*.test.js'],
  // Exclude hooks tests - they use Node.js native test runner - and the agent
  // worktrees under .claude/worktrees/, which are whole checkouts of other
  // branches: without this, `npm test` from the main checkout runs their
  // tests/scripts/ too and fails on a branch's own in-progress test. Anchored
  // to <rootDir> so that, run from inside one of those worktrees, jest still
  // finds that worktree's own tests.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/hooks/__tests__/',
    '/tests/node/',
    '<rootDir>/.claude/worktrees/',
  ],
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
