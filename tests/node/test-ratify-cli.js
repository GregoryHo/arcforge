#!/usr/bin/env node
/**
 * tests/node/test-ratify-cli.js — Integration tests for "arcforge ratify <spec-id> <D-id>"
 *
 * Task 2 acceptance criteria (from PR-4-core spec):
 * - Engine B1 gate (PRIMARY): refuse when ARCFORGE_MODE !== 'attended' → exit nonzero, write nothing.
 * - Engine B1 gate: refuse when loop sentinel (.arcforge-loop.json) present → exit nonzero, write nothing.
 * - Attended + no sentinel: mints accepted+ratified_by, frozen text unchanged, decision/why byte-identical.
 * - Non-proposed D-id (already accepted) → error, exit nonzero.
 * - Missing D-id → error, exit nonzero.
 * - Missing decisions.yml → error, exit nonzero.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');
const SPEC_ID = 'test-ratify-spec';

console.log('Testing arcforge ratify CLI...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-ratify-test-'));
}

/** Run the ratify CLI with given env overrides and optional stdin. */
function runRatify(tmpDir, specId, dId, { env = {}, input = '' } = {}) {
  const mergedEnv = {
    ...process.env,
    CLAUDE_PROJECT_DIR: tmpDir,
    // Remove ARCFORGE_MODE unless caller sets it
    ARCFORGE_MODE: undefined,
    ...env,
  };
  // Remove undefined values
  for (const k of Object.keys(mergedEnv)) {
    if (mergedEnv[k] === undefined) delete mergedEnv[k];
  }

  try {
    const stdout = execFileSync('node', [CLI_PATH, 'ratify', specId, dId], {
      encoding: 'utf8',
      env: mergedEnv,
      cwd: tmpDir,
      input,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    };
  }
}

/** Create a minimal decisions.yml with one proposed entry. */
function makeDecisionsYml(entries) {
  return entries
    .map((e) => {
      let yaml = `- D-id: "${e['D-id']}"\n`;
      yaml += `  date: "${e.date || '2026-06-07'}"\n`;
      yaml += `  spec_version: v1\n`;
      yaml += `  status: "${e.status || 'proposed'}"\n`;
      yaml += `  decision: "${e.decision || 'Test decision.'}"\n`;
      yaml += `  why: "${e.why || 'Test why.'}"\n`;
      if (e.ratified_by) yaml += `  ratified_by: "${e.ratified_by}"\n`;
      if (Array.isArray(e.authorized_values)) {
        yaml += `  authorized_values:\n`;
        for (const v of e.authorized_values) yaml += `    - "${v}"\n`;
      }
      return yaml;
    })
    .join('');
}

function setupSpec(tmpDir, decisionsContent) {
  const specDir = path.join(tmpDir, 'specs', SPEC_ID);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'decisions.yml'), decisionsContent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// KEYSTONE: unattended self-mint refused — ARCFORGE_MODE not set
test('KEYSTONE: ratify refused when ARCFORGE_MODE is unset (unattended default)', () => {
  const tmpDir = makeTmpDir();
  try {
    setupSpec(
      tmpDir,
      makeDecisionsYml([
        {
          'D-id': 'D-001',
          authorized_values: ['window=60s'],
        },
      ]),
    );

    // No ARCFORGE_MODE set
    const result = runRatify(tmpDir, SPEC_ID, 'D-001', {
      env: {},
    });
    assert.notStrictEqual(result.exitCode, 0, 'Should exit nonzero when unattended');
    const output = result.stdout + result.stderr;
    assert.ok(
      output.toLowerCase().includes('attended') ||
        output.toLowerCase().includes('unattended') ||
        output.toLowerCase().includes('mode') ||
        output.toLowerCase().includes('refus'),
      `Should explain the mode refusal, got: ${output}`,
    );

    // Verify nothing was written
    const after = fs.readFileSync(path.join(tmpDir, 'specs', SPEC_ID, 'decisions.yml'), 'utf8');
    assert.ok(!after.includes('accepted'), 'Should not have written accepted status');
    assert.ok(!after.includes('ratified_by'), 'Should not have written ratified_by');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// KEYSTONE: unattended self-mint refused — wrong mode value
test('ratify refused when ARCFORGE_MODE=unattended', () => {
  const tmpDir = makeTmpDir();
  try {
    setupSpec(tmpDir, makeDecisionsYml([{ 'D-id': 'D-001', authorized_values: ['window=60s'] }]));

    const result = runRatify(tmpDir, SPEC_ID, 'D-001', {
      env: { ARCFORGE_MODE: 'unattended' },
    });
    assert.notStrictEqual(result.exitCode, 0, 'Should exit nonzero when ARCFORGE_MODE=unattended');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Loop sentinel present — refused regardless of mode
test('ratify refused when loop sentinel (.arcforge-loop.json) is present', () => {
  const tmpDir = makeTmpDir();
  try {
    setupSpec(tmpDir, makeDecisionsYml([{ 'D-id': 'D-001', authorized_values: ['window=60s'] }]));

    // Write loop sentinel at project root
    fs.writeFileSync(
      path.join(tmpDir, '.arcforge-loop.json'),
      JSON.stringify({ iteration: 1, running: true }),
    );

    // Even with ARCFORGE_MODE=attended, loop sentinel should block
    const result = runRatify(tmpDir, SPEC_ID, 'D-001', {
      env: { ARCFORGE_MODE: 'attended' },
      input: 'window=60s\nconfirm\n',
    });
    assert.notStrictEqual(result.exitCode, 0, 'Should exit nonzero when loop sentinel present');

    const output = result.stdout + result.stderr;
    assert.ok(
      output.toLowerCase().includes('loop') ||
        output.toLowerCase().includes('sentinel') ||
        output.toLowerCase().includes('refus') ||
        output.toLowerCase().includes('attended'),
      `Should explain the loop refusal, got: ${output}`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Attended + no sentinel: should mint accepted + ratified_by, freeze decision/why
test('attended ratify mints accepted + ratified_by; decision/why byte-identical', () => {
  const tmpDir = makeTmpDir();
  try {
    const originalDecision = 'Use window=60s for rate limiting.';
    const originalWhy = 'Balances security and usability.';

    setupSpec(
      tmpDir,
      makeDecisionsYml([
        {
          'D-id': 'D-001',
          decision: originalDecision,
          why: originalWhy,
          authorized_values: ['window=60s'],
        },
      ]),
    );

    // Simulate human confirming each value then final confirm
    // The ratify command will print each authorized_value and ask confirm/edit.
    // We feed: keep value as-is (empty/enter) for each value, then 'yes' for final confirm.
    const stdin = '\nyes\n';

    const result = runRatify(tmpDir, SPEC_ID, 'D-001', {
      env: { ARCFORGE_MODE: 'attended' },
      input: stdin,
    });

    assert.strictEqual(result.exitCode, 0, `Should succeed; stderr: ${result.stderr}`);

    // Read the resulting decisions.yml
    const after = fs.readFileSync(path.join(tmpDir, 'specs', SPEC_ID, 'decisions.yml'), 'utf8');

    // Must contain accepted status
    assert.ok(after.includes('accepted'), 'Should contain accepted status after ratify');

    // Must contain ratified_by
    assert.ok(after.includes('ratified_by'), 'Should contain ratified_by after ratify');

    // decision and why must be byte-identical (frozen text unchanged)
    assert.ok(after.includes(originalDecision), `decision text must be preserved, got: ${after}`);
    assert.ok(after.includes(originalWhy), `why text must be preserved, got: ${after}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Non-proposed D-id (already accepted) → error
test('ratify errors when D-id is already accepted', () => {
  const tmpDir = makeTmpDir();
  try {
    setupSpec(
      tmpDir,
      makeDecisionsYml([
        {
          'D-id': 'D-001',
          status: 'accepted',
          authorized_values: ['window=60s'],
          ratified_by: 'alice@2026-06-07',
        },
      ]),
    );

    const result = runRatify(tmpDir, SPEC_ID, 'D-001', {
      env: { ARCFORGE_MODE: 'attended' },
    });
    assert.notStrictEqual(result.exitCode, 0, 'Should exit nonzero for already-accepted D-id');
    const output = result.stdout + result.stderr;
    assert.ok(
      output.toLowerCase().includes('proposed') ||
        output.toLowerCase().includes('accept') ||
        output.toLowerCase().includes('status'),
      `Should explain the status issue, got: ${output}`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Missing D-id → error
test('ratify errors when D-id not found in ledger', () => {
  const tmpDir = makeTmpDir();
  try {
    setupSpec(tmpDir, makeDecisionsYml([{ 'D-id': 'D-001', authorized_values: ['window=60s'] }]));

    const result = runRatify(tmpDir, SPEC_ID, 'D-999', {
      env: { ARCFORGE_MODE: 'attended' },
    });
    assert.notStrictEqual(result.exitCode, 0, 'Should exit nonzero for missing D-id');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Missing decisions.yml → error
test('ratify errors when decisions.yml does not exist', () => {
  const tmpDir = makeTmpDir();
  try {
    // Don't create decisions.yml
    fs.mkdirSync(path.join(tmpDir, 'specs', SPEC_ID), { recursive: true });

    const result = runRatify(tmpDir, SPEC_ID, 'D-001', {
      env: { ARCFORGE_MODE: 'attended' },
    });
    assert.notStrictEqual(result.exitCode, 0, 'Should exit nonzero when decisions.yml absent');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
