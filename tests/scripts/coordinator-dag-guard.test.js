/**
 * Engine-side twin of the dag-guard PreToolUse hook.
 *
 * PreToolUse denies are void under --dangerously-skip-permissions, so
 * coordinator-core._saveDag enforces the same two invariants (completed is
 * monotonic, dependencies are preserved) on the canonical write path. These
 * tests exercise the REAL _saveDag (fs + withLock), not the mocked no-op used by
 * coordinator.test.js.
 */

const fs = require('node:fs');
const path = require('node:path');

const { setupRepo, cleanupWorktrees, DEFAULT_SPEC_ID } = require('./coordinator-test-helpers');
const { Coordinator } = require('../../scripts/lib/coordinator');
const { TaskStatus } = require('../../scripts/lib/models');
const { stringifyDagYaml } = require('../../scripts/lib/yaml-parser');

describe('coordinator dag-guard engine twin (_saveDag)', () => {
  let root;

  afterEach(() => {
    if (root) {
      cleanupWorktrees(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    root = null;
  });

  function writeDag(epics) {
    fs.writeFileSync(
      path.join(root, 'specs', DEFAULT_SPEC_ID, 'dag.yaml'),
      stringifyDagYaml({ epics, blocked: [] }),
    );
  }

  function withCompletedA() {
    return [
      {
        id: 'epic-a',
        name: 'Epic A',
        status: TaskStatus.COMPLETED,
        spec_path: 'a.md',
        worktree: null,
        depends_on: [],
        features: [],
      },
      {
        id: 'epic-b',
        name: 'Epic B',
        status: TaskStatus.PENDING,
        spec_path: 'b.md',
        worktree: null,
        depends_on: ['epic-a'],
        features: [],
      },
    ];
  }

  it('throws when a save would un-complete a completed epic', () => {
    root = setupRepo();
    writeDag(withCompletedA());
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    coord.dag.epics[0].status = TaskStatus.PENDING; // leave completed → illegal
    expect(() => coord._saveDag()).toThrow(/completed/i);
  });

  it('throws when a save would drop a dependency', () => {
    root = setupRepo();
    writeDag(withCompletedA());
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    coord.dag.epics[1].depends_on = []; // drop epic-b's dep on epic-a
    expect(() => coord._saveDag()).toThrow(/dependency/i);
  });

  it('allows a legal forward transition (pending → in_progress)', () => {
    root = setupRepo();
    writeDag(withCompletedA());
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    coord.dag.epics[1].status = TaskStatus.IN_PROGRESS;
    expect(() => coord._saveDag()).not.toThrow();
  });

  it('completeTask still works end-to-end through the guarded write path', () => {
    root = setupRepo(); // two pending epics, no features
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    expect(() => coord.completeTask('epic-a')).not.toThrow();
    const reloaded = new Coordinator(root, DEFAULT_SPEC_ID);
    expect(reloaded.dag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.COMPLETED);
  });

  it('refuses to block a completed task with a clear error and no half-mutation', () => {
    root = setupRepo();
    writeDag(withCompletedA()); // epic-a is completed
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);

    let err;
    try {
      coord.blockTask('epic-a', 'boom');
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/epic-a/);
    expect(err.message).toMatch(/already completed/i);
    expect(err.message).toMatch(/terminal/i);
    // No half-mutation: status unchanged and no BlockedItem appended.
    expect(coord.dag.epics[0].status).toBe(TaskStatus.COMPLETED);
    expect(coord.dag.blocked).toHaveLength(0);
  });
});
