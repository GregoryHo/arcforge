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
  return `${entries
    .map((e) => {
      const lines = [`- D-id: ${JSON.stringify(e['D-id'])}`];
      for (const [k, v] of Object.entries(e)) {
        if (k === 'D-id') continue;
        if (v === undefined || v === null) continue;
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
      return lines.join('\n');
    })
    .join('\n')}\n`;
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

// ---------------------------------------------------------------------------
// Tests: Task 3a — forge-by-Edit guard (decideForgeAttempt)
// Deny Edit/Write that introduces status:accepted or adds ratified_by on an entry
// that did not have it at HEAD. This closes the forge-by-Edit hole.
// ---------------------------------------------------------------------------

describe('sdd-ledger-guard decideLedgerEdit — Task 3a forge guard', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../sdd-ledger-guard/main')];
  });

  // Forge proposed→accepted via Edit → DENY
  it('3a: Edit flipping proposed→accepted is denied (forge-by-Edit blocked)', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    // HEAD: D-001 proposed, no ratified_by
    const headYaml = makeLedgerYaml({ status: 'proposed' });

    // Current: D-001 flipped to accepted (no ratify CLI involved)
    const currentYaml = makeLedgerYaml({ status: 'accepted' });

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.ok(reason !== null, 'Forge proposed→accepted via Edit must be denied');
    assert.ok(typeof reason === 'string' && reason.length > 0, 'Deny reason must be a string');
  });

  // Forge by adding ratified_by via Edit → DENY
  it('3a: Edit adding ratified_by to a proposed entry is denied', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    // HEAD: D-001 proposed, no ratified_by
    const headYaml = makeLedgerYaml({ status: 'proposed' });

    // Current: D-001 still proposed but now has ratified_by (agent trying to fake it)
    const currentYaml = makeLedgerYaml({ status: 'proposed', ratified_by: 'agent@fake' });

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.ok(reason !== null, 'Forge ratified_by via Edit must be denied');
  });

  // Forge both at once (accepted + ratified_by) → DENY
  it('3a: Edit flipping proposed→accepted+ratified_by is denied', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    const headYaml = makeLedgerYaml({ status: 'proposed' });
    const currentYaml = makeLedgerYaml({ status: 'accepted', ratified_by: 'agent@fake' });

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.ok(reason !== null, 'Forge accepted+ratified_by via Edit must be denied');
  });

  // Legal proposed append (no accepted/ratified_by introduced) → ALLOW
  it('3a: legal proposed append (no accepted/ratified_by) returns null (ALLOW)', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    const headYaml = makeLedgerYaml(); // D-001 proposed

    // Current: D-001 (unchanged) + D-002 (new, proposed)
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
        decision: 'Second proposed decision.',
        why: 'Reason.',
        authorized_values: 'any',
      },
    ];
    const currentYaml = yamlSerialize(currentEntries);

    const reason = decideLedgerEdit(currentYaml, headYaml);
    assert.strictEqual(reason, null, 'Legal proposed append must be allowed');
  });

  // New file (headContent null): new accepted entry → DENY (previous=null ⇒ every accepted is forge)
  it('3a: new accepted entry on new file (headContent null) is denied', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    const currentYaml = makeLedgerYaml({ status: 'accepted', ratified_by: 'agent@fake' });

    const reason = decideLedgerEdit(currentYaml, null);
    assert.ok(reason !== null, 'New accepted entry on new file must be denied');
  });

  // New proposed entry on new file → ALLOW
  it('3a: new proposed entry on new file (headContent null) is allowed', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');

    const currentYaml = makeLedgerYaml({ status: 'proposed' });

    const reason = decideLedgerEdit(currentYaml, null);
    assert.strictEqual(reason, null, 'New proposed entry on new file must be allowed');
  });

  // Fail-open: malformed current → ALLOW (no false deny)
  it('3a: malformed current content does not deny (fail-open)', () => {
    const { decideLedgerEdit } = require('../sdd-ledger-guard/main');
    const reason = decideLedgerEdit('not valid yaml }{', null);
    assert.strictEqual(reason, null, 'Malformed YAML must fail-open');
  });
});

// ---------------------------------------------------------------------------
// Tests: SDD-3 — on-disk baseline fallback (closes the S8 hole for
// untracked/uncommitted decisions.yml). When the file has no HEAD version,
// evaluate() validates against the pre-edit on-disk content instead of
// skipping all checks. HEAD stays authoritative when available.
// ---------------------------------------------------------------------------

describe('sdd-ledger-guard evaluate — SDD-3 on-disk baseline fallback', () => {
  let dirs;

  beforeEach(() => {
    dirs = [];
    delete require.cache[require.resolve('../sdd-ledger-guard/main')];
  });

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  /** Git repo with one seed commit — decisions.yml stays UNTRACKED unless committed. */
  function makeGitRepo() {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slg-sdd3-'));
    dirs.push(cwd);
    execFileSync('git', ['init'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd, stdio: 'pipe' });
    fs.writeFileSync(path.join(cwd, 'README.md'), 'seed\n');
    execFileSync('git', ['add', 'README.md'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'seed'], { cwd, stdio: 'pipe' });
    return cwd;
  }

  // (1) Untracked flip proposed→accepted → DENY (forge against on-disk baseline)
  it('SDD-3: untracked file, Edit flipping proposed→accepted is denied', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    const cwd = makeGitRepo();
    const ledgerPath = path.join(cwd, 'decisions.yml');
    fs.writeFileSync(ledgerPath, makeLedgerYaml({ status: 'proposed' }));

    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: {
        file_path: ledgerPath,
        old_string: 'status: "proposed"',
        new_string: 'status: "accepted"',
      },
      cwd,
    });
    assert.ok(reason !== null, 'Untracked proposed→accepted flip must be denied');
    assert.ok(typeof reason === 'string' && reason.length > 0);
  });

  // (2) Untracked frozen-text mutation → DENY (the S8 hole this task closes)
  it('SDD-3: untracked file, Edit mutating frozen decision text is denied', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    const cwd = makeGitRepo();
    const ledgerPath = path.join(cwd, 'decisions.yml');
    fs.writeFileSync(ledgerPath, makeLedgerYaml({ decision: 'Original decision text.' }));

    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: {
        file_path: ledgerPath,
        old_string: '"Original decision text."',
        new_string: '"REWRITTEN decision text."',
      },
      cwd,
    });
    assert.ok(reason !== null, 'Untracked frozen-text mutation must be denied (S8 hole)');
    assert.ok(/[Ii]mmutability/.test(reason), 'Deny reason should cite immutability');
  });

  // (3) Untracked legal append of a new proposed entry → ALLOW
  it('SDD-3: untracked file, Write appending a new proposed entry is allowed', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    const cwd = makeGitRepo();
    const ledgerPath = path.join(cwd, 'decisions.yml');
    fs.writeFileSync(ledgerPath, makeLedgerYaml({ status: 'proposed' }));

    const appended = yamlSerialize([
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
        decision: 'Second proposed decision.',
        why: 'Reason.',
        authorized_values: 'any',
      },
    ]);
    const reason = evaluate({
      tool_name: 'Write',
      tool_input: { file_path: ledgerPath, content: appended },
      cwd,
    });
    assert.strictEqual(reason, null, 'Untracked legal append must be allowed');
  });

  // (4) Brand-new file (nothing on disk), proposed-only Write → ALLOW (previous=null preserved)
  it('SDD-3: brand-new file, proposed-only Write is allowed', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    const cwd = makeGitRepo();
    const ledgerPath = path.join(cwd, 'decisions.yml'); // does not exist on disk

    const reason = evaluate({
      tool_name: 'Write',
      tool_input: { file_path: ledgerPath, content: makeLedgerYaml({ status: 'proposed' }) },
      cwd,
    });
    assert.strictEqual(reason, null, 'Proposed-only Write to a brand-new file must be allowed');
  });

  // (5) HEAD-tracked file → HEAD baseline wins over on-disk content
  it('SDD-3: HEAD-tracked file uses HEAD as baseline, not on-disk content', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    const cwd = makeGitRepo();
    const ledgerPath = path.join(cwd, 'decisions.yml');

    // Commit the original ledger at HEAD.
    fs.writeFileSync(ledgerPath, makeLedgerYaml({ decision: 'Original frozen decision.' }));
    execFileSync('git', ['add', 'decisions.yml'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'ledger'], { cwd, stdio: 'pipe' });

    // Tamper the working tree copy (simulates a bash-level edit the hook never saw).
    fs.writeFileSync(ledgerPath, makeLedgerYaml({ decision: 'TAMPERED frozen decision.' }));

    // Write keeps the tampered text and appends a new proposed entry.
    // Against the on-disk baseline this would be a legal append (ALLOW);
    // against HEAD it is a frozen-text mutation (DENY). DENY proves HEAD wins.
    const written = yamlSerialize([
      {
        'D-id': 'D-001',
        date: '2026-06-07',
        spec_version: 1,
        status: 'proposed',
        decision: 'TAMPERED frozen decision.',
        why: 'Human-readable, git-diffable, toolable.',
        authorized_values: 'any',
      },
      {
        'D-id': 'D-002',
        date: '2026-06-07',
        spec_version: 1,
        status: 'proposed',
        decision: 'Second proposed decision.',
        why: 'Reason.',
        authorized_values: 'any',
      },
    ]);
    const reason = evaluate({
      tool_name: 'Write',
      tool_input: { file_path: ledgerPath, content: written },
      cwd,
    });
    assert.ok(reason !== null, 'HEAD-tracked file must be validated against HEAD, not on-disk');
  });

  // (6) fs error reading the on-disk baseline → ALLOW (fail-open, no crash)
  it('SDD-3: unreadable on-disk baseline fails open (ALLOW, no crash)', () => {
    const { evaluate } = require('../sdd-ledger-guard/main');
    const cwd = makeGitRepo();
    // A DIRECTORY named decisions.yml: untracked (HEAD null) and unreadable as a file.
    fs.mkdirSync(path.join(cwd, 'decisions.yml'));

    const reason = evaluate({
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(cwd, 'decisions.yml'),
        content: makeLedgerYaml({ status: 'proposed' }),
      },
      cwd,
    });
    assert.strictEqual(reason, null, 'fs error reading on-disk baseline must fail open');
  });
});

// ---------------------------------------------------------------------------
// Wire-format test: SDD-3 stdin fixture — untracked frozen-text mutation
// produces a deny JSON through main() (the full stdin → stdout path).
// ---------------------------------------------------------------------------

describe('sdd-ledger-guard main() wire format — SDD-3 untracked baseline', () => {
  const hookPath = require.resolve('../sdd-ledger-guard/main');
  let dirs;

  beforeEach(() => {
    dirs = [];
  });

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it('emits permissionDecision:deny for a frozen-field Write on an UNTRACKED ledger', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slg-wire-sdd3-'));
    dirs.push(cwd);

    execFileSync('git', ['init'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd, stdio: 'pipe' });
    fs.writeFileSync(path.join(cwd, 'README.md'), 'seed\n');
    execFileSync('git', ['add', 'README.md'], { cwd, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'seed'], { cwd, stdio: 'pipe' });

    // Untracked decisions.yml on disk — never committed.
    const decisionsPath = path.join(cwd, 'decisions.yml');
    fs.writeFileSync(decisionsPath, makeLedgerYaml({ decision: 'Original frozen decision.' }));

    const out = execFileSync('node', [hookPath], {
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: {
          file_path: decisionsPath,
          content: makeLedgerYaml({ decision: 'MUTATED frozen decision.' }),
        },
        cwd,
      }),
      encoding: 'utf8',
    }).trim();

    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(parsed.hookSpecificOutput.permissionDecisionReason.length > 0);
  });
});
