const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadLoopState,
  saveLoopState,
  beginRun,
  resetLoopState,
  recordError,
  finalizeLoop,
  isStalled,
  isRetryStorm,
} = require('../../scripts/lib/loop-state');

const LOOP_STATE_FILE = '.arcforge-loop.json';
const LOOP_ARCHIVE_DIR = '.arcforge-loop.archive';

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
    // finalizeLoop now queues morning review-queue pending actions under
    // ~/.arcforge/sessions/{project} (SDD-5). Redirect homedir so those writes
    // are isolated to the temp dir and never touch the real ~/.arcforge.
    let homeDir;
    beforeEach(() => {
      homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-state-home-'));
      jest.spyOn(os, 'homedir').mockReturnValue(homeDir);
      jest.resetModules();
    });
    afterEach(() => {
      jest.restoreAllMocks();
      fs.rmSync(homeDir, { recursive: true, force: true });
    });

    // pending-actions reads via getProjectName-equivalent key: basename(projectRoot)
    const projectKey = (root) => path.basename(root);
    const getActions = (root, type) => {
      const file = path.join(
        homeDir,
        '.arcforge',
        'sessions',
        projectKey(root),
        'pending-actions.json',
      );
      if (!fs.existsSync(file)) return [];
      const all = JSON.parse(fs.readFileSync(file, 'utf-8')).actions;
      return type ? all.filter((a) => a.type === type) : all;
    };

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

    it('queues a loop-finished action with status/completed_count/blocked/cost', () => {
      const state = loadLoopState(tmpDir);
      state.status = 'complete';
      state.completed_tasks = ['T-1', 'T-2'];
      state.failed_tasks = ['T-3'];
      state.errors = [{ task_id: 'T-3', error: 'boom', iteration: 1, timestamp: 'x', attempt: 2 }];
      state.total_cost = 1.5;
      finalizeLoop(state, 50, tmpDir);

      const finished = getActions(tmpDir, 'loop-finished');
      expect(finished).toHaveLength(1);
      const p = finished[0].payload;
      expect(p.status).toBe('complete');
      expect(p.completed_count).toBe(2);
      expect(p.blocked).toEqual([{ id: 'T-3', reason: 'boom' }]);
      expect(p.total_cost).toBe(1.5);
      // base_branch resolves to the temp repo's branch or null — must not throw.
      expect('base_branch' in p).toBe(true);
    });

    it('falls back to a generic blocked reason when the error was evicted', () => {
      const state = loadLoopState(tmpDir);
      state.failed_tasks = ['T-9'];
      state.errors = [];
      finalizeLoop(state, 50, tmpDir);
      const p = getActions(tmpDir, 'loop-finished')[0].payload;
      expect(p.blocked).toEqual([{ id: 'T-9', reason: 'failed after retries' }]);
    });

    it('queues ratify-pending counting proposed decisions across specs', () => {
      const mkLedger = (specId, body) => {
        const dir = path.join(tmpDir, 'specs', specId);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'decisions.yml'), body);
      };
      mkLedger(
        'spec-a',
        '- D-id: D-001\n  status: proposed\n  decision: x\n- D-id: D-002\n  status: proposed\n  decision: y\n',
      );
      mkLedger('spec-b', '- D-id: D-003\n  status: accepted\n  decision: z\n');

      const state = loadLoopState(tmpDir);
      state.status = 'complete';
      finalizeLoop(state, 50, tmpDir);

      const ratify = getActions(tmpDir, 'ratify-pending');
      expect(ratify).toHaveLength(1);
      expect(ratify[0].payload.count).toBe(2);
      expect(ratify[0].payload.specs).toEqual([
        { spec_id: 'spec-a', decision_ids: ['D-001', 'D-002'] },
      ]);
    });

    it('does not double-queue ratify-pending across two finalize calls', () => {
      const dir = path.join(tmpDir, 'specs', 'spec-a');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'decisions.yml'), '- D-id: D-001\n  status: proposed\n');

      finalizeLoop(loadLoopState(tmpDir), 50, tmpDir);
      finalizeLoop(loadLoopState(tmpDir), 50, tmpDir);

      expect(getActions(tmpDir, 'ratify-pending')).toHaveLength(1);
    });

    it('does not queue ratify-pending when no decisions are proposed', () => {
      const dir = path.join(tmpDir, 'specs', 'spec-a');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'decisions.yml'), '- D-id: D-001\n  status: accepted\n');

      finalizeLoop(loadLoopState(tmpDir), 50, tmpDir);
      expect(getActions(tmpDir, 'ratify-pending')).toHaveLength(0);
    });

    it('writes a terminal sentinel that passes the AF-2 loop-sentinel gate (S3-4)', () => {
      // After finalize, the on-disk sentinel is terminal, so the ratify command
      // named in the morning notification is NOT denied by the sentinel gate.
      const { loopSentinelPresent } = require('../../scripts/lib/sdd-utils');
      const state = loadLoopState(tmpDir);
      state.status = 'complete';
      finalizeLoop(state, 50, tmpDir);

      // Sentinel exists (resume depends on it) but reads as terminal.
      expect(fs.existsSync(path.join(tmpDir, '.arcforge-loop.json'))).toBe(true);
      expect(loopSentinelPresent(tmpDir)).toBe(false);
    });
  });

  describe('beginRun', () => {
    it('persists pattern, max_runs, max_cost, and a fresh run_id', () => {
      const state = loadLoopState(tmpDir);
      beginRun(state, { pattern: 'dag', maxRuns: 30, maxCost: 12 });
      expect(state.pattern).toBe('dag');
      expect(state.max_runs).toBe(30);
      expect(state.max_cost).toBe(12);
      expect(typeof state.run_id).toBe('string');
      expect(state.run_id.length).toBeGreaterThan(0);
    });

    it('defaults max_cost to null and records the run-start iteration', () => {
      const state = loadLoopState(tmpDir);
      state.iteration = 7;
      beginRun(state, { pattern: 'sequential', maxRuns: 20 });
      expect(state.max_cost).toBeNull();
      expect(state.run_started_iteration).toBe(7);
    });

    it('assigns a new run_id on each run (resume gets its own scope)', () => {
      const state = loadLoopState(tmpDir);
      beginRun(state, { pattern: 'sequential', maxRuns: 20 });
      const first = state.run_id;
      beginRun(state, { pattern: 'sequential', maxRuns: 20 });
      expect(state.run_id).not.toBe(first);
    });
  });

  describe('recordError run_id stamping', () => {
    it('stamps the current run_id onto each error entry', () => {
      const state = loadLoopState(tmpDir);
      beginRun(state, { pattern: 'sequential', maxRuns: 20 });
      recordError(state, 'task-1', 'boom', 1);
      expect(state.errors[0].run_id).toBe(state.run_id);
    });

    it('omits run_id on legacy state with no active run', () => {
      const state = loadLoopState(tmpDir);
      recordError(state, 'task-1', 'boom', 1);
      expect(state.errors[0].run_id).toBeUndefined();
    });
  });

  describe('run-scoped safety detection', () => {
    it('isRetryStorm ignores errors from a previous run', () => {
      const state = loadLoopState(tmpDir);
      // Three task-1 failures belong to a prior run.
      state.errors = [
        { task_id: 'task-1', error: 'x', timestamp: 't1', attempt: 1, run_id: 'run-old' },
        { task_id: 'task-1', error: 'x', timestamp: 't2', attempt: 1, run_id: 'run-old' },
        { task_id: 'task-1', error: 'x', timestamp: 't3', attempt: 1, run_id: 'run-old' },
      ];
      beginRun(state, { pattern: 'sequential', maxRuns: 20 });
      // No current-run errors → not a storm despite the prior run's failures.
      expect(isRetryStorm(state)).toBe(false);
    });

    it('isRetryStorm fires on a storm within the current run only', () => {
      const state = loadLoopState(tmpDir);
      beginRun(state, { pattern: 'sequential', maxRuns: 20 });
      for (let i = 0; i < 3; i++) recordError(state, 'task-1', 'x', 1);
      expect(isRetryStorm(state)).toBe(true);
    });

    it('isStalled does not flag a resumed run on entry despite high cumulative iteration', () => {
      const state = loadLoopState(tmpDir);
      // Simulate a resume: 30 cumulative iterations, no progress ever, but a
      // brand-new run that has not iterated yet.
      state.iteration = 30;
      state.last_progress_at = null;
      beginRun(state, { pattern: 'sequential', maxRuns: 50 });
      expect(isStalled(state)).toBe(false);
    });

    it('isStalled flags the current run once it accrues no-progress iterations', () => {
      const state = loadLoopState(tmpDir);
      state.iteration = 30;
      state.last_progress_at = null;
      beginRun(state, { pattern: 'sequential', maxRuns: 50 });
      // Two iterations into the new run with still no progress → stalled.
      state.iteration = 32;
      expect(isStalled(state)).toBe(true);
    });
  });

  describe('resetLoopState', () => {
    it('archives the existing state to .arcforge-loop.archive/<started_at>.json', () => {
      const state = loadLoopState(tmpDir);
      state.started_at = '2026-03-17T22:00:00Z';
      state.iteration = 9;
      saveLoopState(state, tmpDir);

      const fresh = resetLoopState(tmpDir);
      expect(fresh.iteration).toBe(0);
      expect(fresh.status).toBe('running');

      const archivePath = path.join(tmpDir, LOOP_ARCHIVE_DIR, '2026-03-17T22-00-00Z.json');
      expect(fs.existsSync(archivePath)).toBe(true);
      const archived = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      expect(archived.iteration).toBe(9);
      // Live state file is gone after archive (loadLoopState would re-init).
      expect(fs.existsSync(path.join(tmpDir, LOOP_STATE_FILE))).toBe(false);
    });

    it('is a no-op returning fresh state when no state file exists', () => {
      const fresh = resetLoopState(tmpDir);
      expect(fresh.iteration).toBe(0);
      expect(fs.existsSync(path.join(tmpDir, LOOP_ARCHIVE_DIR))).toBe(false);
    });
  });
});
