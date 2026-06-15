/**
 * WT-4 / WT-5 — arc-finishing-epic skill command sequence, executed VERBATIM
 * with cwd=worktree (not by calling Coordinator methods from base).
 *
 * Why a CLI-subprocess fixture instead of in-process Coordinator calls: the
 * skill instructs the agent to run `finish-epic.js merge` / `cleanup` /
 * `git branch -d` from inside the epic worktree. Calling the coordinator
 * methods directly from a base-cwd Coordinator masks the very seam these
 * tests pin — that cleanup/branch-d must move to the base first, and that the
 * branch delete is the honest `-d`. So this fixture shells out to the real
 * CLI at the exact cwd the skill prescribes.
 *
 * HOME isolation: env.HOME is overridden for every CLI subprocess so canonical
 * worktree paths derive under a temp HOME, never the real ~/.arcforge.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { getWorktreePath, getEpicBranchName } = require('../../scripts/lib/worktree-paths');
const {
  runGit,
  setupRepo,
  readDagFromDisk,
  DEFAULT_SPEC_ID,
} = require('./coordinator-test-helpers');

// The skill invokes `node .../scripts/finish-epic.js <cmd>`; finish-epic.js is a
// thin shim that requires cli.js. Run the shim to exercise the exact entry point.
const FINISH_EPIC = path.resolve(
  __dirname,
  '../../skills/arc-finishing-epic/scripts/finish-epic.js',
);

function run(bin, args, cwd, env = {}) {
  try {
    const stdout = execFileSync(bin, args, {
      cwd,
      env: { ...process.env, HOME: env.HOME, CLAUDE_PROJECT_DIR: cwd, ...env },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
    };
  }
}

describe('arc-finishing-epic Option 1 — verbatim skill sequence (cwd=worktree)', () => {
  const originalHome = process.env.HOME;
  let testHome;
  let root;
  let worktreePath;
  let epicBranch;

  beforeEach(() => {
    const realTmp = fs.realpathSync(os.tmpdir());
    testHome = fs.mkdtempSync(path.join(realTmp, 'fe-home-'));
    // env.HOME covers CLI subprocesses; the os.homedir() spy covers in-process
    // path derivation (Jest sandboxes process.env, so mutating it does not reach
    // os.homedir()). Same dual override as worktree-generic.test.js.
    process.env.HOME = testHome;
    jest.spyOn(os, 'homedir').mockReturnValue(testHome);
    root = fs.realpathSync(setupRepo({ prefix: 'fe-repo-' }));
    // Commit the dag so the epic worktree carries its own local copy.
    runGit(['add', '.'], root);
    runGit(['commit', '-q', '-m', 'chore: add dag'], root);

    // Expand epic-a → real worktree + .arcforge-epic marker, via the CLI so the
    // marker's base_worktree / branch are exactly what production writes.
    const expand = run('node', [FINISH_EPIC, 'expand', '--epic', 'epic-a'], root, {
      HOME: testHome,
    });
    expect(expand.exitCode).toBe(0);

    worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');
    epicBranch = getEpicBranchName(DEFAULT_SPEC_ID, 'epic-a');
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Add a real commit on the epic branch so the merge produces a merge commit
    // and `git branch -d` (which refuses unmerged branches) can succeed.
    fs.writeFileSync(path.join(worktreePath, 'feature.txt'), 'epic-a work\n');
    runGit(['add', 'feature.txt'], worktreePath);
    runGit(['commit', '-q', '-m', 'feat: epic-a feature'], worktreePath);
  });

  afterEach(() => {
    if (fs.existsSync(worktreePath)) fs.rmSync(worktreePath, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(testHome, { recursive: true, force: true });
    process.env.HOME = originalHome;
    jest.restoreAllMocks();
  });

  test('merge (worktree cwd) → cd base → cleanup → branch -d, honest delete succeeds', () => {
    // 1. Capture identifiers from the marker while still in the worktree
    //    (mirrors EPIC_BRANCH / BASE_WORKTREE in the skill's Option 1).
    const marker = fs.readFileSync(path.join(worktreePath, '.arcforge-epic'), 'utf8');
    const baseFromMarker = marker.match(/^base_worktree:\s*(.+)$/m)[1].trim();
    expect(baseFromMarker).toBe(root);
    const branchInWorktree = runGit(['branch', '--show-current'], worktreePath).trim();
    expect(branchInWorktree).toBe(epicBranch);

    // 2. Merge from the WORKTREE cwd (the skill runs it here; coordinator
    //    delegates to base internally).
    const merge = run('node', [FINISH_EPIC, 'merge'], worktreePath, { HOME: testHome });
    expect(merge.exitCode).toBe(0);

    // 3. Cleanup from the BASE cwd (after cd "$BASE_WORKTREE").
    const cleanup = run('node', [FINISH_EPIC, 'cleanup', '--json'], baseFromMarker, {
      HOME: testHome,
    });
    expect(cleanup.exitCode).toBe(0);
    const cleanupJson = JSON.parse(cleanup.stdout);
    expect(cleanupJson.removed).toBe(1);
    expect(fs.existsSync(worktreePath)).toBe(false);

    // 4. Honest branch delete from the BASE cwd — `-d` succeeds because the
    //    branch was actually merged.
    const del = run('git', ['branch', '-d', epicBranch], baseFromMarker, { HOME: testHome });
    expect(del.exitCode).toBe(0);

    // Final state: epic completed in base dag, worktree gone, branch gone.
    const dag = readDagFromDisk(root);
    expect(dag.epics.find((e) => e.id === 'epic-a').status).toBe('completed');
    expect(dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();
    const branches = runGit(['branch', '--list', epicBranch], root).trim();
    expect(branches).toBe('');
  });

  test('the skill order (merge in worktree, cleanup from base) removes exactly one worktree', () => {
    // Anchors that the verbatim sequence the skill prescribes — merge from the
    // worktree, cd to base, then cleanup — is the correct, working order.
    const merge = run('node', [FINISH_EPIC, 'merge'], worktreePath, { HOME: testHome });
    expect(merge.exitCode).toBe(0);
    const cleanup = run('node', [FINISH_EPIC, 'cleanup', '--json'], root, { HOME: testHome });
    const json = JSON.parse(cleanup.stdout);
    expect(json.removed).toBe(1);
  });
});
