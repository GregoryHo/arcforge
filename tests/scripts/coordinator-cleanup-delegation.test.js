/**
 * Coordinator.cleanupWorktrees — base delegation from a worktree cwd (WT-2,
 * S2-3 engine hardening).
 *
 * A worktree's local dag copy carries `worktree: null` for every epic, so
 * cleanup run from a worktree-cwd coordinator used to be a silent no-op.
 * It now delegates to the base coordinator (same pattern as mergeEpics):
 * the worktree is actually removed and the base dag updated.
 */

const fs = require('node:fs');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { getWorktreePath } = require('../../scripts/lib/worktree-paths');
const {
  runGit,
  setupRepo,
  readDagFromDisk,
  cleanupWorktrees,
  DEFAULT_SPEC_ID,
} = require('./coordinator-test-helpers');

describe('Coordinator.cleanupWorktrees — worktree-cwd base delegation', () => {
  let root;

  beforeEach(() => {
    // realpath keeps the repo root in the same symlink-free space as the
    // paths git prints in `worktree list`, so the delegation comparison
    // and base-side hash derivation stay consistent on macOS.
    root = fs.realpathSync(setupRepo({ prefix: 'arcforge-cleanup-deleg-' }));
    // Commit the dag so the epic worktree checkout carries its own local
    // copy (with `worktree: null` for every epic).
    runGit(['add', '.'], root);
    runGit(['commit', '-q', '-m', 'chore: add dag'], root);
  });

  afterEach(() => {
    cleanupWorktrees(root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('cleanup from a worktree-cwd coordinator removes the worktree and updates the base dag', () => {
    new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
    const worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');
    expect(fs.existsSync(worktreePath)).toBe(true);

    const removed = new Coordinator(worktreePath, DEFAULT_SPEC_ID).cleanupWorktrees({
      epicIds: ['epic-a'],
    });

    expect(removed).toEqual([worktreePath]);
    expect(fs.existsSync(worktreePath)).toBe(false);
    const dag = readDagFromDisk(root);
    expect(dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();
  });

  test('cleanup from the base coordinator behaves as before (no delegation detour)', () => {
    new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
    const worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');

    const removed = new Coordinator(root, DEFAULT_SPEC_ID).cleanupWorktrees({
      epicIds: ['epic-a'],
    });

    expect(removed).toEqual([worktreePath]);
    expect(fs.existsSync(worktreePath)).toBe(false);
    const dag = readDagFromDisk(root);
    expect(dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();
  });
});
