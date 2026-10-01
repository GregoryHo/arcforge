#!/usr/bin/env node
/**
 * Contract test for cli.md B-5 on the `eval` command group: a command that
 * runs and fails reports the reason as a single message on stderr, or — under
 * `--json` — as an `{ error }` object on stdout, and exits non-zero either way.
 *
 * Every case below fails before any trial or `claude` session could start, so
 * the test runs the live CLI against an empty fixture with no external spawn.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

console.log('Testing eval runtime failures under --json (cli.md B-5)...\n');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-eval-json-err-'));
const scenariosDir = path.join(testDir, 'evals', 'scenarios');
fs.mkdirSync(scenariosDir, { recursive: true });
// A scenario that resolves by name but fails lint (no required sections).
fs.writeFileSync(path.join(scenariosDir, 'broken.md'), '# Eval: broken\n\nnothing else\n');

function runCli(argArray) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...argArray], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: testDir, HOME: testDir },
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
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

const FAILURES = [
  { args: ['eval', 'lint', 'zzz-nope'], message: /scenario "zzz-nope" not found/ },
  { args: ['eval', 'lint'], message: /eval lint requires a scenario name/ },
  { args: ['eval', 'lint', 'broken'], message: /broken\.md:\d+: / },
  { args: ['eval', 'run', 'zzz-nope'], message: /scenario "zzz-nope" not found/ },
  { args: ['eval', 'preflight', 'zzz-nope'], message: /scenario "zzz-nope" not found/ },
  { args: ['eval', 'ab', 'zzz-nope'], message: /scenario "zzz-nope" not found/ },
  { args: ['eval', 'compare', 'zzz-nope'], message: /need both baseline and treatment/ },
];

for (const { args, message } of FAILURES) {
  test(`${args.join(' ')} --json: { error } on stdout, exit 1`, () => {
    const result = runCli([...args, '--json']);
    assert.strictEqual(result.exitCode, 1, `exit code: ${result.exitCode}`);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (err) {
      throw new Error(`stdout is not JSON (${err.message}): ${JSON.stringify(result.stdout)}`);
    }
    assert.deepStrictEqual(Object.keys(parsed), ['error']);
    assert.match(parsed.error, message);
  });

  test(`${args.join(' ')}: "Error: …" on stderr, nothing on stdout, exit 1`, () => {
    const result = runCli(args);
    assert.strictEqual(result.exitCode, 1, `exit code: ${result.exitCode}`);
    assert.strictEqual(result.stdout, '');
    assert.match(result.stderr, /^Error: /);
    assert.match(result.stderr, message);
  });
}

fs.rmSync(testDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
