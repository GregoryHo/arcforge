const { isStalled, isRetryStorm, checkStopConditions } = require('../../scripts/loop');

/**
 * Helper: build a minimal loop state with sensible defaults.
 */
function makeState(overrides = {}) {
  return {
    iteration: 0,
    completed_tasks: [],
    failed_tasks: [],
    errors: [],
    last_progress_at: null,
    total_cost: 0,
    status: 'running',
    ...overrides,
  };
}

/**
 * Helper: create an error entry for state.errors.
 */
function makeError(taskId, timestamp = '2026-03-17T10:00:00Z', extra = {}) {
  return {
    task_id: taskId,
    iteration: 1,
    error: 'something failed',
    timestamp,
    attempt: 1,
    ...extra,
  };
}

describe('loop safety mechanisms', () => {
  describe('isStalled', () => {
    it('returns false on a fresh loop (iteration 0)', () => {
      const state = makeState({ iteration: 0 });
      expect(isStalled(state)).toBe(false);
    });

    it('returns false when iteration count is below STALL_THRESHOLD and no progress yet', () => {
      const state = makeState({ iteration: 1 });
      expect(isStalled(state)).toBe(false);
    });

    it('returns true when iteration >= STALL_THRESHOLD with no progress ever', () => {
      // STALL_THRESHOLD is 2 — after 2 iterations with no completed tasks
      const state = makeState({ iteration: 2 });
      expect(isStalled(state)).toBe(true);
    });

    it('returns true when iteration exceeds STALL_THRESHOLD with no progress ever', () => {
      const state = makeState({ iteration: 5 });
      expect(isStalled(state)).toBe(true);
    });

    it('returns false when progress was made and no errors since', () => {
      const state = makeState({
        iteration: 10,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [],
      });
      expect(isStalled(state)).toBe(false);
    });

    it('returns false when fewer than STALL_THRESHOLD errors occurred since last progress', () => {
      const state = makeState({
        iteration: 5,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [
          // One error after progress — below threshold of 2
          makeError('task-1', '2026-03-17T10:01:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(false);
    });

    it('returns true when STALL_THRESHOLD errors occurred after last progress', () => {
      const state = makeState({
        iteration: 5,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-2', '2026-03-17T10:02:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(true);
    });

    it('ignores errors that occurred before last_progress_at', () => {
      const state = makeState({
        iteration: 10,
        last_progress_at: '2026-03-17T10:05:00Z',
        errors: [
          // These 3 errors all predate last progress — should be ignored
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-2', '2026-03-17T10:02:00Z'),
          makeError('task-3', '2026-03-17T10:03:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(false);
    });

    it('correctly handles mix of old and new errors', () => {
      const state = makeState({
        iteration: 10,
        last_progress_at: '2026-03-17T10:05:00Z',
        errors: [
          // 2 old errors (before progress)
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-2', '2026-03-17T10:02:00Z'),
          // 2 new errors (after progress) — meets threshold
          makeError('task-3', '2026-03-17T10:06:00Z'),
          makeError('task-4', '2026-03-17T10:07:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(true);
    });
  });

  describe('isRetryStorm', () => {
    it('returns false with no errors', () => {
      const state = makeState();
      expect(isRetryStorm(state)).toBe(false);
    });

    it('returns false with fewer than 3 total errors', () => {
      const state = makeState({
        errors: [makeError('task-1'), makeError('task-1')],
      });
      expect(isRetryStorm(state)).toBe(false);
    });

    it('returns true when same task fails 3 times in recent window', () => {
      const state = makeState({
        errors: [
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-1', '2026-03-17T10:02:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(true);
    });

    it('returns false when 3 errors come from different tasks', () => {
      const state = makeState({
        errors: [
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-2', '2026-03-17T10:01:00Z'),
          makeError('task-3', '2026-03-17T10:02:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(false);
    });

    it('only inspects the last 6 errors (sliding window)', () => {
      const state = makeState({
        errors: [
          // These 3 old errors for task-1 should be outside the window
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-1', '2026-03-17T10:02:00Z'),
          // 6 recent diverse errors push old ones out of window
          makeError('task-2', '2026-03-17T10:03:00Z'),
          makeError('task-3', '2026-03-17T10:04:00Z'),
          makeError('task-4', '2026-03-17T10:05:00Z'),
          makeError('task-5', '2026-03-17T10:06:00Z'),
          makeError('task-6', '2026-03-17T10:07:00Z'),
          makeError('task-7', '2026-03-17T10:08:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(false);
    });

    it('detects storm within the last 6 even with older diverse errors', () => {
      const state = makeState({
        errors: [
          // Old diverse errors
          makeError('task-a', '2026-03-17T10:00:00Z'),
          makeError('task-b', '2026-03-17T10:01:00Z'),
          makeError('task-c', '2026-03-17T10:02:00Z'),
          // Recent storm for task-x (within last 6)
          makeError('task-d', '2026-03-17T10:03:00Z'),
          makeError('task-x', '2026-03-17T10:04:00Z'),
          makeError('task-x', '2026-03-17T10:05:00Z'),
          makeError('task-x', '2026-03-17T10:06:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(true);
    });

    it('returns true at exactly 3 occurrences (boundary)', () => {
      const state = makeState({
        errors: [
          makeError('task-1'),
          makeError('task-2'),
          makeError('task-1'),
          makeError('task-2'),
          makeError('task-1'),
          makeError('task-2'),
        ],
      });
      // Both task-1 and task-2 appear 3 times in a 6-error window
      expect(isRetryStorm(state)).toBe(true);
    });
  });

  describe('checkStopConditions', () => {
    it('returns null when no stop conditions are met', () => {
      const state = makeState({
        iteration: 1,
        last_progress_at: '2026-03-17T10:00:00Z',
        total_cost: 0,
      });
      expect(checkStopConditions(state, null)).toBeNull();
    });

    it('returns "cost_limit" when total_cost >= maxCost', () => {
      const state = makeState({ total_cost: 10 });
      expect(checkStopConditions(state, 10)).toBe('cost_limit');
    });

    it('returns "cost_limit" when total_cost exceeds maxCost', () => {
      const state = makeState({ total_cost: 15 });
      expect(checkStopConditions(state, 10)).toBe('cost_limit');
    });

    it('ignores cost when maxCost is null', () => {
      const state = makeState({
        iteration: 1,
        total_cost: 9999,
        last_progress_at: '2026-03-17T10:00:00Z',
      });
      expect(checkStopConditions(state, null)).toBeNull();
    });

    it('returns "stalled" when loop is stalled', () => {
      const state = makeState({ iteration: 3 });
      expect(checkStopConditions(state, null)).toBe('stalled');
    });

    it('returns "retry_storm" when retry storm is detected', () => {
      const state = makeState({
        iteration: 1,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [
          makeError('task-1', '2026-03-17T09:00:00Z'),
          makeError('task-1', '2026-03-17T09:01:00Z'),
          makeError('task-1', '2026-03-17T09:02:00Z'),
        ],
      });
      expect(checkStopConditions(state, null)).toBe('retry_storm');
    });

    it('checks cost before stall (cost_limit takes priority)', () => {
      const state = makeState({
        iteration: 5,
        total_cost: 20,
      });
      // Both stalled (iteration 5, no progress) and over cost
      expect(checkStopConditions(state, 10)).toBe('cost_limit');
    });

    it('checks stall before retry storm (stall takes priority)', () => {
      const state = makeState({
        iteration: 5,
        errors: [
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-1', '2026-03-17T10:02:00Z'),
        ],
      });
      // Both stalled (iteration 5, no progress) and retry storm
      expect(checkStopConditions(state, null)).toBe('stalled');
    });
  });
});
