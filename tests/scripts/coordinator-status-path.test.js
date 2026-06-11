/**
 * Coordinator.status() — absolute worktree path emission (WT-1).
 *
 * status() emits `path` per epic: the absolute worktree path derived at
 * read time from the stored `worktree` value (null when not expanded).
 * The pin test fixes the fact that `.path` is only meaningful from the
 * BASE checkout — a worktree's local dag copy carries `worktree: null`
 * for every epic, so `status --json` from a worktree cwd reports null.
 * Skill text must never instruct reading `.path` from inside a worktree.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { getWorktreePath, parseWorktreePath } = require('../../scripts/lib/worktree-paths');
const {
  runGit,
  setupRepo,
  cleanupWorktrees,
  DEFAULT_SPEC_ID,
} = require('./coordinator-test-helpers');

const CLI = path.resolve(__dirname, '../../scripts/cli.js');

describe('Coordinator.status() — worktree path emission', () => {
  let root;

  beforeEach(() => {
    root = setupRepo();
    // Commit the dag so the epic worktree checkout carries its own local
    // copy — the committed copy still has `worktree: null` for every epic
    // (expand mutates only the base's working-tree dag.yaml).
    runGit(['add', '.'], root);
    runGit(['commit', '-q', '-m', 'chore: add dag'], root);
  });

  afterEach(() => {
    cleanupWorktrees(root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('expanded epic carries an absolute, parseable path; unexpanded stays null', () => {
    new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });

    const result = new Coordinator(root, DEFAULT_SPEC_ID).status();
    const epicA = result.epics.find((e) => e.id === 'epic-a');
    const epicB = result.epics.find((e) => e.id === 'epic-b');

    // `worktree` keeps the raw dag value (epic id) — `path` is additive.
    expect(epicA.worktree).toBe('epic-a');
    expect(path.isAbsolute(epicA.path)).toBe(true);
    expect(parseWorktreePath(epicA.path)).not.toBeNull();
    expect(epicA.path).toBe(getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a'));

    expect(epicB.worktree).toBeNull();
    expect(epicB.path).toBeNull();
  });

  test('pin: status --json from a worktree cwd reports path null (local dag copy has worktree: null)', () => {
    new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
    const worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');

    const stdout = execFileSync('node', [CLI, 'status', '--json'], {
      cwd: worktreePath,
      env: { ...process.env, CLAUDE_PROJECT_DIR: worktreePath },
      encoding: 'utf8',
    });
    const parsed = JSON.parse(stdout);
    const epicA = parsed.epics.find((e) => e.id === 'epic-a');

    // The worktree-local dag copy never knows about its own expansion, so
    // `.path` is null from inside a worktree. Never instruct reading
    // `.path` from a worktree cwd — read it from the base checkout.
    expect(epicA.worktree).toBeNull();
    expect(epicA.path).toBeNull();
  });
});
