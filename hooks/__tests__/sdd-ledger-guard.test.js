/**
 * sdd-ledger-guard tests (Node --test runner).
 *
 * The hook exposes two surfaces:
 *   decideLedgerEdit(resultingContent, headContent) — pure, no git/fs, testable
 *   evaluate(input)                                 — wires decideLedgerEdit + gate
 *
 * Cases (a/b/c) use decideLedgerEdit with synthetic YAML strings (no git fixture).
 * Cases (d/e) use evaluate() for gate and fail-open behavior.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid single-entry decisions.yml content. */
function makeLedgerYaml(overrides = {}) {
  const entry = {
    'D-id': 'D-001',
    date: '2026-06-07',
    spec_version: 1,
    status: 'proposed',
    decision: 'Use YAML for decision ledger format.',
    why: 'Human-readable, git-diffable, toolable.',
    authorized_values: 'any',
    ...overrides,
  };
  return yamlSerialize([entry]);
}

/** Serialize an array of objects to simple YAML sequence (for test inputs). */
function yamlSerialize(entries) {
  return (
    entries
      .map((e) => {
        const lines = ['- D-id: ' + JSON.stringify(e['D-id'])];
        for (const [k, v] of Object.entries(e)) {
          if (k === 'D-id') continue;
          if (v === undefined || v === null) continue;
          lines.push('  ' + k + ': ' + JSON.stringify(v));
        }
        return lines.join('\n');
      })
      .join('\n') + '\n'
  );
}

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ledger-guard-'));
}

// ---------------------------------------------------------------------------
// Tests: decideLedgerEdit (pure function, no git)
// ---------------------------------------------------------------------------

describe('sdd-ledger-guard decideLedgerEdit', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../sdd-ledger-guard/main')];
  });

  // (a) Legal append — new D-id added, head entry untouched → ALLOW
  it('(a) legal append of new D-id returns null (ALLOW)', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    const headYaml = makeLedgerYaml(); // D-001 only

    // Current = D-001 (unchanged) + D-002 (new)
    const currentEntries = [
      {
        'D-id': 'D-001',
        date: '2026-06-07',
        spec_version: 1,
        status: 'proposed',
        decision: 'Use YAML for decision ledger format.',
        why: 'Human-readable, git-diffable, toolable.',
        authorized_values: 'any',
      },
      {
        'D-id': 'D-002',
        date: '2026-06-07',
        spec_version: 1,
        status: 'proposed',
        decision: 'Second decision.',
        why: 'Additional rationale.',
        authorized_values: 'any',
      },
    ];
    const currentYaml = yamlSerialize(currentEntries);

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.strictEqual(reason, null, 'Legal append should be allowed (reason must be null)');
  });

  // (b) Editing a frozen entry's decision text → DENY
  it('(b) editing a frozen decision field returns a deny reason', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    const headYaml = makeLedgerYaml({ decision: 'Original decision text.' });

    // Current = same D-001 but with mutated decision text
    const currentYaml = makeLedgerYaml({ decision: 'MUTATED decision text.' });

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.ok(reason !== null, 'Frozen field edit should be denied');
    assert.ok(typeof reason === 'string', 'Deny reason should be a string');
    assert.ok(reason.length > 0, 'Deny reason should not be empty');
  });

  // (c) Supersede status flip + matching new entry → ALLOW
  it('(c) valid supersede flip returns null (ALLOW)', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    // HEAD: D-001 with status: accepted
    const headYaml = makeLedgerYaml({ status: 'accepted' });

    // Current: D-001 flipped to superseded-by:D-002, new D-002 with supersedes: D-001
    // (decision and why MUST be byte-identical for immutability to pass)
    const currentEntries = [
      {
        'D-id': 'D-001',
        date: '2026-06-07',
        spec_version: 1,
        status: 'superseded-by:D-002',
        decision: 'Use YAML for decision ledger format.',
        why: 'Human-readable, git-diffable, toolable.',
        authorized_values: 'any',
      },
      {
        'D-id': 'D-002',
        date: '2026-06-07',
        spec_version: 2,
        status: 'proposed',
        decision: 'Use JSON+YAML hybrid for ledger.',
        why: 'Better tooling support.',
        authorized_values: 'any',
        supersedes: 'D-001',
      },
    ];
    const currentYaml = yamlSerialize(currentEntries);

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.strictEqual(reason, null, 'Valid supersede flip should be allowed');
  });
});

// ---------------------------------------------------------------------------
// Tests: evaluate (gate + fail-open)
// ---------------------------------------------------------------------------

describe('sdd-ledger-guard evaluate', () => {
  let dirs;

  beforeEach(() => {
    dirs = [];
    delete require.cache[require.resolve('../sdd-ledger-guard/main')];
  });

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function dir() {
    const d = makeDir();
    dirs.push(d);
    return d;
  }

  // (d) Non-decisions.yml path → gate never fires, no deny
  it('(d) Edit/Write to a non-decisions.yml path never denies', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');

    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: {
        file_path: '/some/path/spec.xml',
        old_string: 'old',
        new_string: 'new',
      },
      cwd: dir(),
    });
    assert.strictEqual(reason, null, 'Non-decisions.yml edit must not be denied');
  });

  it('(d) Write to a non-decisions.yml path never denies', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');

    const reason = evaluate({
      tool_name: 'Write',
      tool_input: {
        file_path: '/some/path/decision-log.yml',
        content: '- text: hello\n',
      },
      cwd: dir(),
    });
    assert.strictEqual(reason, null, 'Write to decision-log.yml (wrong name) must not be denied');
  });

  // (e) Malformed input → fail-open, no crash, no false deny
  it('(e) null input does not crash and does not deny', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    assert.strictEqual(evaluate(null), null);
  });

  it('(e) missing tool_input does not crash', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    assert.strictEqual(evaluate({ tool_name: 'Edit', cwd: '/tmp' }), null);
  });

  it('(e) malformed Edit (no file_path) does not crash', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    assert.strictEqual(evaluate({ tool_name: 'Edit', tool_input: {}, cwd: '/tmp' }), null);
  });
});

// ---------------------------------------------------------------------------
// Wire-format test: main() subprocess → stdout JSON on block
// ---------------------------------------------------------------------------

describe('sdd-ledger-guard main() wire format', () => {
  const hookPath = require.resolve('../sdd-ledger-guard/main');
  let dirs;

  beforeEach(() => {
    dirs = [];
  });

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function run(payload) {
    const out = execFileSync('node', [hookPath], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
    return out.trim();
  }

  it('emits nothing (allows) when tool is not Edit or Write', () => {
    const out = run({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/tmp' });
    assert.strictEqual(out, '', 'Bash tool must produce no output (allow)');
  });

  it('emits nothing (allows) when file_path is not decisions.yml', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slg-wire-'));
    dirs.push(cwd);
    const out = run({
      tool_name: 'Write',
      tool_input: { file_path: path.join(cwd, 'spec.xml'), content: '<spec/>' },
      cwd,
    });
    assert.strictEqual(out, '', 'Non-decisions.yml Write must produce no output');
  });

  it('emits permissionDecision:deny JSON when Write would mutate a frozen field', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slg-wire-'));
    dirs.push(cwd);

    // Set up a git repo with HEAD that contains the original decisions.yml
    execFileSync('git', ['init'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd, stdio: 'pipe' });

    const decisionsPath = path.join(cwd, 'decisions.yml');
    const headContent = makeLedgerYaml({ decision: 'Original frozen decision.' });
    fs.writeFileSync(decisionsPath, headContent);
    execFileSync('git', ['add', 'decisions.yml'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd, stdio: 'pipe' });

    // Now Write with mutated decision field
    const mutatedContent = makeLedgerYaml({ decision: 'MUTATED frozen decision.' });
    const out = run({
      tool_name: 'Write',
      tool_input: { file_path: decisionsPath, content: mutatedContent },
      cwd,
    });

    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(parsed.hookSpecificOutput.permissionDecisionReason.length > 0);
  });
});
