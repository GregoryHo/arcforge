#!/usr/bin/env node
/**
 * Tests for cli.js
 *
 * Note: These are integration tests that require a temporary git repo.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get the script directory
const SCRIPT_DIR = path.resolve(__dirname, '../../scripts');
const CLI_PATH = path.join(SCRIPT_DIR, 'cli.js');

console.log('Testing cli.js...\n');

// Create temporary test directory
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-cli-test-'));
const dagPath = path.join(testDir, 'dag.yaml');

// Helper to run CLI commands
function runCli(args, options = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: testDir
  };
  const argArray = args.split(' ').filter(a => a);
  try {
    const result = execFileSync('node', [CLI_PATH, ...argArray], {
      encoding: 'utf8',
      env,
      cwd: testDir,
      ...options
    });
    return { stdout: result, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.status || 1
    };
  }
}

// Initialize test git repo
function initTestRepo() {
  execFileSync('git', ['init'], { cwd: testDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: testDir, stdio: 'pipe' });
}

// Create test dag.yaml
function createTestDag() {
  const dag = `epics:
  - id: epic-001
    name: Test Epic
    status: in_progress
    spec_path: docs/spec.md
    worktree: null
    depends_on: []
    features:
      - id: feat-001
        name: Feature 1
        status: completed
        depends_on: []
      - id: feat-002
        name: Feature 2
        status: pending
        depends_on:
          - feat-001
  - id: epic-002
    name: Second Epic
    status: pending
    spec_path: docs/spec2.md
    worktree: null
    depends_on:
      - epic-001
    features:
      - id: feat-002-01
        name: Feature 2.1
        status: pending
        depends_on: []
`;
  fs.writeFileSync(dagPath, dag);
  execFileSync('git', ['add', 'dag.yaml'], { cwd: testDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: testDir, stdio: 'pipe' });
}

// Setup
console.log('  Setting up test environment...');
initTestRepo();
createTestDag();
console.log('    ✓ Test repo initialized');

// Test schema command
console.log('  CLI schema command...');
const schemaResult = runCli('schema');
assert.strictEqual(schemaResult.exitCode, 0);
assert.ok(schemaResult.stdout.includes('epics:'));
assert.ok(schemaResult.stdout.includes('blocked:'));
console.log('    ✓ schema');

const schemaJsonResult = runCli('schema --json');
assert.strictEqual(schemaJsonResult.exitCode, 0);
const schemaJson = JSON.parse(schemaJsonResult.stdout);
assert.ok(schemaJson.epics);
console.log('    ✓ schema --json');

const schemaExampleResult = runCli('schema --example');
assert.strictEqual(schemaExampleResult.exitCode, 0);
assert.ok(schemaExampleResult.stdout.includes('epic-001'));
console.log('    ✓ schema --example');

// Test status command
console.log('  CLI status command...');
const statusResult = runCli('status --json');
assert.strictEqual(statusResult.exitCode, 0);
const status = JSON.parse(statusResult.stdout);
assert.ok(Array.isArray(status.epics));
assert.strictEqual(status.epics.length, 2);
assert.strictEqual(status.epics[0].id, 'epic-001');
console.log('    ✓ status --json');

// Test next command
console.log('  CLI next command...');
const nextResult = runCli('next');
assert.strictEqual(nextResult.exitCode, 0);
const next = JSON.parse(nextResult.stdout);
assert.strictEqual(next.id, 'feat-002');
assert.strictEqual(next.type, 'feature');
console.log('    ✓ next');

// Test parallel command
console.log('  CLI parallel command...');
const parallelResult = runCli('parallel');
assert.strictEqual(parallelResult.exitCode, 0);
const parallel = JSON.parse(parallelResult.stdout);
assert.strictEqual(parallel.count, 0); // epic-002 is blocked by epic-001
console.log('    ✓ parallel');

// Test complete command
console.log('  CLI complete command...');
const completeResult = runCli('complete feat-002');
assert.strictEqual(completeResult.exitCode, 0);

// Verify status after completion
const statusAfter = JSON.parse(runCli('status --json').stdout);
const epic1 = statusAfter.epics.find(e => e.id === 'epic-001');
assert.strictEqual(epic1.status, 'completed'); // All features complete
assert.strictEqual(epic1.progress, 1);
console.log('    ✓ complete');

// Test parallel after epic-001 completed
const parallelAfter = JSON.parse(runCli('parallel').stdout);
assert.strictEqual(parallelAfter.count, 1);
assert.strictEqual(parallelAfter.epics[0].id, 'epic-002');
console.log('    ✓ parallel (after completion)');

// Test block command - need to pass reason as single argument
console.log('  CLI block command...');
// For block command, we need to handle the space in reason differently
const blockEnv = {
  ...process.env,
  CLAUDE_PROJECT_DIR: testDir
};
try {
  execFileSync('node', [CLI_PATH, 'block', 'feat-002-01', 'Waiting for API'], {
    encoding: 'utf8',
    env: blockEnv,
    cwd: testDir
  });
} catch (err) {
  // Ignore if it fails for other reasons
}

const statusBlocked = JSON.parse(runCli('status --json').stdout);
assert.strictEqual(statusBlocked.blocked.length, 1);
assert.strictEqual(statusBlocked.blocked[0].task_id, 'feat-002-01');
console.log('    ✓ block');

// Test reboot command
console.log('  CLI reboot command...');
const rebootResult = runCli('reboot');
assert.strictEqual(rebootResult.exitCode, 0);
const reboot = JSON.parse(rebootResult.stdout);
assert.ok('remaining_count' in reboot);
assert.ok('completed_count' in reboot);
assert.ok('blocked_count' in reboot);
console.log('    ✓ reboot');

// Test help
console.log('  CLI help...');
const helpResult = runCli('--help');
assert.strictEqual(helpResult.exitCode, 0);
assert.ok(helpResult.stdout.includes('USAGE:'));
assert.ok(helpResult.stdout.includes('COMMANDS:'));
console.log('    ✓ --help');

// Cleanup
console.log('  Cleaning up...');
fs.rmSync(testDir, { recursive: true, force: true });
console.log('    ✓ Cleanup complete');

console.log('\n✅ All CLI tests passed!\n');
