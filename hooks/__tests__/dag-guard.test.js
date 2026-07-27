/**
 * dag-guard tests (Node --test runner).
 *
 * Surfaces:
 *   decideDagEdit(resultingContent, baselineContent) — pure, no git/fs
 *   evaluate(input)                                   — gate + on-disk baseline
 *
 * The pure cases use synthetic dag.yaml strings. The gate cases use evaluate()
 * against a temp dir (no git repo → HEAD lookup returns null → the pre-edit
 * on-disk content is the baseline).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { evaluate, decideDagEdit } = require('../dag-guard/main');

/** A two-epic dag.yaml where feat-001-01 is completed and feat-001-02 depends on it. */
function baselineDag() {
  return [
    'epics:',
    '  - id: epic-001',
    '    name: Epic One',
    '    status: in_progress',
    '    spec_path: specs/x/spec.xml',
    '    worktree: null',
    '    depends_on: []',
    '    features:',
    '      - id: feat-001-01',
    '        name: F1',
    '        status: completed',
    '        depends_on: []',
    '      - id: feat-001-02',
    '        name: F2',
    '        status: pending',
    '        depends_on: [feat-001-01]',
    '',
  ].join('\n');
}

/** Same dag with feat-001-01 pushed back from completed → pending. */
function unCompletedDag() {
  return baselineDag().replace('        status: completed', '        status: pending');
}

/** Same dag with feat-001-02 dropping its dependency on feat-001-01. */
function droppedDepDag() {
  return baselineDag().replace('        depends_on: [feat-001-01]', '        depends_on: []');
}

/** Same dag with feat-001-02 legally advancing pending → in_progress. */
function legalAdvanceDag() {
  return baselineDag().replace(
    ['      - id: feat-001-02', '        name: F2', '        status: pending'].join('\n'),
    ['      - id: feat-001-02', '        name: F2', '        status: in_progress'].join('\n'),
  );
}

describe('dag-guard decideDagEdit (pure)', () => {
  it('DENIES leaving the completed state (monotonic violation)', () => {
    const reason = decideDagEdit(unCompletedDag(), baselineDag());
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('feat-001-01'), 'names the offending task');
    assert.ok(reason.includes('completed'), 'explains the monotonic invariant');
  });

  it('DENIES dropping a dependency', () => {
    const reason = decideDagEdit(droppedDepDag(), baselineDag());
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('feat-001-02'), 'names the task losing the dep');
    assert.ok(reason.includes('feat-001-01'), 'names the dropped dependency');
  });

  it('ALLOWS a legal forward transition (pending → in_progress)', () => {
    assert.strictEqual(decideDagEdit(legalAdvanceDag(), baselineDag()), null);
  });

  it('ALLOWS an identical write (no change)', () => {
    assert.strictEqual(decideDagEdit(baselineDag(), baselineDag()), null);
  });

  it('fails open on unparseable / non-DAG content', () => {
    assert.strictEqual(decideDagEdit('not: [valid', baselineDag()), null);
    assert.strictEqual(decideDagEdit('', baselineDag()), null);
    assert.strictEqual(decideDagEdit(baselineDag(), null), null);
  });
});

describe('dag-guard evaluate (gate + no-op invariant)', () => {
  let dirs;

  beforeEach(() => {
    dirs = [];
  });
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function tempDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-guard-'));
    dirs.push(d);
    return d;
  }

  it('no-op on a non-dag.yaml path', () => {
    const cwd = tempDir();
    fs.writeFileSync(path.join(cwd, 'other.yaml'), baselineDag());
    assert.strictEqual(
      evaluate({
        tool_name: 'Write',
        tool_input: { file_path: 'other.yaml', content: unCompletedDag() },
        cwd,
      }),
      null,
    );
  });

  it('no-op on a non-Edit/Write tool', () => {
    const cwd = tempDir();
    assert.strictEqual(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'echo hi' }, cwd }),
      null,
    );
    assert.strictEqual(evaluate(null), null);
    assert.strictEqual(evaluate({ tool_name: 'Read', tool_input: {} }), null);
  });

  it('no-op on a brand-new dag.yaml (no baseline on disk)', () => {
    const cwd = tempDir();
    assert.strictEqual(
      evaluate({
        tool_name: 'Write',
        tool_input: { file_path: 'dag.yaml', content: baselineDag() },
        cwd,
      }),
      null,
    );
  });

  it('DENIES a Write that un-completes a task (on-disk baseline)', () => {
    const cwd = tempDir();
    fs.writeFileSync(path.join(cwd, 'dag.yaml'), baselineDag());
    const reason = evaluate({
      tool_name: 'Write',
      tool_input: { file_path: 'dag.yaml', content: unCompletedDag() },
      cwd,
    });
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('feat-001-01'));
  });

  it('DENIES an Edit that drops a dependency (on-disk baseline)', () => {
    const cwd = tempDir();
    fs.writeFileSync(path.join(cwd, 'dag.yaml'), baselineDag());
    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'dag.yaml',
        old_string: '        depends_on: [feat-001-01]',
        new_string: '        depends_on: []',
      },
      cwd,
    });
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('feat-001-02'));
  });

  it('ALLOWS a legal forward Edit (on-disk baseline)', () => {
    const cwd = tempDir();
    fs.writeFileSync(path.join(cwd, 'dag.yaml'), baselineDag());
    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'dag.yaml',
        old_string: ['      - id: feat-001-02', '        name: F2', '        status: pending'].join(
          '\n',
        ),
        new_string: [
          '      - id: feat-001-02',
          '        name: F2',
          '        status: in_progress',
        ].join('\n'),
      },
      cwd,
    });
    assert.strictEqual(reason, null);
  });
});
