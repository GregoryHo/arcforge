#!/usr/bin/env node
/**
 * tests/node/test-sdd-gate-cli.js — Integration tests for "arcforge sdd-gate <stage>"
 *
 * SDD-6 acceptance criteria (capability-seam-fix plan):
 * - Each stage CLI fixture check: stable JSON + exit 0 (pass) / 1 (block) / 2 (usage).
 * - unauthorized → exit 1 + marker axis_fired:'3'; authorize ratified/clean → exit 0, no marker.
 * - [S3-2] sdd-v2 fixture's delta refs appear in the header-stage gate JSON output.
 * - draft read from stdin (zero filesystem state on block) + --draft fallback.
 * - dag/design/context/conflict stage behaviors.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');
const V2_SPEC_XML = path.resolve(
  __dirname,
  '../integration/sdd-v2-pipeline/fixture/specs/demo-spec/spec.xml',
);

console.log('Testing arcforge sdd-gate CLI...\n');

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

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-sddgate-test-'));
}

/** Run sdd-gate with optional stdin. Returns { stdout, stderr, exitCode, json }. */
function runGate(tmpDir, args, { input } = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: tmpDir };
  const opts = { encoding: 'utf8', env, cwd: tmpDir };
  if (input !== undefined) opts.input = input;
  let result;
  try {
    const stdout = execFileSync('node', [CLI_PATH, 'sdd-gate', ...args], opts);
    result = { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    result = { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status || 1 };
  }
  try {
    result.json = JSON.parse(result.stdout);
  } catch {
    result.json = null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Usage / dispatch
// ---------------------------------------------------------------------------

test('no stage → usage error exit 2', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, []);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.stderr, /Usage: arcforge sdd-gate/);
  fs.rmSync(tmp, { recursive: true });
});

test('unknown stage → usage error exit 2', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['bogus', '--spec-id', 'x']);
  assert.strictEqual(r.exitCode, 2);
  fs.rmSync(tmp, { recursive: true });
});

test('stage requiring spec-id without --spec-id → exit 2', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['dag']);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.stderr, /requires --spec-id/);
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// dag stage
// ---------------------------------------------------------------------------

test('dag: no dag.yaml → pass exit 0', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['dag', '--spec-id', 'demo']);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.stage, 'dag');
  assert.strictEqual(r.json.status, 'pass');
  assert.strictEqual(r.json.dag, null);
  fs.rmSync(tmp, { recursive: true });
});

test('dag: all epics completed → pass exit 0', () => {
  const tmp = makeTmpDir();
  fs.mkdirSync(path.join(tmp, 'specs/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'specs/demo/dag.yaml'),
    'epics:\n  - id: e1\n    status: completed\n',
  );
  const r = runGate(tmp, ['dag', '--spec-id', 'demo']);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.status, 'pass');
  fs.rmSync(tmp, { recursive: true });
});

test('dag: incomplete epic → block exit 1 with incompleteEpics', () => {
  const tmp = makeTmpDir();
  fs.mkdirSync(path.join(tmp, 'specs/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'specs/demo/dag.yaml'),
    'epics:\n  - id: e1\n    status: completed\n  - id: e2\n    status: pending\n',
  );
  const r = runGate(tmp, ['dag', '--spec-id', 'demo']);
  assert.strictEqual(r.exitCode, 1);
  assert.strictEqual(r.json.status, 'block');
  assert.strictEqual(r.json.dag.incomplete, 1);
  assert.strictEqual(r.json.dag.incompleteEpics[0].id, 'e2');
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// design stage
// ---------------------------------------------------------------------------

test('design: missing file → block exit 1', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['design', '--design', 'docs/plans/x/none/design.md']);
  assert.strictEqual(r.exitCode, 1);
  assert.strictEqual(r.json.stage, 'design');
  assert.strictEqual(r.json.status, 'block');
  assert.ok(r.json.issues.some((i) => i.level === 'ERROR'));
  fs.rmSync(tmp, { recursive: true });
});

test('design: without --design → usage error exit 2', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['design']);
  assert.strictEqual(r.exitCode, 2);
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// context stage
// ---------------------------------------------------------------------------

test('context: no vision/ledger/spec → pass (no-op) exit 0', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['context', '--spec-id', 'demo']);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.stage, 'context');
  assert.strictEqual(r.json.status, 'pass');
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// header stage — [S3-2] delta refs in JSON
// ---------------------------------------------------------------------------

test('header: stdin draft emits parsed header with spec_id + spec_version', () => {
  const tmp = makeTmpDir();
  const xml = fs.readFileSync(V2_SPEC_XML, 'utf8');
  const r = runGate(tmp, ['header', '--spec-id', 'demo-spec'], { input: xml });
  assert.strictEqual(r.json.stage, 'header');
  assert.ok(r.json.header, 'header projection present');
  assert.strictEqual(r.json.header.spec_id, 'demo-spec');
  assert.strictEqual(r.json.header.spec_version, 1);
  fs.rmSync(tmp, { recursive: true });
});

test('[S3-2] header: sdd-v2 fixture delta refs appear in gate JSON output', () => {
  const tmp = makeTmpDir();
  const xml = fs.readFileSync(V2_SPEC_XML, 'utf8');
  const r = runGate(tmp, ['header', '--spec-id', 'demo-spec'], { input: xml });
  const delta = r.json.header.latest_delta;
  assert.ok(delta, 'latest_delta present');
  assert.strictEqual(delta.version, '1');
  assert.strictEqual(delta.iteration, '2026-04-17');
  const addedRefs = delta.added.map((a) => a.ref);
  // The fixture's delta lists six <added> refs — all must surface in JSON.
  for (const ref of [
    'fr-parser-001',
    'fr-parser-002',
    'fr-formatter-001',
    'fr-formatter-002',
    'fr-integration-001',
    'fr-integration-002',
  ]) {
    assert.ok(addedRefs.includes(ref), `delta ref ${ref} present in JSON output`);
  }
  assert.ok(Array.isArray(delta.modified));
  assert.ok(Array.isArray(delta.removed));
  assert.ok(Array.isArray(delta.renamed));
  fs.rmSync(tmp, { recursive: true });
});

test('header: --draft fallback reads from disk', () => {
  const tmp = makeTmpDir();
  const draftPath = path.join(tmp, 'draft.xml');
  fs.copyFileSync(V2_SPEC_XML, draftPath);
  const r = runGate(tmp, ['header', '--spec-id', 'demo-spec', '--draft', draftPath]);
  assert.strictEqual(r.json.header.spec_id, 'demo-spec');
  assert.strictEqual(r.json.header.latest_delta.added.length, 6);
  fs.rmSync(tmp, { recursive: true });
});

test('header: valid header + existing design_path → pass exit 0', () => {
  const tmp = makeTmpDir();
  fs.mkdirSync(path.join(tmp, 'docs/plans/hp/2026-06-15'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs/plans/hp/2026-06-15/design.md'), 'design');
  const xml =
    '<spec><overview>' +
    '<spec_id>hp</spec_id><spec_version>1</spec_version><status>active</status>' +
    '<title>HP</title><description>d</description>' +
    '<source><design_path>docs/plans/hp/2026-06-15/design.md</design_path>' +
    '<design_iteration>2026-06-15</design_iteration></source>' +
    '<scope><includes><feature id="f1">a</feature></includes>' +
    '<excludes><reason>none</reason></excludes></scope>' +
    '</overview></spec>';
  const r = runGate(tmp, ['header', '--spec-id', 'hp'], { input: xml });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.status, 'pass');
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// authorize stage — unauthorized → exit 1 + axis_fired:'3' + marker write
// ---------------------------------------------------------------------------

test('authorize: unauthorized trace → exit 1 + axis_fired:3 + writes _pending-conflict.md', () => {
  const tmp = makeTmpDir();
  fs.mkdirSync(path.join(tmp, 'docs/plans/demo/2026-06-15'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs/plans/demo/2026-06-15/design.md'), '# Design\n');
  // Realistic combined draft: overview + the trace-bearing requirements inline,
  // exactly the single XML stream the refiner holds in memory before the
  // two-pass write splits it into spec.xml + details/*.xml. The traces do NOT
  // live in <overview> — they live alongside requirements — so authorize must
  // receive this combined stream, not the overview-only spec.xml.
  const draft =
    '<spec><overview><spec_id>demo</spec_id></overview>' +
    '<requirement id="fr-x-001"><criterion id="ac1">MUST X' +
    '<trace>D-999:60s</trace></criterion></requirement></spec>';
  const r = runGate(
    tmp,
    ['authorize', '--spec-id', 'demo', '--design', 'docs/plans/demo/2026-06-15/design.md'],
    { input: draft },
  );
  assert.strictEqual(r.exitCode, 1);
  assert.strictEqual(r.json.stage, 'authorize');
  assert.strictEqual(r.json.status, 'block');
  assert.strictEqual(r.json.axis_fired, '3');
  assert.strictEqual(r.json.unauthorized_traces[0].trace_value, 'D-999:60s');
  const markerPath = path.join(tmp, 'specs/demo/_pending-conflict.md');
  assert.ok(fs.existsSync(markerPath), '_pending-conflict.md written on block');
  const marker = fs.readFileSync(markerPath, 'utf8');
  assert.match(marker, /axis_fired: 3/);
  assert.match(marker, /candidate_resolutions:/);
  fs.rmSync(tmp, { recursive: true });
});

test('authorize: clean combined draft (authorized trace) → pass exit 0, no marker written', () => {
  const tmp = makeTmpDir();
  fs.mkdirSync(path.join(tmp, 'docs/plans/demo/2026-06-15'), { recursive: true });
  // Design content contains the cited section so the design-trace is authorized.
  fs.writeFileSync(
    path.join(tmp, 'docs/plans/demo/2026-06-15/design.md'),
    '# Design\n\n## Architecture\nThe parser handles ints.\n',
  );
  const draft =
    '<spec><overview><spec_id>demo</spec_id></overview>' +
    '<requirement id="fr-x-001"><criterion id="ac1">MUST parse ints' +
    '<trace>2026-06-15:Architecture</trace></criterion></requirement></spec>';
  const r = runGate(
    tmp,
    ['authorize', '--spec-id', 'demo', '--design', 'docs/plans/demo/2026-06-15/design.md'],
    { input: draft },
  );
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.status, 'pass');
  assert.ok(
    !fs.existsSync(path.join(tmp, 'specs/demo/_pending-conflict.md')),
    'no marker written on pass',
  );
  fs.rmSync(tmp, { recursive: true });
});

test('authorize: contract — traces live with requirements, NOT in <overview>', () => {
  // Pins the input contract: authorize must receive the combined trace-bearing
  // draft. An overview-only stream (the on-disk SDD v2 spec.xml shape, whose
  // requirements/traces live in details/*.xml) carries zero traces, so the
  // mechanical check has nothing to flag and passes vacuously. This is by
  // design — the caller (refiner Phase 6b) is responsible for piping the
  // combined in-memory draft, not the overview-only spec.xml.
  const tmp = makeTmpDir();
  fs.mkdirSync(path.join(tmp, 'docs/plans/demo/2026-06-15'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs/plans/demo/2026-06-15/design.md'), '# Design\n');
  const overviewOnly =
    '<spec><overview><spec_id>demo</spec_id></overview>' +
    '<details><detail_file path="details/core.xml" /></details></spec>';
  const r = runGate(
    tmp,
    ['authorize', '--spec-id', 'demo', '--design', 'docs/plans/demo/2026-06-15/design.md'],
    { input: overviewOnly },
  );
  // No inline traces → vacuous pass. Documented contract, not a bug.
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.status, 'pass');
  fs.rmSync(tmp, { recursive: true });
});

test('authorize: without --design → usage error exit 2', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['authorize', '--spec-id', 'demo'], { input: '<spec/>' });
  assert.strictEqual(r.exitCode, 2);
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// conflict stage — explicit marker write from JSON payload on stdin
// ---------------------------------------------------------------------------

test('conflict: valid payload → writes marker, pass exit 0', () => {
  const tmp = makeTmpDir();
  const payload = JSON.stringify({
    axis_fired: '1',
    conflict_description: 'REQ-A vs REQ-B',
    candidate_resolutions: ['(a) keep A', '(b) keep B'],
    user_action_prompt: 'iterate demo',
  });
  const r = runGate(tmp, ['conflict', '--spec-id', 'demo'], { input: payload });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.json.stage, 'conflict');
  assert.strictEqual(r.json.status, 'pass');
  const markerPath = path.join(tmp, 'specs/demo/_pending-conflict.md');
  assert.ok(fs.existsSync(markerPath));
  assert.match(fs.readFileSync(markerPath, 'utf8'), /axis_fired: 1/);
  fs.rmSync(tmp, { recursive: true });
});

test('conflict: malformed JSON payload → usage error exit 2', () => {
  const tmp = makeTmpDir();
  const r = runGate(tmp, ['conflict', '--spec-id', 'demo'], { input: 'not json{' });
  assert.strictEqual(r.exitCode, 2);
  fs.rmSync(tmp, { recursive: true });
});

test('conflict: missing required field → stable JSON + usage error exit 2', () => {
  const tmp = makeTmpDir();
  const payload = JSON.stringify({ axis_fired: '1' });
  const r = runGate(tmp, ['conflict', '--spec-id', 'demo'], { input: payload });
  assert.strictEqual(r.exitCode, 2);
  assert.ok(r.json, 'emits stable JSON (not plain-text stderr)');
  assert.strictEqual(r.json.stage, 'conflict');
  assert.strictEqual(r.json.status, 'error');
  fs.rmSync(tmp, { recursive: true });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
