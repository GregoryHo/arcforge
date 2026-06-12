const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadLoopState,
  saveLoopState,
  recordError,
  finalizeLoop,
} = require('../../scripts/lib/loop-state');

const LOOP_STATE_FILE = '.arcforge-loop.json';

describe('loop-state', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-state-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadLoopState', () => {
    it('initializes fresh state when no state file exists', () => {
      const state = loadLoopState(tmpDir);
      expect(state.iteration).toBe(0);
      expect(state.pattern).toBe('sequential');
      expect(state.completed_tasks).toEqual([]);
      expect(state.failed_tasks).toEqual([]);
      expect(state.errors).toEqual([]);
      expect(state.total_cost).toBe(0);
      expect(state.last_progress_at).toBeNull();
      expect(state.status).toBe('running');
    });

    it('loads a legacy .arcforge-loop.json unchanged', () => {
      const legacy = {
        iteration: 3,
        pattern: 'dag',
        started_at: '2026-03-17T10:00:00Z',
        completed_tasks: ['task-1'],
        failed_tasks: [],
        errors: [
          {
            task_id: 'task-2',
            iteration: 2,
            error: 'boom',
            timestamp: '2026-03-17T10:05:00Z',
            attempt: 1,
          },
        ],
        total_cost: 1.25,
        last_progress_at: '2026-03-17T10:04:00Z',
        status: 'running',
      };
      fs.writeFileSync(path.join(tmpDir, LOOP_STATE_FILE), `${JSON.stringify(legacy, null, 2)}\n`);
      expect(loadLoopState(tmpDir)).toEqual(legacy);
    });

    it('throws with context when the state file is corrupt', () => {
      fs.writeFileSync(path.join(tmpDir, LOOP_STATE_FILE), '{not json');
      expect(() => loadLoopState(tmpDir)).toThrow(/Failed to parse loop state/);
    });
  });

  describe('saveLoopState', () => {
    it('round-trips state through the state file', () => {
      const state = loadLoopState(tmpDir);
      state.iteration = 5;
      state.completed_tasks.push('task-1');
      saveLoopState(state, tmpDir);
      expect(loadLoopState(tmpDir)).toEqual(state);
    });
  });

  describe('recordError', () => {
    it('appends an error entry with truncated message', () => {
      const state = loadLoopState(tmpDir);
      state.iteration = 2;
      recordError(state, 'task-1', 'x'.repeat(600), 1);
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].task_id).toBe('task-1');
      expect(state.errors[0].iteration).toBe(2);
      expect(state.errors[0].error).toHaveLength(500);
      expect(state.errors[0].attempt).toBe(1);
    });

    it('caps stored errors at 20', () => {
      const state = loadLoopState(tmpDir);
      for (let i = 0; i < 25; i++) {
        recordError(state, `task-${i}`, 'fail', 1);
      }
      expect(state.errors).toHaveLength(20);
      expect(state.errors[0].task_id).toBe('task-5');
      expect(state.errors[19].task_id).toBe('task-24');
    });
  });

  describe('finalizeLoop', () => {
    it('stamps finished_at and persists state', () => {
      const state = loadLoopState(tmpDir);
      state.status = 'complete';
      finalizeLoop(state, 50, tmpDir);
      expect(state.finished_at).toBeDefined();
      expect(state.status).toBe('complete');
      expect(loadLoopState(tmpDir)).toEqual(state);
    });

    it('sets status to max_runs when iteration reaches maxRuns', () => {
      const state = loadLoopState(tmpDir);
      state.iteration = 50;
      finalizeLoop(state, 50, tmpDir);
      expect(state.status).toBe('max_runs');
      expect(loadLoopState(tmpDir).status).toBe('max_runs');
    });
  });
});
