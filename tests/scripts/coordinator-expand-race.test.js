const fs = require('node:fs');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { TaskStatus } = require('../../scripts/lib/models');
const { setupRepo, readDagFromDisk, cleanupWorktrees } = require('./coordinator-test-helpers');

// Regression guard for the expand-path read-modify-write race.
// Two processes expanding different epics concurrently would each load
// a stale dag, and the second save clobbers the first.

describe('Coordinator expand concurrency', () => {
  let root;

  beforeEach(() => {
    root = setupRepo();
  });

  afterEach(() => {
    cleanupWorktrees(root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('concurrent expands preserve both epic worktree assignments', () => {
    // Two Coordinator instances representing two teammate processes
    // that both loaded the dag before either wrote back.
    const coordA = new Coordinator(root);
    const coordB = new Coordinator(root);

    // Force lazy load — both see all epics pending with no worktree.
    expect(coordA.dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();
    expect(coordB.dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();

    // coordA expands epic-a: creates the worktree directory, mutates
    // its own in-memory epic-a, and saves.
    coordA.expandWorktrees({ epicId: 'epic-a' });

    // coordB's in-memory dag is stale — epic-a still shows no worktree.
    expect(coordB._dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();

    // coordB expands epic-b. Without the fix, coordB's save writes
    // its stale snapshot (epic-a worktree=null), clobbering coordA's
    // epic-a assignment on disk. With _dagTransaction, coordB re-reads
    // the dag under the lock, sees epic-a's worktree, and preserves it.
    coordB.expandWorktrees({ epicId: 'epic-b' });

    const finalDag = readDagFromDisk(root);
    const epicA = finalDag.epics.find((e) => e.id === 'epic-a');
    const epicB = finalDag.epics.find((e) => e.id === 'epic-b');

    // Both must have their worktree field set and be in_progress.
    expect(epicA.worktree).toBe('epic-a');
    expect(epicA.status).toBe(TaskStatus.IN_PROGRESS);
    expect(epicB.worktree).toBe('epic-b');
    expect(epicB.status).toBe(TaskStatus.IN_PROGRESS);
  });

  test('single expand still updates status correctly', () => {
    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });

    const finalDag = readDagFromDisk(root);
    expect(finalDag.epics.find((e) => e.id === 'epic-a').worktree).toBe('epic-a');
    expect(finalDag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.IN_PROGRESS);
    // epic-b untouched
    expect(finalDag.epics.find((e) => e.id === 'epic-b').worktree).toBeNull();
    expect(finalDag.epics.find((e) => e.id === 'epic-b').status).toBe(TaskStatus.PENDING);
  });
});
