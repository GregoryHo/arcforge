#!/usr/bin/env node
/**
 * Pins the "JSON output" promise in docs/guide/cli-invocation.md: a command
 * that prints data prints the same JSON with or without `--json`.
 *
 * Each command runs in a tmp git repo against a tmp HOME and ARCFORGE_HOME,
 * so nothing real is read or written.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

console.log('Testing cli.js data commands print JSON without --json...\n');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-cli-json-'));
const projectRoot = path.join(tmpDir, 'proj');
const home = path.join(tmpDir, 'home');
fs.mkdirSync(projectRoot, { recursive: true });
fs.mkdirSync(home, { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: projectRoot });
execFileSync(
  'git',
  ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'],
  { cwd: projectRoot },
);

const env = {
  ...process.env,
  HOME: home,
  ARCFORGE_HOME: path.join(home, '.arcforge'),
  CLAUDE_PROJECT_DIR: projectRoot,
};

function runCli(args) {
  return execFileSync('node', [CLI_PATH, ...args], { cwd: projectRoot, encoding: 'utf8', env });
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

for (const args of [
  ['learn', 'status'],
  ['worktree', 'list'],
]) {
  test(`${args.join(' ')}: same JSON with and without --json`, () => {
    const plain = runCli(args);
    assert.strictEqual(plain, runCli([...args, '--json']));
    JSON.parse(plain);
  });
}

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
