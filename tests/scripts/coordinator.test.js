const { DAG, TaskStatus } = require('../../scripts/lib/models');

// We test Coordinator's pure scheduling logic by injecting a DAG directly,
// bypassing file I/O. For methods that call _saveDag (which uses withLock + fs),
// we mock _saveDag to be a no-op.

// Helper: create a Coordinator with an injected DAG (no file I/O needed)
function createCoordinator(dagData) {
  // Require inline to avoid module-level side effects
  const { Coordinator } = require('../../scripts/lib/coordinator');
  const coord = new Coordinator('/tmp/fake-project');
  coord._dag = new DAG(dagData);
  coord._saveDag = jest.fn(); // no-op mock — avoids file system + locking
  return coord;
}

// Reusable DAG fixture: 2 epics, epic-2 depends on epic-1
function twoEpicDag(overrides = {}) {
  return {
    epics: [
      {
        id: 'epic-1',
        name: 'Foundation',
        spec_path: 'docs/epic-1.md',
        status: overrides.epic1Status || TaskStatus.PENDING,
        worktree: overrides.epic1Worktree || null,
        depends_on: [],
        features: overrides.epic1Features || [
          { id: 'feat-1a', name: 'Setup', status: TaskStatus.PENDING },
          { id: 'feat-1b', name: 'Core', status: TaskStatus.PENDING, depends_on: ['feat-1a'] },
        ],
      },
      {
        id: 'epic-2',
        name: 'Extension',
        spec_path: 'docs/epic-2.md',
        status: overrides.epic2Status || TaskStatus.PENDING,
        worktree: overrides.epic2Worktree || null,
        depends_on: ['epic-1'],
        features: overrides.epic2Features || [
          { id: 'feat-2a', name: 'Plugin', status: TaskStatus.PENDING },
        ],
      },
    ],
    blocked: overrides.blocked || [],
  };
}

describe('Coordinator', () => {
  describe('status', () => {
    it('should return all epics with features', () => {
      const coord = createCoordinator(twoEpicDag());
      const result = coord.status();
      expect(result.epics).toHaveLength(2);
      expect(result.epics[0].id).toBe('epic-1');
      expect(result.epics[0].features).toHaveLength(2);
      expect(result.blocked).toEqual([]);
    });

    it('should filter to blocked only', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.BLOCKED }));
      const result = coord.status({ blockedOnly: true });
      expect(result.epics).toHaveLength(1);
      expect(result.epics[0].id).toBe('epic-1');
    });

    it('should report progress as completion ratio', () => {
      const coord = createCoordinator(
        twoEpicDag({
          epic1Status: TaskStatus.IN_PROGRESS,
          epic1Features: [
            { id: 'feat-1a', name: 'Setup', status: TaskStatus.COMPLETED },
            { id: 'feat-1b', name: 'Core', status: TaskStatus.PENDING },
          ],
        }),
      );
      const result = coord.status();
      expect(result.epics[0].progress).toBe(0.5);
    });
  });

  describe('completeTask', () => {
    it('should mark feature as completed', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.IN_PROGRESS }));
      coord.completeTask('feat-1a');
      const task = coord.dag.getTask('feat-1a');
      expect(task.status).toBe(TaskStatus.COMPLETED);
      expect(coord._saveDag).toHaveBeenCalled();
    });

    it('should promote epic to in_progress when first feature completes', () => {
      const coord = createCoordinator(twoEpicDag());
      coord.completeTask('feat-1a');
      const epic = coord.dag.getEpic('epic-1');
      expect(epic.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should mark epic completed when all features are done', () => {
      const coord = createCoordinator(
        twoEpicDag({
          epic1Status: TaskStatus.IN_PROGRESS,
          epic1Features: [
            { id: 'feat-1a', name: 'Setup', status: TaskStatus.COMPLETED },
            { id: 'feat-1b', name: 'Core', status: TaskStatus.PENDING },
          ],
        }),
      );
      coord.completeTask('feat-1b');
      const epic = coord.dag.getEpic('epic-1');
      expect(epic.status).toBe(TaskStatus.COMPLETED);
    });

    it('should throw for unknown task ID', () => {
      const coord = createCoordinator(twoEpicDag());
      expect(() => coord.completeTask('nonexistent')).toThrow(/Task not found/);
    });
  });

  describe('blockTask', () => {
    it('should mark task as blocked with reason', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.IN_PROGRESS }));
      coord.blockTask('feat-1a', 'API not ready');
      const task = coord.dag.getTask('feat-1a');
      expect(task.status).toBe(TaskStatus.BLOCKED);
      expect(coord.dag.blocked).toHaveLength(1);
      expect(coord.dag.blocked[0].reason).toBe('API not ready');
    });

    it('should throw for unknown task ID', () => {
      const coord = createCoordinator(twoEpicDag());
      expect(() => coord.blockTask('nonexistent', 'reason')).toThrow(/Task not found/);
    });
  });

  describe('parallelTasks', () => {
    it('should return ready epics with no unsatisfied dependencies', () => {
      const coord = createCoordinator(twoEpicDag());
      const ready = coord.parallelTasks();
      // epic-1 has no deps → ready, epic-2 depends on epic-1 → not ready
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('epic-1');
    });

    it('should return empty when no epics are ready', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.IN_PROGRESS }));
      const ready = coord.parallelTasks();
      expect(ready).toHaveLength(0);
    });

    it('should return epic-2 once epic-1 is completed', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.COMPLETED }));
      const ready = coord.parallelTasks();
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('epic-2');
    });
  });

  describe('nextTask', () => {
    it('should return null when all tasks are completed', () => {
      const coord = createCoordinator({
        epics: [
          {
            id: 'epic-1',
            name: 'Done',
            spec_path: 'docs/done.md',
            status: TaskStatus.COMPLETED,
            features: [{ id: 'feat-1', name: 'F1', status: TaskStatus.COMPLETED }],
          },
        ],
        blocked: [],
      });
      expect(coord.nextTask()).toBeNull();
    });

    // TODO(human): Implement the priority ordering test
    // This test should verify the 3-level priority:
    //   1. In-progress features within in-progress epics (highest)
    //   2. Ready (pending + deps met) features in in-progress epics
    //   3. Ready epics (pending + all epic deps completed) (lowest)
    //
    // Build a DAG with all three levels present simultaneously
    // and verify nextTask returns them in the correct order.
    it('should follow 3-level priority ordering', () => {});
  });

  describe('rebootContext', () => {
    it('should return task counts', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.IN_PROGRESS }));
      const context = coord.rebootContext();
      expect(context.remaining_count).toBeDefined();
      expect(context.completed_count).toBeDefined();
      expect(context.blocked_count).toBeDefined();
    });
  });
});
