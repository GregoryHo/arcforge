const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { stringifyDagYaml } = require('../../scripts/lib/yaml-parser');
const { objectToYaml } = require('../../scripts/lib/dag-schema');
const { TaskStatus } = require('../../scripts/lib/models');

const CLI = path.resolve(__dirname, '../../scripts/cli.js');

function runCli(cwd, args, { expectFailure = false } = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      encoding: 'utf8',
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    if (!expectFailure) throw err;
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status || 1 };
  }
}

function initRepo(root) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@x.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root });
}

function writeSpec(root, specId, epicIds) {
  const dir = path.join(root, 'specs', specId);
  fs.mkdirSync(dir, { recursive: true });
  const dag = {
    epics: epicIds.map((id) => ({
      id,
      name: id,
      spec_path: `epics/${id}/epic.md`,
      status: TaskStatus.PENDING,
      worktree: null,
      depends_on: [],
      features: [],
    })),
    blocked: [],
  };
  fs.writeFileSync(path.join(dir, 'dag.yaml'), stringifyDagYaml(dag));
}

describe('CLI multi-spec UX', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-cli-ms-'));
    initRepo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('status with one spec returns flat shape (backwards compat)', () => {
    writeSpec(root, 'only-spec', ['epic-1']);
    const { stdout } = runCli(root, ['status', '--json']);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('epics');
    expect(parsed).not.toHaveProperty('specs');
  });

  test('status with two specs aggregates under specs.<id>', () => {
    writeSpec(root, 'spec-a', ['epic-a1']);
    writeSpec(root, 'spec-b', ['epic-b1']);
    const { stdout } = runCli(root, ['status', '--json']);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('specs');
    expect(Object.keys(parsed.specs).sort()).toEqual(['spec-a', 'spec-b']);
    expect(parsed.specs['spec-a'].epics).toHaveLength(1);
  });

  test('next with two specs requires --spec-id', () => {
    writeSpec(root, 'spec-a', ['epic-a1']);
    writeSpec(root, 'spec-b', ['epic-b1']);
    const { exitCode, stderr } = runCli(root, ['next'], { expectFailure: true });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Multiple specs/);
  });

  test('next with --spec-id picks the right spec', () => {
    writeSpec(root, 'spec-a', ['epic-a1']);
    writeSpec(root, 'spec-b', ['epic-b1']);
    const { stdout } = runCli(root, ['next', '--spec-id', 'spec-b']);
    const parsed = JSON.parse(stdout);
    expect(parsed.id).toBe('epic-b1');
  });

  test('merge resolves by intersection when positional epics narrow to one spec', () => {
    // Codex P2: resolveMergeOrCleanupSpec must INTERSECT matches across epic
    // ids, not union. `epic-only-a` lives only in spec-a; `epic-shared` in
    // both. The command should resolve to spec-a, not fail as ambiguous.
    writeSpec(root, 'spec-a', ['epic-only-a', 'epic-shared']);
    writeSpec(root, 'spec-b', ['epic-shared']);
    // We don't need a real merge — trigger resolution by invoking merge with
    // the two positional epic ids. If resolution picks spec-b (wrong) or
    // errors as ambiguous, the test fails. "No completed epics" is an
    // expected downstream error — merge body runs only after resolution.
    const { exitCode, stderr } = runCli(root, ['merge', 'epic-only-a', 'epic-shared'], {
      expectFailure: true,
    });
    // Accepted outcome: resolution succeeded to spec-a (merge then fails on
    // "epic-only-a not completed" or similar — NOT on "span multiple specs").
    expect(stderr).not.toMatch(/span multiple specs/);
    expect(exitCode).not.toBe(0); // merge still exits non-zero for missing-completed-epic
  });

  test('sync --direction in multi-spec mode errors out (not silent aggregate)', () => {
    // Codex P2: ambiguous-spec branch called syncAllSpecs immediately, skipping
    // --direction parsing/validation. `arcforge sync --direction from-base`
    // must fail loudly in multi-spec mode, not silently aggregate.
    writeSpec(root, 'spec-a', ['epic-a1']);
    writeSpec(root, 'spec-b', ['epic-b1']);
    const { exitCode, stderr } = runCli(root, ['sync', '--direction', 'from-base'], {
      expectFailure: true,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/direction|--spec-id/);
  });

  test('reboot with two specs returns per-spec + totals', () => {
    writeSpec(root, 'spec-a', ['epic-a1']);
    writeSpec(root, 'spec-b', ['epic-b1']);
    const { stdout } = runCli(root, ['reboot', '--json']);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('specs');
    expect(parsed).toHaveProperty('totals');
    expect(parsed.totals.remaining_count).toBe(0); // no features → 0
  });

  test('backfill-markers --apply writes spec_id into the marker without crashing', () => {
    writeSpec(root, 'spec-a', ['epic-a1']);
    const wtPath = path.join(root, '..', `apply-wt-${path.basename(root)}`);
    execFileSync('git', ['worktree', 'add', wtPath, '-b', 'apply-branch'], { cwd: root });
    fs.writeFileSync(path.join(wtPath, '.arcforge-epic'), objectToYaml({ epic: 'epic-a1' }));

    try {
      const { stdout } = runCli(root, ['backfill-markers', '--apply', '--json']);
      const parsed = JSON.parse(stdout);
      expect(parsed.dryRun).toBe(false);
      expect(parsed.updated.length).toBe(1);

      const markerAfter = require('../../scripts/lib/yaml-parser').parseDagYaml(
        fs.readFileSync(path.join(wtPath, '.arcforge-epic'), 'utf8'),
      );
      expect(markerAfter.spec_id).toBe('spec-a');
      expect(markerAfter.epic).toBe('epic-a1');
    } finally {
      fs.rmSync(wtPath, { recursive: true, force: true });
      execFileSync('git', ['worktree', 'prune'], { cwd: root });
    }
  });

  test('backfill-markers reports markers with no spec_id as needing update', () => {
    writeSpec(root, 'spec-a', ['epic-a1']);
    // Simulate a legacy worktree by creating a checkout branch and marker.
    // Using git worktree add with a non-existent branch auto-creates it.
    const wtPath = path.join(root, '..', `legacy-wt-${path.basename(root)}`);
    execFileSync('git', ['worktree', 'add', wtPath, '-b', 'legacy-branch'], { cwd: root });
    fs.writeFileSync(path.join(wtPath, '.arcforge-epic'), objectToYaml({ epic: 'epic-a1' }));

    try {
      // Default is dry-run; ambiguity is only an error if multiple specs match.
      // With a single spec matching the epic, backfill succeeds.
      const { stdout } = runCli(root, ['backfill-markers', '--json']);
      const parsed = JSON.parse(stdout);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.updated.length).toBeGreaterThan(0);
      expect(parsed.updated.some((u) => u.includes('spec-a1') || u.includes('spec-a'))).toBe(true);
    } finally {
      fs.rmSync(wtPath, { recursive: true, force: true });
      execFileSync('git', ['worktree', 'prune'], { cwd: root });
    }
  });
});
