const { DAG, TaskStatus } = require('../../scripts/lib/models');

// We test Coordinator's pure scheduling logic by injecting a DAG directly,
// bypassing file I/O. For methods that call _saveDag (which uses withLock + fs),
// we mock _saveDag to be a no-op. For methods that use _dagTransaction, we
// replace the transaction with a pass-through — the injected _dag stays the
// source of truth (no re-read, no re-save), matching the test's intent of
// exercising pure in-memory scheduling logic.

// Helper: create a Coordinator with an injected DAG (no file I/O needed)
function createCoordinator(dagData) {
  // Require inline to avoid module-level side effects
  const { Coordinator } = require('../../scripts/lib/coordinator');
  const coord = new Coordinator('/tmp/fake-project');
  coord._dag = new DAG(dagData);
  coord._saveDag = jest.fn(); // no-op mock — avoids file system + locking
  // Pass-through: run fn against the already-injected _dag. Skips the
  // lock-acquire + _loadDag re-read that the real transaction performs,
  // because those would hit the filesystem. Tests that need real
  // transaction semantics use tempdir-based setups instead of this helper.
  coord._dagTransaction = jest.fn((fn) => fn());
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

    it('should follow 3-level priority ordering', () => {
      // All three levels present: in-progress feature, ready feature, ready epic
      const coord = createCoordinator({
        epics: [
          {
            id: 'epic-1',
            name: 'Active',
            spec_path: 'docs/e1.md',
            status: TaskStatus.IN_PROGRESS,
            features: [
              { id: 'feat-1a', name: 'InProgress', status: TaskStatus.IN_PROGRESS },
              { id: 'feat-1b', name: 'Ready', status: TaskStatus.PENDING },
            ],
          },
          {
            id: 'epic-2',
            name: 'Ready',
            spec_path: 'docs/e2.md',
            status: TaskStatus.PENDING,
            depends_on: [],
            features: [{ id: 'feat-2a', name: 'Waiting', status: TaskStatus.PENDING }],
          },
        ],
      });
      // Priority 1: in-progress feature
      expect(coord.nextTask().id).toBe('feat-1a');
    });

    it('should return ready feature when no in-progress features', () => {
      const coord = createCoordinator({
        epics: [
          {
            id: 'epic-1',
            name: 'Active',
            spec_path: 'docs/e1.md',
            status: TaskStatus.IN_PROGRESS,
            features: [
              { id: 'feat-1a', name: 'Done', status: TaskStatus.COMPLETED },
              { id: 'feat-1b', name: 'Ready', status: TaskStatus.PENDING },
            ],
          },
        ],
      });
      // Priority 2: ready feature in in-progress epic
      expect(coord.nextTask().id).toBe('feat-1b');
    });
  });

  describe('nextTask with epicId scoping', () => {
    it('should return features only from the specified epic', () => {
      const coord = createCoordinator(
        twoEpicDag({
          epic1Status: TaskStatus.IN_PROGRESS,
          epic2Status: TaskStatus.IN_PROGRESS,
          epic2Features: [{ id: 'feat-2a', name: 'Plugin', status: TaskStatus.IN_PROGRESS }],
        }),
      );
      // Without scope: returns feat-2a (in-progress has priority)
      expect(coord.nextTask().id).toBe('feat-2a');
      // With scope to epic-1: returns feat-1a (first pending in epic-1)
      const result = coord.nextTask('epic-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('feat-1a');
    });

    it('should return null when scoped epic is completed', () => {
      const coord = createCoordinator(
        twoEpicDag({
          epic1Status: TaskStatus.COMPLETED,
          epic1Features: [
            { id: 'feat-1a', name: 'Setup', status: TaskStatus.COMPLETED },
            { id: 'feat-1b', name: 'Core', status: TaskStatus.COMPLETED },
          ],
        }),
      );
      // epic-1 completed, epic-2 has work, but we scoped to epic-1
      expect(coord.nextTask('epic-1')).toBeNull();
    });

    it('should return null for nonexistent epic ID', () => {
      const coord = createCoordinator(twoEpicDag());
      expect(coord.nextTask('nonexistent')).toBeNull();
    });

    it('should maintain current behavior when epicId is null', () => {
      const coord = createCoordinator(twoEpicDag());
      // Same as calling nextTask() — returns first ready epic
      const result = coord.nextTask(null);
      expect(result).not.toBeNull();
      expect(result.id).toBe('epic-1');
    });
  });

  describe('parallelTasks with epicId scoping', () => {
    it('should return only the specified epic when ready', () => {
      const coord = createCoordinator(twoEpicDag());
      const result = coord.parallelTasks('epic-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('epic-1');
    });

    it('should return empty when scoped epic is not ready', () => {
      const coord = createCoordinator(twoEpicDag());
      // epic-2 depends on epic-1 which is pending
      const result = coord.parallelTasks('epic-2');
      expect(result).toHaveLength(0);
    });

    it('should return empty when scoped epic is completed', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.COMPLETED }));
      const result = coord.parallelTasks('epic-1');
      expect(result).toHaveLength(0);
    });

    it('should maintain current behavior when epicId is null', () => {
      const coord = createCoordinator(twoEpicDag());
      const result = coord.parallelTasks(null);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('epic-1');
    });
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

  describe('expandWorktrees single-epic preconditions', () => {
    it('throws when the named epic is not in the DAG', () => {
      const coord = createCoordinator(twoEpicDag());
      expect(() => coord.expandWorktrees({ epicId: 'nope' })).toThrow(/not found/i);
    });

    it('throws when the named epic has unmet dependencies', () => {
      const coord = createCoordinator(twoEpicDag());
      // epic-2 depends on epic-1 (still pending)
      expect(() => coord.expandWorktrees({ epicId: 'epic-2' })).toThrow(/waiting on epic-1/);
    });

    it('throws when the named epic is already in progress', () => {
      const coord = createCoordinator(twoEpicDag({ epic1Status: TaskStatus.IN_PROGRESS }));
      expect(() => coord.expandWorktrees({ epicId: 'epic-1' })).toThrow(/status is in_progress/);
    });

    it('returns empty array when a batch run has no ready epics', () => {
      const coord = createCoordinator(
        twoEpicDag({
          epic1Status: TaskStatus.IN_PROGRESS,
          epic2Status: TaskStatus.BLOCKED,
        }),
      );
      expect(coord.expandWorktrees()).toEqual([]);
    });
  });
});
