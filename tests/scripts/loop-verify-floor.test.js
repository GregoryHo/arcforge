/**
 * loop-verify-floor.test.js — AF-8 acceptance floor in the SEQUENTIAL runTask
 * path (loop.js). spawnSession is mocked to control session exit/cost; the
 * verify command runs for real (an argv array via execFileSync, no shell).
 *
 * Invariants pinned here:
 *   - flag absent → runTask behaves byte-identically (completes on exit 0).
 *   - exit 0 + passing verify → completeTask, verify_results persisted.
 *   - exit 0 + failing verify → NO completeTask; retries once; then blocks.
 *   - failed session is never followed by a verify (floor is exit-0-gated).
 */

jest.mock('../../scripts/lib/loop-session', () => ({
  spawnSession: jest.fn(),
  spawnSessionAsync: jest.fn(),
}));

const { spawnSession } = require('../../scripts/lib/loop-session');
const { runTask } = require('../../scripts/loop');

/** Minimal coordinator stub: records complete/block calls; taskContext throws
 *  (runTask tolerates that — buildTaskPrompt falls back to basic info). */
function makeCoord() {
  return {
    completed: [],
    blocked: [],
    specId: 'spec',
    completeTask(id) {
      this.completed.push(id);
    },
    blockTask(id, reason) {
      this.blocked.push({ id, reason });
    },
    taskContext() {
      throw new Error('no context in stub');
    },
    dag: { getTask: () => null },
  };
}

function makeState() {
  return {
    iteration: 1,
    completed_tasks: [],
    failed_tasks: [],
    errors: [],
    total_cost: 0,
    last_progress_at: null,
    status: 'running',
  };
}

const task = { id: 'epic-a', name: 'Epic A' };
const PASS = ['node', '-e', 'process.exit(0)'];
const FAIL = ['node', '-e', 'process.exit(1)'];

beforeEach(() => {
  spawnSession.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('runTask acceptance floor (sequential)', () => {
  it('flag absent → completes on a clean session exit, no verify_results', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const coord = makeCoord();
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: process.cwd() });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['epic-a']);
    expect(spawnSession).toHaveBeenCalledTimes(1);
    expect(state.verify_results).toBeUndefined();
  });

  it('exit 0 + passing verify → completes and persists verify_results', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const coord = makeCoord();
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: process.cwd(), verifyCommand: PASS });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['epic-a']);
    expect(state.verify_results).toHaveLength(1);
    expect(state.verify_results[0]).toMatchObject({ task_id: 'epic-a', passed: true });
  });

  it('exit 0 + failing verify → NO complete; retries once; then blocks', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const coord = makeCoord();
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: process.cwd(), verifyCommand: FAIL });

    expect(ok).toBe(false);
    expect(coord.completed).toEqual([]); // floor blocked completeTask
    // Session re-spawned for the single retry; verify ran on both attempts.
    expect(spawnSession).toHaveBeenCalledTimes(2);
    expect(state.verify_results).toHaveLength(2);
    expect(state.verify_results.every((r) => r.passed === false)).toBe(true);
    expect(state.failed_tasks).toContain('epic-a');
    expect(coord.blocked[0].id).toBe('epic-a');
  });

  it('exit 0 first attempt fails verify, retry passes verify → completes', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const coord = makeCoord();
    const state = makeState();
    // Different verify each attempt: fail then pass via a temp marker.
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af8-floor-'));
    const marker = path.join(tmp, 'seen');
    const verify = [
      'node',
      '-e',
      `const f=${JSON.stringify(marker)};const fs=require('fs');if(fs.existsSync(f)){process.exit(0)}else{fs.writeFileSync(f,'x');process.exit(1)}`,
    ];

    const ok = runTask(task, coord, state, { projectRoot: tmp, verifyCommand: verify });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['epic-a']);
    expect(spawnSession).toHaveBeenCalledTimes(2);
    expect(state.verify_results.map((r) => r.passed)).toEqual([false, true]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('failed session never reaches verify (floor is exit-0-gated)', () => {
    spawnSession.mockReturnValue({ exitCode: 1, stdout: '', stderr: 'boom', costUsd: 0 });
    const coord = makeCoord();
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: process.cwd(), verifyCommand: PASS });

    expect(ok).toBe(false);
    expect(coord.completed).toEqual([]);
    // No verify result: the session failed both attempts, so the floor never ran.
    expect(state.verify_results).toBeUndefined();
    expect(coord.blocked[0].id).toBe('epic-a');
  });
});
