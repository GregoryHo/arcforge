/**
 * loop-verifier-floor.test.js — the verifier gate wired into runTask (loop.js),
 * layered ON TOP of the deterministic acceptance floor.
 *
 * spawnSession is mocked. The same mock serves both the implementer session and
 * the verifier session; they are distinguished by the verifier prompt's verdict
 * instruction. Acceptance criteria come from the D3 task itself, so no fixture
 * tree is needed. The verifier prompt body is injected through readFileSafe so
 * these assertions never depend on the prompt file being on disk — a real
 * missing file makes the gate SKIP, which would let these pass vacuously.
 *
 * Pins the end-to-end acceptance:
 *   - --verifier OFF → exactly one session.
 *   - FAIL → verbatim-feedback retry → PASS → task succeeds, attempts persisted.
 *   - FAIL exhausted → task fails with the last verdict recorded.
 *   - UNPARSEABLE verdict → task fails, NEVER inferred PASS.
 *   - verifier prompt unreadable → gate SKIPPED, floor still gates.
 */

jest.mock('../../scripts/lib/loop-session', () => ({
  spawnSession: jest.fn(),
  spawnSessionAsync: jest.fn(),
}));

const mockVerifier = { body: '# Verifier\nYou verify work.' };

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return {
    ...actual,
    readFileSafe: (filePath, fallback) =>
      typeof filePath === 'string' &&
      filePath.endsWith(`prompts${require('node:path').sep}verifier.md`)
        ? mockVerifier.body
        : actual.readFileSafe(filePath, fallback),
  };
});

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

/** Distinguish a verifier prompt from an implementer prompt by its verdict line. */
function isVerifierPrompt(prompt) {
  return typeof prompt === 'string' && prompt.includes('Final verdict: PASS');
}

const task = { id: 'T1', text: 'Implement the parser', verify: null, note: null };
const projectRoot = process.cwd();

beforeEach(() => {
  mockVerifier.body = '# Verifier\nYou verify work.';
  spawnSession.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('runTask verifier gate', () => {
  it('--verifier OFF → exactly one session, no verifier', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 0 });
    const state = makeState();

    const ok = runTask(task, state, { projectRoot });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    expect(spawnSession).toHaveBeenCalledTimes(1); // no verifier session
    expect(state.verifier_attempts).toBeUndefined();
  });

  it('verifier PASS → completes; one implementer + one verifier session', () => {
    spawnSession.mockImplementation((prompt) =>
      isVerifierPrompt(prompt)
        ? { exitCode: 0, stdout: 'Final verdict: PASS', stderr: '', costUsd: 0.2 }
        : { exitCode: 0, stdout: '', stderr: '', costUsd: 1 },
    );
    const state = makeState();

    const ok = runTask(task, state, { projectRoot, verifier: true });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    expect(spawnSession).toHaveBeenCalledTimes(2); // implementer + verifier
    expect(state.verifier_attempts).toHaveLength(1);
    expect(state.verifier_attempts[0].verdict).toBe('PASS');
    expect(state.total_cost).toBeCloseTo(1.2);
  });

  it("puts the task's own text and verify line into the verifier's criteria", () => {
    let verifierPrompt = null;
    spawnSession.mockImplementation((prompt) => {
      if (isVerifierPrompt(prompt)) {
        verifierPrompt = prompt;
        return { exitCode: 0, stdout: 'Final verdict: PASS', stderr: '', costUsd: 0 };
      }
      return { exitCode: 0, stdout: '', stderr: '', costUsd: 0 };
    });

    runTask({ ...task, verify: 'node -e "process.exit(0)"' }, makeState(), {
      projectRoot,
      verifier: true,
    });

    expect(verifierPrompt).toContain('Implement the parser');
    expect(verifierPrompt).toContain('node -e "process.exit(0)"');
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
    const state = makeState();

    const ok = runTask(task, state, { projectRoot, verifier: true });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    expect(state.verifier_attempts.map((a) => a.verdict)).toEqual(['FAIL', 'PASS']);
  });

  it('verifier FAIL exhausted → task fails with the last verdict recorded', () => {
    spawnSession.mockImplementation((prompt) =>
      isVerifierPrompt(prompt)
        ? { exitCode: 0, stdout: 'still broken\nFinal verdict: FAIL', stderr: '', costUsd: 0.1 }
        : { exitCode: 0, stdout: '', stderr: '', costUsd: 1 },
    );
    const state = makeState();

    const ok = runTask(task, state, { projectRoot, verifier: true, maxRetries: 1 });

    expect(ok).toBe(false);
    expect(state.completed_tasks).toEqual([]);
    expect(state.failed_tasks).toContain('T1');
    expect(state.errors.at(-1).error).toContain('FAIL');
  });

  it('verifier UNPARSEABLE verdict → task fails, never inferred PASS', () => {
    spawnSession.mockImplementation((prompt) =>
      isVerifierPrompt(prompt)
        ? { exitCode: 0, stdout: '### Assessment\nSHIP', stderr: '', costUsd: 0.1 }
        : { exitCode: 0, stdout: '', stderr: '', costUsd: 1 },
    );
    const state = makeState();

    const ok = runTask(task, state, { projectRoot, verifier: true });

    expect(ok).toBe(false);
    expect(state.completed_tasks).toEqual([]);
    expect(state.errors.at(-1).error).toContain('UNPARSEABLE');
  });
});

// --- Prompt-file degradation: the verify-command floor STILL gates -------------
// When the verifier prompt is unreadable the gate is SKIPPED with a warning. The
// deterministic floor must still gate, so the task only succeeds when the verify
// command passes (the skip never weakens the floor).

const PASS = ['node', '-e', 'process.exit(0)'];
const FAIL = ['node', '-e', 'process.exit(1)'];

describe('runTask verifier skip on an unreadable prompt — verify-cmd still gates', () => {
  beforeEach(() => {
    mockVerifier.body = ''; // readFileSafe fallback: prompt file unavailable
  });

  it('prompt missing + verify-cmd PASS → completes, verifier skipped, warning fires', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 1 });
    const state = makeState();

    const ok = runTask(task, state, { projectRoot, verifier: true, verifyCommand: PASS });

    expect(ok).toBe(true);
    expect(state.completed_tasks).toEqual(['T1']);
    // Exactly one (implementer) session — the verifier was skipped, not spawned.
    expect(spawnSession).toHaveBeenCalledTimes(1);
    expect(state.verifier_attempts).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Verifier skipped'));
  });

  it('prompt missing + verify-cmd FAIL → fails at the floor, verifier never reached', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: '', stderr: '', costUsd: 1 });
    const state = makeState();

    const ok = runTask(task, state, { projectRoot, verifier: true, verifyCommand: FAIL });

    expect(ok).toBe(false);
    expect(state.completed_tasks).toEqual([]);
    expect(state.failed_tasks).toContain('T1');
    // The floor failed both attempts → the verifier (and its skip path) never ran.
    expect(state.verifier_attempts).toBeUndefined();
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Verifier skipped'));
  });
});
