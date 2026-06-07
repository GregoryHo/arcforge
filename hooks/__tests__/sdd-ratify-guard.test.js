/**
 * sdd-ratify-guard tests (Node --test runner).
 *
 * Task 3b: best-effort PreToolUse Bash hook that denies "arcforge ratify" and
 * "node scripts/cli.js ratify" when the loop sentinel (.arcforge-loop.json)
 * is present at project root.
 *
 * Honest limit: this hook is bypassable via --dangerously-skip-permissions.
 * The engine gate in ratify-command.js (ARCFORGE_MODE check + sentinel check)
 * is the PRIMARY deterministic guard. This hook is the best-effort harness layer.
 *
 * Tests:
 *  (a) evaluate: Bash "arcforge ratify ..." + sentinel present → DENY
 *  (b) evaluate: Bash "node scripts/cli.js ratify ..." + sentinel present → DENY
 *  (c) evaluate: Bash "arcforge ratify ..." + no sentinel → ALLOW (null)
 *  (d) evaluate: Bash "ls" (non-ratify) + sentinel present → ALLOW
 *  (e) evaluate: null/malformed input → ALLOW (fail-open)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SENTINEL = '.arcforge-loop.json';
const HOOK_PATH = require.resolve('../sdd-ratify-guard/main');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ratify-guard-'));
}

describe('sdd-ratify-guard evaluate', () => {
  let dirs;

  beforeEach(() => {
    dirs = [];
    delete require.cache[HOOK_PATH];
  });

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    delete require.cache[HOOK_PATH];
  });

  function dir() {
    const d = makeDir();
    dirs.push(d);
    return d;
  }

  // (a) arcforge ratify + sentinel present → DENY
  it('(a) Bash "arcforge ratify ..." with sentinel present is denied', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir();
    fs.writeFileSync(path.join(cwd, SENTINEL), JSON.stringify({ running: true }));

    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'arcforge ratify my-spec D-001' },
      cwd,
    });
    assert.ok(reason !== null, 'Should deny arcforge ratify when sentinel present');
    assert.ok(typeof reason === 'string' && reason.length > 0, 'Deny reason must be non-empty');
  });

  // (b) node scripts/cli.js ratify + sentinel → DENY
  it('(b) Bash "node scripts/cli.js ratify ..." with sentinel present is denied', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir();
    fs.writeFileSync(path.join(cwd, SENTINEL), JSON.stringify({ running: true }));

    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/cli.js ratify my-spec D-001' },
      cwd,
    });
    assert.ok(reason !== null, 'Should deny node cli ratify when sentinel present');
  });

  // (c) arcforge ratify + no sentinel → ALLOW
  it('(c) Bash "arcforge ratify ..." without sentinel is allowed', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir(); // no sentinel file

    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'arcforge ratify my-spec D-001' },
      cwd,
    });
    assert.strictEqual(reason, null, 'Should allow arcforge ratify when no sentinel');
  });

  // (d) non-ratify command + sentinel → ALLOW
  it('(d) non-ratify Bash command with sentinel is allowed', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir();
    fs.writeFileSync(path.join(cwd, SENTINEL), JSON.stringify({ running: true }));

    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'arcforge status' },
      cwd,
    });
    assert.strictEqual(reason, null, 'Non-ratify command must not be denied');
  });

  // (d2) Edit tool (wrong tool type) → ALLOW (hook only intercepts Bash)
  it('(d2) Edit tool is not intercepted by ratify guard', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir();
    fs.writeFileSync(path.join(cwd, SENTINEL), JSON.stringify({ running: true }));

    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: { file_path: '/some/file.js', old_string: 'x', new_string: 'y' },
      cwd,
    });
    assert.strictEqual(reason, null, 'Edit tool must not be denied by ratify guard');
  });

  // (e) null input → ALLOW (fail-open)
  it('(e) null input does not crash and does not deny', () => {
    const { evaluate } = require(HOOK_PATH);
    assert.strictEqual(evaluate(null), null);
  });

  it('(e) missing tool_input does not crash', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir();
    assert.strictEqual(evaluate({ tool_name: 'Bash', cwd }), null);
  });

  it('(e) malformed input (no command) does not crash', () => {
    const { evaluate } = require(HOOK_PATH);
    const cwd = dir();
    assert.strictEqual(evaluate({ tool_name: 'Bash', tool_input: {}, cwd }), null);
  });
});
