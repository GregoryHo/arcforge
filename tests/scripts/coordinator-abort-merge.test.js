/**
 * Coordinator.abortMerge — conflict recovery in the BASE checkout (WT-5).
 *
 * When an epic merge conflicts, the half-merged state lives in the BASE
 * worktree (mergeEpics checks the base branch out there before merging). The
 * agent that hit the conflict is in the epic worktree, so abortMerge must find
 * the base worktree (same delegation as mergeEpics) and run `git merge --abort`
 * THERE — leaving the base clean — even when invoked from the worktree cwd.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { getWorktreePath } = require('../../scripts/lib/worktree-paths');
const {
  runGit,
  setupRepo,
  cleanupWorktrees,
  DEFAULT_SPEC_ID,
} = require('./coordinator-test-helpers');

const FINISH_EPIC = path.resolve(
  __dirname,
  '../../skills/arc-finishing-epic/scripts/finish-epic.js',
);

function runCli(args, cwd, home) {
  try {
    const stdout = execFileSync('node', [FINISH_EPIC, ...args], {
      cwd,
      env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: cwd },
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

// True when the working tree at `dir` has an in-progress merge (MERGE_HEAD).
function hasMergeInProgress(dir) {
  const gitDir = runGit(['rev-parse', '--git-dir'], dir).trim();
  return fs.existsSync(path.join(dir, gitDir, 'MERGE_HEAD'));
}

describe('Coordinator.abortMerge — base-checkout conflict recovery', () => {
  const originalHome = process.env.HOME;
  let testHome;
  let root;
  let worktreePath;

  beforeEach(() => {
    const realTmp = fs.realpathSync(os.tmpdir());
    testHome = fs.mkdtempSync(path.join(realTmp, 'abort-home-'));
    process.env.HOME = testHome;
    jest.spyOn(os, 'homedir').mockReturnValue(testHome);
    root = fs.realpathSync(setupRepo({ prefix: 'abort-repo-' }));
    runGit(['add', '.'], root);
    runGit(['commit', '-q', '-m', 'chore: add dag'], root);

    // Expand epic-a to a real worktree + marker.
    new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
    worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');

    // Create a guaranteed conflict on shared.txt: epic edits it one way…
    fs.writeFileSync(path.join(worktreePath, 'shared.txt'), 'epic side\n');
    runGit(['add', 'shared.txt'], worktreePath);
    runGit(['commit', '-q', '-m', 'feat: epic edits shared'], worktreePath);
    // …and base edits the same line the other way.
    fs.writeFileSync(path.join(root, 'shared.txt'), 'base side\n');
    runGit(['add', 'shared.txt'], root);
    runGit(['commit', '-q', '-m', 'chore: base edits shared'], root);
    // Mark epic-a completed so a bare mergeEpics() picks it up.
    new Coordinator(root, DEFAULT_SPEC_ID).completeTask('epic-a');
  });

  afterEach(() => {
    cleanupWorktrees(root);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(testHome, { recursive: true, force: true });
    process.env.HOME = originalHome;
    jest.restoreAllMocks();
  });

  test('a conflicting merge leaves the BASE half-merged, and abortMerge from the worktree cleans it', () => {
    // Merge from the base coordinator — it conflicts on shared.txt.
    expect(() =>
      new Coordinator(root, DEFAULT_SPEC_ID).mergeEpics({ epicIds: ['epic-a'] }),
    ).toThrow(/Failed to merge epic-a/);

    // The half-merged state is in the BASE checkout, not the worktree.
    expect(hasMergeInProgress(root)).toBe(true);

    // Abort via a WORKTREE-cwd coordinator (the agent is in the worktree). It
    // must delegate to the base and clean it.
    const result = new Coordinator(worktreePath, DEFAULT_SPEC_ID).abortMerge();
    expect(result.aborted).toBe(true);
    expect(result.base).toBe(root);

    // Base is clean again: no merge in progress and the conflicted file is
    // restored to base's version with no unmerged-path markers. (The dag.yaml
    // edit from completeTask is a pre-existing uncommitted change, unrelated to
    // the merge, so we assert on the conflicted file specifically.)
    expect(hasMergeInProgress(root)).toBe(false);
    const status = runGit(['status', '--porcelain', 'shared.txt'], root).trim();
    expect(status).toBe('');
    expect(fs.readFileSync(path.join(root, 'shared.txt'), 'utf8')).toBe('base side\n');
  });

  test('abortMerge is a safe no-op when there is no merge in progress', () => {
    // No merge started — abort should report aborted:false, not throw.
    const result = new Coordinator(worktreePath, DEFAULT_SPEC_ID).abortMerge();
    expect(result.aborted).toBe(false);
    expect(result.base).toBe(root);
    expect(hasMergeInProgress(root)).toBe(false);
  });

  test('CLI `finish-epic.js merge --abort` from the worktree cleans the base', () => {
    // Drive the conflict, then abort via the CLI flag (the dag-commands hunk).
    expect(() =>
      new Coordinator(root, DEFAULT_SPEC_ID).mergeEpics({ epicIds: ['epic-a'] }),
    ).toThrow();
    expect(hasMergeInProgress(root)).toBe(true);

    const out = runCli(['merge', '--abort', '--json'], worktreePath, testHome);
    expect(out.exitCode).toBe(0);
    const json = JSON.parse(out.stdout);
    expect(json.aborted).toBe(true);
    expect(json.base).toBe(root);
    expect(hasMergeInProgress(root)).toBe(false);
  });
});
