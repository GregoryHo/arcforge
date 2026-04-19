/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/scripts/**/*.test.js', '**/skills/**/__tests__/**/*.test.js'],
  // Exclude hooks tests - they use Node.js native test runner
  testPathIgnorePatterns: ['/node_modules/', '/hooks/__tests__/', '/tests/node/'],
};
