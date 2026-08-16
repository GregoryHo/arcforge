/**
 * loop-verify-floor.test.js — the deterministic acceptance floor inside runTask
 * (loop.js). spawnSession is mocked to control session exit/cost; the verify
 * command runs for real (an argv array via execFileSync, no shell).
 *
 * Invariants pinned here:
 *   - no floor configured → runTask completes on a clean session exit.
 *   - exit 0 + passing verify → task succeeds, verify_results persisted.
 *   - exit 0 + failing verify → task does NOT succeed; retries once; then fails.
 *   - failed session is never followed by a verify (floor is exit-0-gated).
 *
 * runTask never writes the task list — the caller (runLoop) owns every status
 * marker — so these assert its return value and the loop state it records.
 */

jest.mock('../../scripts/lib/loop-session', () => ({
  spawnSession: jest.fn(),
  spawnSessionAsync: jest.fn(),
}));

const { spawnSession } = require('../../scripts/lib/loop-session');
const { runTask } = require('../../scripts/loop');

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

const task = { id: 'T1', text: 'Task one', verify: null, note: null };
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
    const state = makeState();

    const ok = runTask(task, state, { projectRoot: process.cwd() });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    expect(spawnSession).toHaveBeenCalledTimes(1);
    expect(state.verify_results).toBeUndefined();
  });

  it('exit 0 + passing verify → completes and persists verify_results', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const state = makeState();

    const ok = runTask(task, state, { projectRoot: process.cwd(), verifyCommand: PASS });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    expect(state.verify_results).toHaveLength(1);
    expect(state.verify_results[0]).toMatchObject({ task_id: 'T1', passed: true });
  });

  it('exit 0 + failing verify → NO complete; retries once; then blocks', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const state = makeState();

    const ok = runTask(task, state, { projectRoot: process.cwd(), verifyCommand: FAIL });

    expect(ok).toBe(false);
    expect(state.completed_tasks).toEqual([]); // floor kept the task from succeeding
    // Session re-spawned for the single retry; verify ran on both attempts.
    expect(spawnSession).toHaveBeenCalledTimes(2);
    expect(state.verify_results).toHaveLength(2);
    expect(state.verify_results.every((r) => r.passed === false)).toBe(true);
    expect(state.failed_tasks).toContain('T1');
    expect(state.failed_tasks).toEqual(['T1']);
  });

  it('exit 0 first attempt fails verify, retry passes verify → completes', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
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

    const ok = runTask(task, state, { projectRoot: tmp, verifyCommand: verify });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    expect(spawnSession).toHaveBeenCalledTimes(2);
    expect(state.verify_results.map((r) => r.passed)).toEqual([false, true]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('failed session never reaches verify (floor is exit-0-gated)', () => {
    spawnSession.mockReturnValue({ exitCode: 1, stdout: '', stderr: 'boom', costUsd: 0 });
    const state = makeState();

    const ok = runTask(task, state, { projectRoot: process.cwd(), verifyCommand: PASS });

    expect(ok).toBe(false);
    expect(state.completed_tasks).toEqual([]);
    // No verify result: the session failed both attempts, so the floor never ran.
    expect(state.verify_results).toBeUndefined();
    expect(state.failed_tasks).toEqual(['T1']);
  });
});
