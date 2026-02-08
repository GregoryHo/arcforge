#!/usr/bin/env node
/**
 * Simple test runner for Node.js tests
 *
 * Usage:
 *   node tests/node/run-tests.js           # Run all tests
 *   node tests/node/run-tests.js schema    # Run specific test
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const args = process.argv.slice(2);

// Find all test files
const testFiles = fs.readdirSync(testDir)
  .filter(f => f.startsWith('test-') && f.endsWith('.js'))
  .sort();

// Filter by argument if provided
const filesToRun = args.length > 0
  ? testFiles.filter(f => args.some(arg => f.includes(arg)))
  : testFiles;

if (filesToRun.length === 0) {
  console.error('No test files found matching:', args);
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Running Node.js tests');
console.log('='.repeat(60));
console.log();

let passed = 0;
let failed = 0;

for (const file of filesToRun) {
  const filePath = path.join(testDir, file);
  console.log(`Running ${file}...`);
  console.log('-'.repeat(40));

  try {
    execFileSync('node', [filePath], {
      stdio: 'inherit',
      cwd: path.resolve(testDir, '../..')
    });
    passed++;
  } catch (err) {
    console.error(`\n❌ FAILED: ${file}\n`);
    failed++;
  }
}

console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
