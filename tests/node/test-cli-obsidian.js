#!/usr/bin/env node
/**
 * Tests for the `obsidian` CLI subcommands.
 *
 * Each test runs `node scripts/cli.js obsidian ...` against a tmp HOME
 * so we can inspect the resulting ~/.arcforge/obsidian-vaults.json.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

console.log('Testing cli.js obsidian subcommands...\n');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-cli-obs-'));
const REGISTRY = path.join(tmpHome, '.arcforge', 'obsidian-vaults.json');

function runCli(argString, expectFail = false) {
  const env = { ...process.env, HOME: tmpHome };
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...argString.split(' ').filter(Boolean)], {
      encoding: 'utf8',
      env,
    });
    if (expectFail) {
      throw new Error(`expected failure, but got: ${stdout}`);
    }
    return { stdout, exitCode: 0 };
  } catch (err) {
    if (!expectFail) {
      console.error('STDOUT:', err.stdout);
      console.error('STDERR:', err.stderr);
      throw err;
    }
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status || 1 };
  }
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

function resetRegistry() {
  if (fs.existsSync(REGISTRY)) fs.unlinkSync(REGISTRY);
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

// --- register ---
test('register: first vault becomes default', () => {
  resetRegistry();
  const { stdout } = runCli('obsidian register --name wiki --path /tmp/wiki --json');
  const result = JSON.parse(stdout);
  assert.strictEqual(result.registered, 'wiki');
  assert.strictEqual(result.becameDefault, true);
  const reg = readRegistry();
  assert.strictEqual(reg.default, 'wiki');
  assert.strictEqual(reg.vaults.length, 1);
  assert.strictEqual(reg.vaults[0].search.baseline, 'filesystem');
});

test('register: second vault does not become default', () => {
  runCli('obsidian register --name news --path /tmp/news --preset news --json');
  const reg = readRegistry();
  assert.strictEqual(reg.default, 'wiki');
  assert.strictEqual(reg.vaults.length, 2);
  const news = reg.vaults.find((v) => v.name === 'news');
  assert.strictEqual(news.preset, 'news');
});

test('register: --default makes the new vault default', () => {
  runCli('obsidian register --name tasks --path /tmp/tasks --default --preset project-tracker');
  const reg = readRegistry();
  assert.strictEqual(reg.default, 'tasks');
});

test('register: --qmd-collection implies preferred=qmd', () => {
  runCli('obsidian register --name qmd-vault --path /tmp/qmd --qmd-collection obsidian-qmd-vault');
  const reg = readRegistry();
  const v = reg.vaults.find((entry) => entry.name === 'qmd-vault');
  assert.strictEqual(v.search.preferred, 'qmd');
  assert.strictEqual(v.search.qmd_collection, 'obsidian-qmd-vault');
  assert.strictEqual(v.search.baseline, 'filesystem');
  runCli('obsidian unregister qmd-vault');
});

test('register: duplicate name fails with non-zero exit', () => {
  const { exitCode, stderr } = runCli('obsidian register --name wiki --path /tmp/other', true);
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /already registered/);
});

// --- list-vaults ---
test('list-vaults: prints registered vaults', () => {
  const { stdout } = runCli('obsidian list-vaults');
  assert.match(stdout, /wiki/);
  assert.match(stdout, /news/);
  assert.match(stdout, /tasks/);
  assert.match(stdout, /\(default\)/);
});

test('list-vaults --json: returns full registry', () => {
  const { stdout } = runCli('obsidian list-vaults --json');
  const reg = JSON.parse(stdout);
  assert.strictEqual(reg.default, 'tasks');
  assert.strictEqual(reg.vaults.length, 3);
});

// --- set-default ---
test('set-default: changes default vault', () => {
  runCli('obsidian set-default wiki --json');
  assert.strictEqual(readRegistry().default, 'wiki');
});

test('set-default: unregistered name fails', () => {
  const { exitCode, stderr } = runCli('obsidian set-default nope', true);
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /not registered/);
});

// --- unregister ---
test('unregister: removes a non-default vault', () => {
  const { stdout } = runCli('obsidian unregister news --json');
  const result = JSON.parse(stdout);
  assert.strictEqual(result.removed, 'news');
  assert.strictEqual(result.clearedDefault, false);
  assert.strictEqual(readRegistry().vaults.length, 2);
});

test('unregister: removing default clears default', () => {
  const { stdout } = runCli('obsidian unregister wiki --json');
  const result = JSON.parse(stdout);
  assert.strictEqual(result.clearedDefault, true);
  assert.strictEqual(readRegistry().default, null);
});

test('unregister: missing name fails', () => {
  const { exitCode } = runCli('obsidian unregister nope', true);
  assert.notStrictEqual(exitCode, 0);
});

// --- list-vaults empty state ---
test('list-vaults: empty registry shows hint', () => {
  resetRegistry();
  const { stdout } = runCli('obsidian list-vaults');
  assert.match(stdout, /No vaults registered/);
});

// --- bare obsidian without subcommand ---
test('obsidian without subcommand fails with usage', () => {
  const { exitCode, stderr } = runCli('obsidian', true);
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /register\|unregister\|set-default\|list-vaults/);
});

// Cleanup
fs.rmSync(tmpHome, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
