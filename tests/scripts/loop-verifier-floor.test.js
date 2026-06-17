/**
 * loop-verifier-floor.test.js — AF-9 verifier gate wired into the SEQUENTIAL
 * runTask path (loop.js), layered ON TOP of AF-8's deterministic floor.
 *
 * spawnSession is mocked. The same mock serves both the implementer session and
 * the verifier session; they are distinguished by the verifier prompt's verdict
 * instruction. Criteria resolve from a temp specs/<spec>/epics/<epic>/ fixture so
 * the gate does not skip. Pins the end-to-end acceptance:
 *   - --verifier OFF → exactly one session (byte-identical to AF-8).
 *   - FAIL → verbatim-feedback retry → PASS → completeTask, attempts persisted.
 *   - FAIL exhausted → blocked with the last verdict (no completeTask).
 *   - UNPARSEABLE verdict → blocked, NEVER inferred PASS.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('../../scripts/lib/loop-session', () => ({
  spawnSession: jest.fn(),
  spawnSessionAsync: jest.fn(),
}));

const { spawnSession } = require('../../scripts/lib/loop-session');
const { runTask } = require('../../scripts/loop');

/** Coordinator stub: records complete/block; taskContext throws (tolerated). */
function makeCoord(projectRoot) {
  return {
    completed: [],
    blocked: [],
    specId: 'spec1',
    projectRoot,
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

/** Distinguish a verifier prompt from an implementer prompt by its verdict line. */
function isVerifierPrompt(prompt) {
  return typeof prompt === 'string' && prompt.includes('Final verdict: PASS');
}

const task = { id: 'epic-a', name: 'Epic A' };
let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af9-floor-'));
  // Criteria fixture so the gate has non-empty criteria (no S4-8 skip).
  const dir = path.join(tmp, 'specs', 'spec1', 'epics', 'epic-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'epic.md'), '# Acceptance\n- the criterion\n');
  spawnSession.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('runTask verifier gate (sequential)', () => {
  it('--verifier OFF → exactly one session, no verifier (byte-identical)', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: tmp });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['epic-a']);
    expect(spawnSession).toHaveBeenCalledTimes(1); // no verifier session
    expect(state.verifier_attempts).toBeUndefined();
  });

  it('verifier PASS → completes; one implementer + one verifier session', () => {
    spawnSession.mockImplementation((prompt) =>
      isVerifierPrompt(prompt)
        ? { exitCode: 0, stdout: 'Final verdict: PASS', stderr: '', costUsd: 0.2 }
        : { exitCode: 0, stdout: '', stderr: '', costUsd: 1 },
    );
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: tmp, verifier: true });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['epic-a']);
    expect(spawnSession).toHaveBeenCalledTimes(2); // implementer + verifier
    expect(state.verifier_attempts).toHaveLength(1);
    expect(state.verifier_attempts[0].verdict).toBe('PASS');
    expect(state.total_cost).toBeCloseTo(1.2);
  });

  it('verifier FAIL → verbatim-feedback retry → PASS → completes', () => {
    let verifierCalls = 0;
    spawnSession.mockImplementation((prompt) => {
      if (isVerifierPrompt(prompt)) {
        verifierCalls++;
        return verifierCalls === 1
          ? {
              exitCode: 0,
              stdout: 'missing coverage\nFinal verdict: FAIL',
              stderr: '',
              costUsd: 0.2,
            }
          : { exitCode: 0, stdout: 'Final verdict: PASS', stderr: '', costUsd: 0.2 };
      }
      return { exitCode: 0, stdout: '', stderr: '', costUsd: 1 };
    });
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: tmp, verifier: true });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['epic-a']);
    expect(state.verifier_attempts.map((a) => a.verdict)).toEqual(['FAIL', 'PASS']);
  });

  it('verifier FAIL exhausted → blocked with last verdict, no complete', () => {
    spawnSession.mockImplementation((prompt) =>
      isVerifierPrompt(prompt)
        ? { exitCode: 0, stdout: 'still broken\nFinal verdict: FAIL', stderr: '', costUsd: 0.1 }
        : { exitCode: 0, stdout: '', stderr: '', costUsd: 1 },
    );
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: tmp, verifier: true, maxRetries: 1 });

    expect(ok).toBe(false);
    expect(coord.completed).toEqual([]);
    expect(coord.blocked[0].id).toBe('epic-a');
    expect(coord.blocked[0].reason).toContain('FAIL');
    expect(state.failed_tasks).toContain('epic-a');
  });

  it('verifier UNPARSEABLE verdict → blocked, never inferred PASS', () => {
    spawnSession.mockImplementation((prompt) =>
      isVerifierPrompt(prompt)
        ? { exitCode: 0, stdout: '### Assessment\nSHIP', stderr: '', costUsd: 0.1 }
        : { exitCode: 0, stdout: '', stderr: '', costUsd: 1 },
    );
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(task, coord, state, { projectRoot: tmp, verifier: true });

    expect(ok).toBe(false);
    expect(coord.completed).toEqual([]);
    expect(coord.blocked[0].reason).toContain('UNPARSEABLE');
  });
});

// --- S4-8: missing-criteria degradation, the verify-cmd floor STILL gates -------
// An epic with no epics/ dir, no spec_path, and no features → no criteria → the
// verifier is SKIPPED with a warning. The deterministic floor must still gate, so
// the task only completes when verify-cmd passes (the skip never weakens the floor).

const PASS = ['node', '-e', 'process.exit(0)'];
const FAIL = ['node', '-e', 'process.exit(1)'];

describe('runTask verifier skip on missing criteria — verify-cmd still gates', () => {
  // A no-fixture epic: makeCoord's specId (spec1) has no epics/no-crit/ dir, and
  // this task carries no spec_path/features → loadVerifierCriteria returns ''.
  const noCritTask = { id: 'no-crit', name: 'No Criteria Epic' };

  it('missing criteria + verify-cmd PASS → completes, verifier skipped, warning fires', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 1 });
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(noCritTask, coord, state, {
      projectRoot: tmp,
      verifier: true,
      verifyCommand: PASS,
    });

    expect(ok).toBe(true);
    expect(coord.completed).toEqual(['no-crit']);
    // Exactly one (implementer) session — the verifier was skipped, not spawned.
    expect(spawnSession).toHaveBeenCalledTimes(1);
    expect(state.verifier_attempts).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Verifier skipped'));
  });

  it('missing criteria + verify-cmd FAIL → blocked at the floor, verifier never reached', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 1 });
    const coord = makeCoord(tmp);
    const state = makeState();

    const ok = runTask(noCritTask, coord, state, {
      projectRoot: tmp,
      verifier: true,
      verifyCommand: FAIL,
    });

    expect(ok).toBe(false);
    expect(coord.completed).toEqual([]);
    expect(coord.blocked[0].id).toBe('no-crit');
    // The floor failed both attempts → the verifier (and its skip path) never ran.
    expect(state.verifier_attempts).toBeUndefined();
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Verifier skipped'));
  });
});
