/**
 * loop-verifier.test.js — verifier-agent gate + verbatim-feedback retry.
 *
 * Layered ON TOP of the deterministic floor. The verifier session spawn is a
 * stub callback (no real `claude -p`); the verdict is parsed from its text
 * result, never inferred from an exit code. Invariants pinned here:
 *   - parseVerdict: explicit `Final verdict:` line, last-wins, markdown-tolerant;
 *     SHIP/garbage/empty → null (the stub-vs-real divergence STOP signal).
 *   - --verifier OFF → no extra session (no-op gate).
 *   - FAIL → verbatim feedback re-spawn → PASS → passes.
 *   - FAIL exhausted → fail with last verdict; attempts round-trip persisted.
 *   - UNPARSEABLE verdict → fail, NEVER inferred PASS.
 *   - cost-stop > retry: maxCost crossing stops the retry without re-spawning.
 *   - unreadable verifier prompt → gate skipped (not blocked).
 *
 * The verifier prompt body is injected through readFileSafe: the gate SKIPS on
 * an unreadable prompt file, so depending on the real file would make every
 * gate assertion pass vacuously if it ever moved.
 */

const mockVerifier = { body: '---\nname: verifier\n---\n# Verifier\nYou verify work.' };

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  const { sep } = require('node:path');
  return {
    ...actual,
    readFileSafe: (filePath, fallback) =>
      typeof filePath === 'string' && filePath.endsWith(`prompts${sep}verifier.md`)
        ? mockVerifier.body
        : actual.readFileSafe(filePath, fallback),
  };
});

const path = require('node:path');

const {
  DEFAULT_MAX_RETRIES,
  VERIFIER_AGENT_PATH,
  parseVerdict,
  loadVerifierBody,
  buildTaskCriteria,
  assembleVerifierPrompt,
  recordVerifierAttempt,
  runVerifierGate,
} = require('../../scripts/lib/loop-verifier');

// --- parseVerdict: the verdict-protocol STOP boundary --------------------------

describe('parseVerdict', () => {
  it('parses an explicit PASS line', () => {
    expect(parseVerdict('evidence...\nFinal verdict: PASS')).toBe('PASS');
  });
  it('parses an explicit FAIL line', () => {
    expect(parseVerdict('Final verdict: FAIL\n')).toBe('FAIL');
  });
  it('tolerates markdown emphasis and whitespace', () => {
    expect(parseVerdict('  **Final verdict:  PASS** ')).toBe('PASS');
  });
  it('takes the LAST verdict line when multiple appear', () => {
    expect(parseVerdict('Final verdict: FAIL\nrecheck\nFinal verdict: PASS')).toBe('PASS');
  });
  it('returns null for SHIP-only output (verifier.md vocabulary divergence)', () => {
    // The agent body's own report format says SHIP/NEEDS WORK/BLOCKED — that must
    // NEVER be mapped to PASS. No `Final verdict:` line → null → block.
    expect(parseVerdict('### Final Assessment\nSHIP')).toBeNull();
  });
  it('returns null for garbage / no verdict line', () => {
    expect(parseVerdict('lorem ipsum, all good, looks fine')).toBeNull();
  });
  it('returns null for empty / non-string input', () => {
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict(undefined)).toBeNull();
  });
});

// --- prompt location + body loading (read-only; never edits the prompt) --------

describe('VERIFIER_AGENT_PATH', () => {
  it('points at the engine-side prompt, not a skill or agents/ directory', () => {
    expect(
      VERIFIER_AGENT_PATH.endsWith(path.join('scripts', 'lib', 'prompts', 'verifier.md')),
    ).toBe(true);
  });
});

describe('loadVerifierBody', () => {
  it('reads the verifier prompt and strips frontmatter', () => {
    const body = loadVerifierBody();
    expect(body).toBeTruthy();
    expect(body.startsWith('---')).toBe(false);
    expect(body).toContain('Verifier');
  });

  it('returns null when the prompt file is unreadable', () => {
    const saved = mockVerifier.body;
    mockVerifier.body = '';
    expect(loadVerifierBody()).toBeNull();
    mockVerifier.body = saved;
  });
});

describe('assembleVerifierPrompt', () => {
  const base = {
    agentBody: 'AGENT BODY',
    task: { id: 'T1', text: 'Implement the parser' },
    criteria: 'criterion one',
    verifyCommand: ['npm', 'test'],
  };

  it('layers body + criteria + verify-cmd evidence + verdict override', () => {
    const prompt = assembleVerifierPrompt(base);
    expect(prompt).toContain('AGENT BODY');
    expect(prompt).toContain('criterion one');
    expect(prompt).toContain('npm test');
    expect(prompt).toContain('Final verdict: PASS');
    expect(prompt).toContain('Final verdict: FAIL');
    // The override must forcefully supersede the SHIP/NEEDS WORK/BLOCKED wording.
    expect(prompt).toContain('Disregard the SHIP');
  });

  it('prepends verbatim feedback when provided', () => {
    const prompt = assembleVerifierPrompt({ ...base, feedback: 'PRIOR FAIL DETAIL' });
    expect(prompt).toContain('PRIOR FAIL DETAIL');
    expect(prompt.indexOf('PRIOR FAIL DETAIL')).toBeLessThan(prompt.indexOf('AGENT BODY'));
  });
});

// --- acceptance criteria come from the D3 task itself --------------------------

describe('buildTaskCriteria', () => {
  it("uses the task's text as the criterion", () => {
    expect(buildTaskCriteria({ id: 'T1', text: 'Implement the parser' })).toContain(
      'Implement the parser',
    );
  });

  it("includes the task's own verify command as a hard criterion", () => {
    const criteria = buildTaskCriteria({ id: 'T1', text: 'Do it', verify: 'npm test' });
    expect(criteria).toContain('npm test');
  });

  it("includes the task's note when present", () => {
    const criteria = buildTaskCriteria({ id: 'T1', text: 'Do it', note: 'blocked on creds' });
    expect(criteria).toContain('blocked on creds');
  });

  it('never returns empty for a task with text — the gate always has criteria', () => {
    expect(buildTaskCriteria({ id: 'T1', text: 'Do it' })).not.toBe('');
  });
});

// --- attempts round-trip persistence -------------------------------------------

describe('recordVerifierAttempt round-trip', () => {
  it('persists attempts to loop state and survives JSON serialize/parse', () => {
    const state = { iteration: 2, run_id: 'r1' };
    recordVerifierAttempt(state, 'T1', {
      attempt: 1,
      verdict: 'FAIL',
      feedback: 'x',
      cost_usd: 0.5,
    });
    recordVerifierAttempt(state, 'T1', {
      attempt: 2,
      verdict: 'PASS',
      feedback: '',
      cost_usd: 0.7,
    });
    const roundTripped = JSON.parse(JSON.stringify(state));
    expect(roundTripped.verifier_attempts).toHaveLength(2);
    expect(roundTripped.verifier_attempts[0]).toMatchObject({
      task_id: 'T1',
      attempt: 1,
      verdict: 'FAIL',
      run_id: 'r1',
    });
    expect(roundTripped.verifier_attempts[1].verdict).toBe('PASS');
  });
});

// --- runVerifierGate: the gate + retry sub-loop --------------------------------

describe('runVerifierGate', () => {
  beforeEach(() => {
    mockVerifier.body = '# Verifier\nYou verify work.';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const task = { id: 'T1', text: 'Implement the parser' };
  function ctxBase(overrides = {}) {
    return {
      task,
      state: { iteration: 1, total_cost: 0 },
      options: { verifier: true, maxRetries: 2, verifyCommand: ['true'] },
      cwd: process.cwd(),
      spawnImplementer: jest.fn(() => ({ exitCode: 0, stdout: '', costUsd: 1 })),
      spawnVerifier: jest.fn(),
      buildImplementerPrompt: (fb) => `IMPL ${fb}`,
      runFloor: jest.fn(() => true),
      ...overrides,
    };
  }

  it('--verifier OFF → no-op, NO verifier session spawned (byte-identical)', () => {
    const ctx = ctxBase({ options: { verifier: false } });
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(true);
    expect(out.skipped).toBe(true);
    expect(ctx.spawnVerifier).not.toHaveBeenCalled();
    expect(ctx.spawnImplementer).not.toHaveBeenCalled();
  });

  it('verdict PASS first try → passes, no implementer re-spawn', () => {
    const ctx = ctxBase();
    ctx.spawnVerifier.mockReturnValue({ exitCode: 0, stdout: 'Final verdict: PASS', costUsd: 0.3 });
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(true);
    expect(ctx.spawnImplementer).not.toHaveBeenCalled();
    expect(ctx.state.verifier_attempts).toHaveLength(1);
    expect(ctx.state.total_cost).toBeCloseTo(0.3);
  });

  it('FAIL → verbatim feedback re-spawn → PASS → passes', () => {
    const ctx = ctxBase();
    ctx.spawnVerifier
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: 'missing test X\nFinal verdict: FAIL',
        costUsd: 0.2,
      })
      .mockReturnValueOnce({ exitCode: 0, stdout: 'Final verdict: PASS', costUsd: 0.2 });
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(true);
    expect(ctx.spawnImplementer).toHaveBeenCalledTimes(1);
    // The implementer re-spawn received the verbatim FAIL feedback.
    expect(ctx.spawnImplementer.mock.calls[0][0]).toContain('missing test X');
    expect(ctx.state.verifier_attempts.map((a) => a.verdict)).toEqual(['FAIL', 'PASS']);
  });

  it('FAIL exhausted → blocked with last verdict; attempts persisted', () => {
    const ctx = ctxBase({ options: { verifier: true, maxRetries: 1, verifyCommand: ['true'] } });
    ctx.spawnVerifier.mockReturnValue({
      exitCode: 0,
      stdout: 'nope\nFinal verdict: FAIL',
      costUsd: 0.1,
    });
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(false);
    expect(out.verdict).toBe('FAIL');
    // maxRetries=1 → 2 verifier attempts (initial + 1 retry), 1 implementer re-spawn.
    expect(ctx.spawnVerifier).toHaveBeenCalledTimes(2);
    expect(ctx.spawnImplementer).toHaveBeenCalledTimes(1);
    expect(ctx.state.verifier_attempts).toHaveLength(2);
  });

  it('UNPARSEABLE verdict → blocked, NEVER inferred PASS (verifier exit 0)', () => {
    const ctx = ctxBase();
    // SHIP-only — the agent body's own vocabulary, no parseable verdict line.
    ctx.spawnVerifier.mockReturnValue({
      exitCode: 0,
      stdout: '### Assessment\nSHIP',
      costUsd: 0.1,
    });
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(false);
    expect(out.unparseable).toBe(true);
    expect(out.verdict).toBeNull();
    // No retry on unparseable — it blocks immediately for escalation.
    expect(ctx.spawnImplementer).not.toHaveBeenCalled();
  });

  it('cost-stop > retry: maxCost crossing stops retry without re-spawning implementer', () => {
    const ctx = ctxBase({
      options: { verifier: true, maxRetries: 5, maxCost: 1, verifyCommand: ['true'] },
      state: { iteration: 1, total_cost: 0 },
    });
    // First verifier FAILs and its cost crosses maxCost (1) → no implementer re-spawn.
    ctx.spawnVerifier.mockReturnValue({
      exitCode: 0,
      stdout: 'fail\nFinal verdict: FAIL',
      costUsd: 1.5,
    });
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(false);
    expect(out.verdict).toBe('FAIL');
    expect(ctx.spawnVerifier).toHaveBeenCalledTimes(1);
    expect(ctx.spawnImplementer).not.toHaveBeenCalled();
  });

  it('unreadable verifier prompt → gate SKIPPED (not blocked), no session, warning fires', () => {
    mockVerifier.body = '';
    const ctx = ctxBase();
    const out = runVerifierGate(ctx);
    expect(out.passed).toBe(true);
    expect(out.skipped).toBe(true);
    expect(ctx.spawnVerifier).not.toHaveBeenCalled();
    // The skip must emit a warning (acceptance: "verifier 跳過 + warning").
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Verifier skipped'));
  });
});

describe('DEFAULT_MAX_RETRIES', () => {
  it('defaults to 2', () => {
    expect(DEFAULT_MAX_RETRIES).toBe(2);
  });
});
