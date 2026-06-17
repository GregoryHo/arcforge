/**
 * loop-verifier.test.js — AF-9 verifier-agent gate + verbatim-feedback retry.
 *
 * Layered ON TOP of AF-8's deterministic floor. The verifier session spawn is a
 * stub callback (no real `claude -p`); the verdict is parsed from its text
 * result, never inferred from an exit code. Invariants pinned here:
 *   - parseVerdict: explicit `Final verdict:` line, last-wins, markdown-tolerant;
 *     SHIP/garbage/empty → null (the stub-vs-real divergence STOP signal).
 *   - --verifier OFF → no extra session, byte-identical (no-op gate).
 *   - FAIL → verbatim feedback re-spawn → PASS → completeTask.
 *   - FAIL exhausted → block with last verdict; attempts round-trip persisted.
 *   - UNPARSEABLE verdict → block, NEVER inferred PASS.
 *   - cost-stop > retry: maxCost crossing stops the retry without re-spawning.
 *   - S4-8: missing-criteria fixture → verifier skipped (not blocked).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_MAX_RETRIES,
  parseVerdict,
  loadVerifierBody,
  loadVerifierCriteria,
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

// --- agent body + assembly (read-only; never edits agents/verifier.md) ----------

describe('loadVerifierBody', () => {
  it('reads agents/verifier.md and strips frontmatter', () => {
    const body = loadVerifierBody();
    expect(body).toBeTruthy();
    expect(body.startsWith('---')).toBe(false);
    expect(body).toContain('Verifier');
  });
});

describe('assembleVerifierPrompt', () => {
  const base = {
    agentBody: 'AGENT BODY',
    task: { id: 'epic-a', name: 'Epic A' },
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

// --- S4-8 criteria degradation ladder ------------------------------------------

describe('loadVerifierCriteria (S4-8 degradation)', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af9-crit-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function coord(specId) {
    return { specId };
  }

  it('uses specs/<spec>/epics/<epic>/ markdown when present', () => {
    const dir = path.join(tmp, 'specs', 'spec1', 'epics', 'epic-a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'epic.md'), '# Acceptance\n- do the thing\n');
    const criteria = loadVerifierCriteria(coord('spec1'), { id: 'epic-a' }, tmp);
    expect(criteria).toContain('do the thing');
  });

  it('falls back to spec_path contents + feature names when epics/ dir absent', () => {
    fs.writeFileSync(path.join(tmp, 'spec-doc.md'), 'SPEC BODY CRITERIA');
    const epic = {
      id: 'epic-a',
      spec_path: 'spec-doc.md',
      features: [{ name: 'Feature One' }, { name: 'Feature Two' }],
    };
    const criteria = loadVerifierCriteria(coord('spec1'), epic, tmp);
    expect(criteria).toContain('SPEC BODY CRITERIA');
    expect(criteria).toContain('Feature One');
    expect(criteria).toContain('Feature Two');
  });

  it('returns empty string when no epics/, no spec_path, and no features', () => {
    const criteria = loadVerifierCriteria(coord('spec1'), { id: 'epic-a', features: [] }, tmp);
    expect(criteria).toBe('');
  });
});

// --- attempts round-trip persistence -------------------------------------------

describe('recordVerifierAttempt round-trip', () => {
  it('persists attempts to loop state and survives JSON serialize/parse', () => {
    const state = { iteration: 2, run_id: 'r1' };
    recordVerifierAttempt(state, 'epic-a', {
      attempt: 1,
      verdict: 'FAIL',
      feedback: 'x',
      cost_usd: 0.5,
    });
    recordVerifierAttempt(state, 'epic-a', {
      attempt: 2,
      verdict: 'PASS',
      feedback: '',
      cost_usd: 0.7,
    });
    const roundTripped = JSON.parse(JSON.stringify(state));
    expect(roundTripped.verifier_attempts).toHaveLength(2);
    expect(roundTripped.verifier_attempts[0]).toMatchObject({
      task_id: 'epic-a',
      attempt: 1,
      verdict: 'FAIL',
      run_id: 'r1',
    });
    expect(roundTripped.verifier_attempts[1].verdict).toBe('PASS');
  });
});

// --- runVerifierGate: the gate + retry sub-loop --------------------------------

describe('runVerifierGate', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af9-gate-'));
    // A resolvable criteria source so the gate does not skip on missing criteria.
    const dir = path.join(tmp, 'specs', 'spec1', 'epics', 'epic-a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'epic.md'), '# Acceptance\n- ship it\n');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const task = { id: 'epic-a', name: 'Epic A' };
  function ctxBase(overrides = {}) {
    return {
      coord: { specId: 'spec1' },
      task,
      state: { iteration: 1, total_cost: 0 },
      options: { verifier: true, maxRetries: 2, verifyCommand: ['true'] },
      cwd: tmp,
      projectRoot: tmp,
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

  it('S4-8: missing criteria → verifier SKIPPED (not blocked), no session, warning fires', () => {
    // Empty epic dir, no spec_path, no features → no criteria resolvable.
    const ctx = ctxBase({
      coord: { specId: 'spec-none' },
      task: { id: 'epic-z', name: 'Epic Z', features: [] },
    });
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
