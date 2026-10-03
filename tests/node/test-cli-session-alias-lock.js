#!/usr/bin/env node
/**
 * Concurrency contract for the alias index (cli B-9): every change holds
 * `aliases.lock` beside `aliases.json` from load to save, so `arcforge session`
 * processes running at once never drop each other's changes.
 *
 * Each test runs real `node scripts/cli.js session alias ...` child processes
 * with ARCFORGE_HOME and CLAUDE_PROJECT_DIR pointed at tmp dirs.
 */

const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

console.log('Testing cli.js session alias locking...\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-alias-lock-'));
const HOME = path.join(tmp, 'home');
const PROJECT_DIR = path.join(tmp, 'lock-proj');
const SESSIONS = path.join(HOME, 'sessions', 'lock-proj');
const ALIASES = path.join(SESSIONS, 'aliases.json');
const LOCK = path.join(SESSIONS, 'aliases.lock');
const ENV = { ...process.env, ARCFORGE_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT_DIR };
fs.mkdirSync(PROJECT_DIR, { recursive: true });

const FIVE = `# Lock work

## Where it stands
main; npm test — 1 passed

## Done
- nothing yet — verified by reading

## Unfinished
- everything — not started

## Decisions
- none — because nothing is decided

## Next
1. npm test
`;

/** Run the CLI to completion; resolves { code, stdout, stderr }. */
function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], { env: ENV, cwd: PROJECT_DIR });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function aliasNames() {
  return Object.keys(JSON.parse(fs.readFileSync(ALIASES, 'utf8')).aliases).sort();
}

/** A pid no process holds: spawn one, let it exit. */
function deadPid() {
  return execFileSync('node', ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim();
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

async function main() {
  const out = execFileSync('node', [CLI_PATH, 'session', 'save', 'base', '--from', '-'], {
    env: ENV,
    cwd: PROJECT_DIR,
    input: FIVE,
    encoding: 'utf8',
  });
  const archive = out.match(/^Saved session archive: (.+) \(alias /m)[1];

  await test('8 concurrent alias set + a concurrent remove: no change is lost', async () => {
    for (let round = 0; round < 3; round++) {
      await runCli(['session', 'alias', 'set', 'doomed', archive, '--force']);
      const names = Array.from({ length: 8 }, (_, i) => `r${round}-a${i}`);
      const results = await Promise.all([
        ...names.map((n) => runCli(['session', 'alias', 'set', n, archive])),
        runCli(['session', 'alias', 'remove', 'doomed']),
      ]);
      for (const r of results) assert.strictEqual(r.code, 0, r.stderr);
      const index = aliasNames();
      for (const n of names) assert.ok(index.includes(n), `round ${round}: ${n} was lost`);
      assert.ok(!index.includes('doomed'), `round ${round}: removed alias was resurrected`);
    }
    assert.ok(!fs.existsSync(LOCK), 'lock left behind');
  });

  await test('a stale lock whose holder is dead is reclaimed', async () => {
    fs.writeFileSync(LOCK, JSON.stringify({ pid: Number(deadPid()), timestamp: '2020-01-01' }));
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(LOCK, past, past);
    const r = await runCli(['session', 'alias', 'set', 'after-stale', archive]);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.ok(aliasNames().includes('after-stale'));
    assert.ok(!fs.existsSync(LOCK), 'reclaimed lock left behind');
  });

  await test('a live lock makes a writer wait for its release', async () => {
    fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid }));
    const pending = runCli(['session', 'alias', 'set', 'waited', archive]);
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(!aliasNames().includes('waited'), 'wrote while the lock was held');
    fs.unlinkSync(LOCK);
    const r = await pending;
    assert.strictEqual(r.code, 0, r.stderr);
    assert.ok(aliasNames().includes('waited'));
  });

  await test('a live lock held past the wait fails naming the lock file', async () => {
    fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid }));
    const r = await runCli(['session', 'alias', 'remove', 'waited']);
    fs.unlinkSync(LOCK);
    assert.notStrictEqual(r.code, 0);
    assert.ok(r.stderr.includes(`alias index is locked: ${LOCK}`), r.stderr);
    assert.ok(aliasNames().includes('waited'), 'removed without the lock');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
