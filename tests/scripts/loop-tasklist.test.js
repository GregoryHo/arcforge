/**
 * loop-tasklist.test.js — runLoop over a D3 markdown task list (the loop's only
 * task source). spawnSession is mocked to control each session's exit/cost; the
 * task list is a real file in a temp dir and every status transition is read
 * back off disk, because the file IS the state.
 *
 * Invariants pinned here:
 *   - one iteration per task: pick → mark [~] → session → mark [x]
 *   - a failing task is marked [!] and stops the run (status: failed)
 *   - an in-progress task is resumed, not skipped (crash recovery)
 *   - the run stops with status `complete` when nothing is runnable
 *   - --max-runs and --max-cost stop the loop with their own status
 *   - a task's own `verify:` line is the floor for that task
 */

jest.mock('../../scripts/lib/loop-session', () => ({
  spawnSession: jest.fn(),
  spawnSessionAsync: jest.fn(),
}));

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSession } = require('../../scripts/lib/loop-session');
const { runLoop } = require('../../scripts/loop');

const BANNER =
  '> arcforge task list v1 — `[ ]` pending, `[~]` in-progress, `[x]` done, `[!]` blocked';

let tmpDir;
let tasksPath;

function writeTasks(body) {
  fs.writeFileSync(tasksPath, `# Tasks\n\n${BANNER}\n\n${body}`);
}

function readTasks() {
  return fs.readFileSync(tasksPath, 'utf8');
}

function options(overrides = {}) {
  return {
    tasksFile: 'tasks.md',
    projectRoot: tmpDir,
    maxRuns: 10,
    maxCost: null,
    verifier: false,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-d3-'));
  tasksPath = path.join(tmpDir, 'tasks.md');
  spawnSession.mockReset();
  spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runLoop over a task list', () => {
  it('runs one task per iteration and marks each done', () => {
    writeTasks('- [ ] T1 — First\n- [ ] T2 — Second\n');

    const state = runLoop(options());

    expect(spawnSession).toHaveBeenCalledTimes(2);
    expect(readTasks()).toContain('- [x] T1 — First');
    expect(readTasks()).toContain('- [x] T2 — Second');
    expect(state.completed_tasks).toEqual(['T1', 'T2']);
    expect(state.status).toBe('complete');
  });

  it('marks a task in-progress before spawning its session', () => {
    writeTasks('- [ ] T1 — First\n');
    // Read the file from inside the session to prove the marker is [~] while
    // the task is running — the crash-recovery contract depends on it.
    let markerDuringRun = null;
    spawnSession.mockImplementation(() => {
      markerDuringRun = readTasks().match(/- \[(.)\] T1/)[1];
      return { exitCode: 0, stdout: '', stderr: '', costUsd: 0 };
    });

    runLoop(options());

    expect(markerDuringRun).toBe('~');
  });

  it('resumes a task left in-progress by a dead run instead of skipping it', () => {
    writeTasks('- [~] T1 — Interrupted\n- [ ] T2 — Later\n');

    const state = runLoop(options());

    expect(state.completed_tasks).toEqual(['T1', 'T2']);
  });

  it('blocks the task and stops the run when its session keeps failing', () => {
    writeTasks('- [ ] T1 — Doomed\n- [ ] T2 — Never reached\n');
    spawnSession.mockReturnValue({ exitCode: 1, stdout: '', stderr: 'boom', costUsd: 0 });

    const state = runLoop(options());

    expect(readTasks()).toContain('- [!] T1 — Doomed');
    expect(readTasks()).toContain('- [ ] T2 — Never reached');
    expect(state.failed_tasks).toEqual(['T1']);
    expect(state.status).toBe('failed');
    // One spawn plus the single retry, then stop — T2 is never started.
    expect(spawnSession).toHaveBeenCalledTimes(2);
  });

  it('reports `blocked` (not `complete`) when only blocked tasks remain', () => {
    writeTasks('- [x] T1 — Done\n- [!] T2 — Stuck\n  - note: waiting on credentials\n');

    const state = runLoop(options());

    expect(state.status).toBe('blocked');
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it("runs a task's own verify: line as that task's acceptance floor", () => {
    writeTasks('- [ ] T1 — Passes\n  - verify: `node -e "process.exit(0)"`\n');

    const state = runLoop(options());

    expect(state.verify_results).toHaveLength(1);
    expect(state.verify_results[0]).toMatchObject({ task_id: 'T1', passed: true });
    expect(readTasks()).toContain('- [x] T1');
  });

  it('blocks a task whose own verify: line fails, even on a clean session exit', () => {
    writeTasks('- [ ] T1 — Lies\n  - verify: `node -e "process.exit(1)"`\n');

    const state = runLoop(options());

    expect(readTasks()).toContain('- [!] T1');
    expect(state.completed_tasks).toEqual([]);
    expect(state.status).toBe('failed');
  });

  it('blocks a task whose verify line needs a shell rather than crashing the run', () => {
    writeTasks('- [ ] T1 — Piped\n  - verify: `npm test | tee out.log`\n');

    const state = runLoop(options());

    expect(readTasks()).toContain('- [!] T1');
    expect(spawnSession).not.toHaveBeenCalled();
    expect(state.errors[0].error).toMatch(/unusable verify command/);
  });

  it('stops at --max-runs with the max_runs status', () => {
    writeTasks('- [ ] T1 — One\n- [ ] T2 — Two\n- [ ] T3 — Three\n');

    const state = runLoop(options({ maxRuns: 2 }));

    expect(state.status).toBe('max_runs');
    expect(state.completed_tasks).toEqual(['T1', 'T2']);
    expect(readTasks()).toContain('- [ ] T3 — Three');
  });

  it('stops at --max-cost with the cost_limit status', () => {
    writeTasks('- [ ] T1 — One\n- [ ] T2 — Two\n');
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 5 });

    const state = runLoop(options({ maxCost: 4 }));

    expect(state.status).toBe('cost_limit');
    expect(state.completed_tasks).toEqual(['T1']);
  });

  it('picks up a task a human appended to the list mid-run', () => {
    writeTasks('- [ ] T1 — First\n');
    spawnSession.mockImplementation(() => {
      if (!readTasks().includes('T2')) {
        fs.appendFileSync(tasksPath, '- [ ] T2 — Added by a human\n');
      }
      return { exitCode: 0, stdout: '', stderr: '', costUsd: 0 };
    });

    const state = runLoop(options());

    expect(state.completed_tasks).toEqual(['T1', 'T2']);
  });

  it('resumes over a list it blocked itself (a loop-written [!] has no note:)', () => {
    writeTasks('- [ ] T1 — Doomed\n- [ ] T2 — Later\n');
    spawnSession.mockReturnValue({ exitCode: 1, stdout: '', stderr: 'boom', costUsd: 0 });
    runLoop(options());
    expect(readTasks()).toContain('- [!] T1');

    // Second run over the loop's own output must start, not die on the
    // blocked-with-no-note rule (see validateTaskListForRun).
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const state = runLoop(options());

    expect(state.completed_tasks).toContain('T2');
  });

  it('still rejects a duplicate id when the blocked-note rule was swallowed', () => {
    // The block-note swallow must not let later semantic rules through: a
    // duplicate id would make updateTaskStatus mark the wrong task.
    writeTasks('- [!] T1 — Blocked by a prior run\n- [ ] T2 — Work\n- [ ] T2 — Same id\n');

    expect(() => runLoop(options())).toThrow(/duplicate task id T2/);
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it('throws before spawning anything when the list is malformed', () => {
    writeTasks('- [?] T1 — Bad marker\n');

    expect(() => runLoop(options())).toThrow(/unknown status marker/);
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it('throws when --tasks names a file that does not exist', () => {
    expect(() => runLoop(options({ tasksFile: 'nope.md' }))).toThrow(/Failed to read task list/);
  });

  it('records the task list it ran against in loop state', () => {
    writeTasks('- [ ] T1 — First\n');

    const state = runLoop(options());

    expect(state.tasks_file).toBe('tasks.md');
    expect(state.pattern).toBe('tasks');
  });
});
