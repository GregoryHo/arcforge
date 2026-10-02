/**
 * eval-dashboard-instrument-failure.test.js - the dashboard says what `eval list`
 * and `eval compare` say about an error-only pool (#212): the scenario has no
 * scored runs, the pool is an instrument failure, and no comparison or other
 * pool's verdict stands in for it.
 */

const fs = require('node:fs');

const { createRouter } = require('../../scripts/lib/eval-dashboard/eval-dashboard');
const {
  makeTempDir,
  writeScenario,
  writeResult,
  callRouter,
} = require('./eval-dashboard-fixtures');

const FAILURE_LINE = /^Instrument failure, not a measurement: 1 row\(s\) under model unrecorded/;
const ARM_FAILURE_LINE =
  /^Instrument failure, not a measurement \(treatment\): 1 row\(s\) under model unrecorded/;

const row = (extra) => ({
  trial: 1,
  k: 1,
  grader: 'code',
  timestamp: '2026-03-20T10:00:00Z',
  ...extra,
});
const scored = row({ passed: true, score: 1 });
const failed = row({ passed: false, score: 0, infraError: true });

function scenario(dir, scope) {
  writeScenario(
    dir,
    'x.md',
    `# Eval: x\n\n## Scope\n${scope}\n\n## Scenario\nDo it.\n\n## Grader\ncode\n`,
  );
}

describe('dashboard on an error-only pool (#212)', () => {
  let tempDir;
  let router;

  beforeEach(() => {
    tempDir = makeTempDir();
    router = createRouter(tempDir, '');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const scenarios = () => callRouter(router, '/api/scenarios').json().scenarios;

  it('(a) marks the scenario NO SCORED RUNS, not an unrelated plain pool’s verdict', () => {
    scenario(tempDir, 'skill');
    writeResult(tempDir, 'x', '20260320-100000', 'treatment', [failed]);
    writeResult(tempDir, 'x', '20260319-100000', 'results', [
      { ...scored, timestamp: '2026-03-19T10:00:00Z' },
    ]);

    const [s] = scenarios();

    expect(s.status).toBe('NO SCORED RUNS');
    expect(s.failureLines).toEqual([expect.stringMatching(FAILURE_LINE)]);
  });

  it('(b) refuses the comparison when the only treatment pool failed', () => {
    scenario(tempDir, 'skill');
    writeResult(tempDir, 'x', '20260320-100000', 'treatment', [failed]);

    const [s] = scenarios();
    const compare = callRouter(router, '/api/compare/x');

    expect(s.status).toBe('NO SCORED RUNS');
    expect(compare.status).toBe(409);
    expect(compare.json().error).toMatch(/^The treatment arm has no scored trial/);
    expect(compare.json().poolLines).toEqual([expect.stringMatching(ARM_FAILURE_LINE)]);
  });

  it('(c) leaves a scored A/B comparison as it was', () => {
    scenario(tempDir, 'skill');
    writeResult(tempDir, 'x', '20260320-100000', 'baseline', [
      { ...scored, passed: false, score: 0.2 },
    ]);
    writeResult(tempDir, 'x', '20260320-100000', 'treatment', [scored]);

    const [s] = scenarios();
    const compare = callRouter(router, '/api/compare/x');

    expect(s).toMatchObject({ status: 'SHIP', failureLines: [] });
    expect(compare.status).toBe(200);
    expect(compare.json().poolLines).toEqual([]);
  });

  it('(d) leaves a plain single-condition scenario as it was', () => {
    scenario(tempDir, 'model');
    writeResult(tempDir, 'x', '20260320-100000', 'results', [scored]);

    expect(scenarios()[0]).toMatchObject({ status: 'SHIP', failureLines: [] });
  });

  it('(e) names the instrument failure, not a conditions mismatch, beside a scored baseline', () => {
    scenario(tempDir, 'skill');
    writeResult(tempDir, 'x', '20260320-100000', 'baseline', [scored]);
    writeResult(tempDir, 'x', '20260320-100000', 'treatment', [failed]);

    const [s] = scenarios();
    const compare = callRouter(router, '/api/compare/x');

    expect(s.status).toBe('NO SCORED RUNS');
    expect(compare.status).toBe(409);
    expect(compare.json().error).toMatch(/^The treatment arm has no scored trial/);
    expect(compare.json().poolLines).toEqual([
      expect.stringMatching(/^Not combined \(baseline\): 1 row\(s\)/),
      expect.stringMatching(ARM_FAILURE_LINE),
    ]);
  });
});
