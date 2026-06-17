/**
 * loop-verifier-dag.test.js — AF-9 verifier gate in the DAG path (loop-dag.js).
 *
 * Pins the dag-specific invariant: the verifier session is spawned in the epic's
 * OWN worktree cwd (never the base projectRoot), and its cost is accounted into
 * loop state. The verifier + verbatim-feedback retries run synchronously in the
 * integration phase via the sync spawnSession (the initial concurrent batch
 * already ran), so both reuse the same mock.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('../../scripts/lib/loop-session', () => ({
  spawnSession: jest.fn(),
  spawnSessionAsync: jest.fn(),
}));

const { spawnSession } = require('../../scripts/lib/loop-session');
const { verifyEpicAgent } = require('../../scripts/lib/loop-dag');

let tmp;
let worktree;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af9-dag-'));
  worktree = path.join(tmp, 'worktree-epic-a');
  fs.mkdirSync(worktree, { recursive: true });
  // Criteria fixture under projectRoot so the gate has non-empty criteria.
  const dir = path.join(tmp, 'specs', 'spec1', 'epics', 'epic-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'epic.md'), '# Acceptance\n- ship it\n');
  spawnSession.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function makeCoord() {
  return {
    specId: 'spec1',
    blocked: [],
    blockTask(id, reason) {
      this.blocked.push({ id, reason });
    },
  };
}

const epic = { id: 'epic-a', name: 'Epic A' };
const buildTaskPrompt = (_t, _c, _root, _ws) => 'IMPL PROMPT';

describe('verifyEpicAgent (dag)', () => {
  it('--verifier OFF → no-op, no verifier session', () => {
    const coord = makeCoord();
    const state = { iteration: 1, total_cost: 0, failed_tasks: [], errors: [] };
    const ok = verifyEpicAgent(coord, epic, worktree, state, { verifier: false }, buildTaskPrompt);
    expect(ok).toBe(true);
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it('spawns the verifier in the epic WORKTREE cwd and accounts cost', () => {
    spawnSession.mockReturnValue({ exitCode: 0, stdout: 'Final verdict: PASS', costUsd: 0.4 });
    const coord = makeCoord();
    const state = { iteration: 1, total_cost: 0, failed_tasks: [], errors: [] };
    const options = { verifier: true, maxRetries: 2, projectRoot: tmp, verifyCommand: null };

    const ok = verifyEpicAgent(coord, epic, worktree, state, options, buildTaskPrompt);

    expect(ok).toBe(true);
    expect(spawnSession).toHaveBeenCalledTimes(1);
    // cwd argument (2nd positional) is the epic worktree, not the base projectRoot.
    expect(spawnSession.mock.calls[0][1]).toBe(worktree);
    expect(state.total_cost).toBeCloseTo(0.4);
    expect(state.verifier_attempts[0].verdict).toBe('PASS');
  });

  it('FAIL exhausted → blocks the epic with the last verdict', () => {
    spawnSession.mockImplementation((prompt) =>
      prompt.includes('Final verdict: PASS')
        ? { exitCode: 0, stdout: 'broken\nFinal verdict: FAIL', costUsd: 0.1 }
        : { exitCode: 0, stdout: '', costUsd: 0.5 },
    );
    const coord = makeCoord();
    const state = { iteration: 1, total_cost: 0, failed_tasks: [], errors: [] };
    const options = { verifier: true, maxRetries: 1, projectRoot: tmp, verifyCommand: null };

    const ok = verifyEpicAgent(coord, epic, worktree, state, options, buildTaskPrompt);

    expect(ok).toBe(false);
    expect(coord.blocked[0].id).toBe('epic-a');
    expect(coord.blocked[0].reason).toContain('FAIL');
    expect(state.failed_tasks).toContain('epic-a');
  });
});
