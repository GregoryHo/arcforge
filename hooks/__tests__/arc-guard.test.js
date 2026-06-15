const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// A cwd that carries an `.arcforge-epic` marker (i.e. an epic worktree).
function makeWorktree(specId = 'demo-spec') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-guard-wt-'));
  fs.writeFileSync(path.join(dir, '.arcforge-epic'), `spec_id: ${specId}\nepic: epic-001\n`);
  return dir;
}

// A cwd with no marker (a base session / ordinary project).
function makeBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arc-guard-base-'));
}

describe('arc-guard evaluate', () => {
  let dirs;

  beforeEach(() => {
    dirs = [];
    delete require.cache[require.resolve('../arc-guard/main')];
    delete require.cache[require.resolve('../../scripts/lib/marker')];
  });

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function wt(specId) {
    const d = makeWorktree(specId);
    dirs.push(d);
    return d;
  }
  function base() {
    const d = makeBase();
    dirs.push(d);
    return d;
  }

  it('no-op invariant: no marker in cwd → never denies, even for git merge', () => {
    const { evaluate } = require('../arc-guard/main');
    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'git merge main' },
      cwd: base(),
    });
    assert.strictEqual(reason, null);
  });

  it('ignores non-Bash tools entirely', () => {
    const { evaluate } = require('../arc-guard/main');
    assert.strictEqual(
      evaluate({ tool_name: 'Edit', tool_input: { file_path: '/x' }, cwd: wt() }),
      null,
    );
  });

  it('blocks raw `git merge` inside a worktree and points to the coordinator', () => {
    const { evaluate } = require('../arc-guard/main');
    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'git merge main' },
      cwd: wt('my-spec'),
    });
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('finish-epic.js'), 'should redirect to the coordinator flow');
    assert.ok(reason.includes('my-spec'), 'should name the spec from the marker');
  });

  it('does NOT block `git merge-base` (false-positive guard)', () => {
    const { evaluate } = require('../arc-guard/main');
    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'git merge-base HEAD origin/main' },
      cwd: wt(),
    });
    assert.strictEqual(reason, null);
  });

  it('does NOT block `git log --merges` (false-positive guard)', () => {
    const { evaluate } = require('../arc-guard/main');
    const reason = evaluate({
      tool_name: 'Bash',
      tool_input: { command: 'git log --merges --oneline' },
      cwd: wt(),
    });
    assert.strictEqual(reason, null);
  });

  it('does NOT block merge conflict-recovery (--abort/--continue/--quit)', () => {
    const { evaluate } = require('../arc-guard/main');
    for (const cmd of ['git merge --abort', 'git merge --continue', 'git merge --quit']) {
      assert.strictEqual(
        evaluate({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: wt() }),
        null,
        `should allow recovery: ${cmd}`,
      );
    }
  });

  // WT-5: arc-finishing-epic's conflict recovery now runs `finish-epic.js merge
  // --abort`, which the coordinator executes against the BASE worktree via
  // `git -C <base> merge --abort` (execFileSync, not the Bash tool — so it never
  // reaches this hook in production). These two cases pin the regex so that even
  // if such a command were typed into the Bash tool from a worktree, the `-C
  // <path>` form of conflict-recovery is NOT matched (the --abort/--continue
  // lookahead still applies through the `-C` operand).
  it('does NOT block `git -C <base> merge --abort` (WT-5 conflict recovery)', () => {
    const { GIT_MERGE_RE } = require('../arc-guard/main');
    assert.strictEqual(
      GIT_MERGE_RE.test('git -C /home/u/.arcforge/worktrees/proj-abc-base merge --abort'),
      false,
      'the -C form of conflict-recovery must not match GIT_MERGE_RE',
    );
    const { evaluate } = require('../arc-guard/main');
    assert.strictEqual(
      evaluate({
        tool_name: 'Bash',
        tool_input: { command: 'git -C /home/u/.arcforge/worktrees/proj-abc-base merge --abort' },
        cwd: wt(),
      }),
      null,
      'should allow `git -C <base> merge --abort` from a worktree',
    );
  });

  it('does NOT block `git -C <base> merge --continue` (WT-5 conflict recovery)', () => {
    const { GIT_MERGE_RE } = require('../arc-guard/main');
    assert.strictEqual(
      GIT_MERGE_RE.test('git -C /home/u/.arcforge/worktrees/proj-abc-base merge --continue'),
      false,
      'the -C form of --continue must not match GIT_MERGE_RE',
    );
    const { evaluate } = require('../arc-guard/main');
    assert.strictEqual(
      evaluate({
        tool_name: 'Bash',
        tool_input: {
          command: 'git -C /home/u/.arcforge/worktrees/proj-abc-base merge --continue',
        },
        cwd: wt(),
      }),
      null,
      'should allow `git -C <base> merge --continue` from a worktree',
    );
  });

  it('still blocks a real merge with flags (`git merge --no-ff main`)', () => {
    const { evaluate } = require('../arc-guard/main');
    assert.ok(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'git merge --no-ff main' }, cwd: wt() }),
    );
  });

  it('does NOT block reading/diffing a file named loop.js', () => {
    const { evaluate } = require('../arc-guard/main');
    for (const cmd of ['cat scripts/lib/loop.js', 'git diff scripts/lib/loop.js']) {
      assert.strictEqual(
        evaluate({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: wt() }),
        null,
        `should allow file access: ${cmd}`,
      );
    }
  });

  it('blocks starting an arcforge loop inside a worktree', () => {
    const { evaluate } = require('../arc-guard/main');
    for (const cmd of [
      'node scripts/cli.js loop --spec my-spec',
      'node scripts/loop.js --pattern dag',
      'arcforge loop --max-runs 20',
    ]) {
      const reason = evaluate({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: wt() });
      assert.ok(reason, `should deny: ${cmd}`);
      assert.ok(reason.includes('loop'), 'should mention loops');
      assert.ok(reason.includes('base'), 'should steer to the base session');
    }
  });

  it('does NOT block running a project file that ends in loop.js (FP guard)', () => {
    const { evaluate } = require('../arc-guard/main');
    // Inside an epic worktree the agent runs the USER's own project code — a
    // game/event/render loop named *loop.js must not be mistaken for arcforge's loop.
    for (const cmd of [
      'node game-loop.js',
      'node src/event-loop.js',
      'node render-loop.js --watch',
    ]) {
      assert.strictEqual(
        evaluate({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: wt() }),
        null,
        `should allow project loop file: ${cmd}`,
      );
    }
  });

  it('allows benign commands inside a worktree', () => {
    const { evaluate } = require('../arc-guard/main');
    assert.strictEqual(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: wt() }),
      null,
    );
    assert.strictEqual(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: wt() }),
      null,
    );
  });

  it('handles malformed input without throwing', () => {
    const { evaluate } = require('../arc-guard/main');
    assert.strictEqual(evaluate(null), null);
    assert.strictEqual(evaluate({ tool_name: 'Bash' }), null);
    assert.strictEqual(evaluate({ tool_name: 'Bash', tool_input: {} }), null);
  });
});

// Exercises main()'s actual wire format end-to-end (subprocess + stdin → stdout).
// This is the one thing evaluate() unit tests can't cover: that the hook emits the
// PreToolUse deny JSON the engine acts on. Live blocking can't be tested here (the
// plugin is disabled in this repo), so this is the closest proxy.
describe('arc-guard main() wire format', () => {
  const { execFileSync } = require('node:child_process');
  const hookPath = require.resolve('../arc-guard/main');
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

  it('emits permissionDecision:deny JSON for a blocked command', () => {
    const cwd = makeWorktree('e2e-spec');
    dirs.push(cwd);
    const out = run({ tool_name: 'Bash', tool_input: { command: 'git merge main' }, cwd });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(parsed.hookSpecificOutput.permissionDecisionReason.includes('finish-epic.js'));
  });

  it('emits nothing (allows) when there is no marker', () => {
    const cwd = makeBase();
    dirs.push(cwd);
    const out = run({ tool_name: 'Bash', tool_input: { command: 'git merge main' }, cwd });
    assert.strictEqual(out, '');
  });
});

// A cwd with a locked research-config.md plus the files it references.
function makeResearch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-guard-res-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'evals'));
  fs.writeFileSync(path.join(dir, 'src', 'protected.js'), '// protected');
  fs.writeFileSync(path.join(dir, 'src', 'allowed.js'), '// allowed');
  fs.writeFileSync(path.join(dir, 'evals', 'bench.json'), '{}');
  fs.writeFileSync(
    path.join(dir, 'research-config.md'),
    '# Research Config\n\n## Scope\nCAN modify: src/allowed.js\n' +
      'CANNOT modify: src/protected.js, evals/, nonexistent-prose-token\n',
  );
  return dir;
}

describe('arc-guard research-config blocks (Edit/Write)', () => {
  let dirs;
  beforeEach(() => {
    dirs = [];
    delete require.cache[require.resolve('../arc-guard/main')];
  });
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  function research() {
    const d = makeResearch();
    dirs.push(d);
    return d;
  }

  it('no-op when there is no research-config.md', () => {
    const { evaluate } = require('../arc-guard/main');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-guard-plain-'));
    dirs.push(cwd);
    assert.strictEqual(
      evaluate({ tool_name: 'Edit', tool_input: { file_path: path.join(cwd, 'any.js') }, cwd }),
      null,
    );
  });

  it('no-op when research-config.md is not an arc-researching contract (FP guard)', () => {
    const { evaluate } = require('../arc-guard/main');
    // A research/ML repo can legitimately have a root research-config.md for
    // unrelated reasons — without the contract's title/scope markers it must not fence.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-guard-foreign-'));
    dirs.push(cwd);
    fs.writeFileSync(
      path.join(cwd, 'research-config.md'),
      '# Hyperparameters\n\nlearning_rate: 0.001\nbatch_size: 64\nepochs: 100\n',
    );
    assert.strictEqual(
      evaluate({
        tool_name: 'Edit',
        tool_input: { file_path: path.join(cwd, 'research-config.md') },
        cwd,
      }),
      null,
      'should not block editing a foreign research-config.md',
    );
  });

  it('blocks editing the locked research-config.md itself', () => {
    const { evaluate } = require('../arc-guard/main');
    const cwd = research();
    const reason = evaluate({
      tool_name: 'Edit',
      tool_input: { file_path: path.join(cwd, 'research-config.md') },
      cwd,
    });
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('locked'), 'should name it as the locked contract');
    assert.ok(reason.includes('disable'), 'should name the sanctioned escape');
  });

  it('blocks editing an exact CANNOT-modify file', () => {
    const { evaluate } = require('../arc-guard/main');
    const cwd = research();
    const reason = evaluate({
      tool_name: 'Write',
      tool_input: { file_path: path.join(cwd, 'src', 'protected.js') },
      cwd,
    });
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('CANNOT-modify') || reason.includes('scope'));
  });

  it('blocks editing a file under a CANNOT-modify directory', () => {
    const { evaluate } = require('../arc-guard/main');
    const cwd = research();
    assert.ok(
      evaluate({
        tool_name: 'Edit',
        tool_input: { file_path: path.join(cwd, 'evals', 'bench.json') },
        cwd,
      }),
    );
  });

  it('allows editing a file inside the CAN-modify scope', () => {
    const { evaluate } = require('../arc-guard/main');
    const cwd = research();
    assert.strictEqual(
      evaluate({
        tool_name: 'Edit',
        tool_input: { file_path: path.join(cwd, 'src', 'allowed.js') },
        cwd,
      }),
      null,
    );
  });

  it('parseCannotPaths keeps only existing paths, skipping prose tokens', () => {
    const { parseCannotPaths } = require('../arc-guard/main');
    const cwd = research();
    const text = fs.readFileSync(path.join(cwd, 'research-config.md'), 'utf8');
    const entries = parseCannotPaths(text, cwd);
    assert.ok(entries.includes(path.join(cwd, 'src', 'protected.js')));
    assert.ok(entries.includes(path.join(cwd, 'evals')));
    assert.ok(
      !entries.some((e) => e.includes('nonexistent-prose-token')),
      'should skip a non-existent prose token',
    );
  });
});
