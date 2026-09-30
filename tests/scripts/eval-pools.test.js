/**
 * eval-pools.test.js - Result rows pool by run conditions, never across them
 * (B-8: a pool is scenario version plus model, effort, ceiling, turn budget
 * and plugin dir).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  CONDITION_FIELDS,
  conditionOf,
  splitPools,
  describeCondition,
} = require('../../scripts/lib/eval-pools');
const { appendResult, loadResultPools, SCENARIOS_DIR } = require('../../scripts/lib/eval');
const { generateBenchmark } = require('../../scripts/lib/eval-benchmark');

const row = (overrides = {}) => ({
  eval: 'pooled',
  trial: 1,
  k: 5,
  passed: true,
  score: 1,
  grader: 'code',
  timestamp: '2026-09-30T10:00:00.000Z',
  model: 'default',
  effort: 'default',
  trialTimeoutMs: 900000,
  maxTurns: null,
  pluginDir: false,
  ...overrides,
});

describe('conditionOf', () => {
  it('reads the five run conditions, null when a row predates the field', () => {
    expect(CONDITION_FIELDS).toEqual([
      'model',
      'effort',
      'trialTimeoutMs',
      'maxTurns',
      'pluginDir',
    ]);
    expect(conditionOf({ model: 'opus' })).toEqual({
      model: 'opus',
      effort: null,
      trialTimeoutMs: null,
      maxTurns: null,
      pluginDir: null,
    });
  });
});

describe('splitPools', () => {
  it('keeps one condition as a single pool', () => {
    const rows = [row({ trial: 1 }), row({ trial: 2 })];
    const { current, others } = splitPools(rows);
    expect(current).toHaveLength(2);
    expect(others).toEqual([]);
  });

  it('uses the newest condition for the verdict and lists the others, never combined', () => {
    const old = [1, 2, 3].map((t) =>
      row({ trial: t, trialTimeoutMs: 1800000, passed: false, score: 0 }),
    );
    const fresh = [1, 2].map((t) => row({ trial: t, timestamp: '2026-09-30T12:00:00.000Z' }));
    const { current, conditions, others } = splitPools([...old, ...fresh]);
    expect(current).toHaveLength(2);
    expect(current.every((r) => r.passed)).toBe(true);
    expect(conditions.trialTimeoutMs).toBe(900000);
    expect(others).toEqual([
      { conditions: expect.objectContaining({ trialTimeoutMs: 1800000 }), rows: 3 },
    ]);
  });

  it('treats rows recorded before the conditions existed as a pool of their own', () => {
    const legacy = { eval: 'pooled', trial: 1, passed: true, score: 1, timestamp: '2026-08-01' };
    const { current, others } = splitPools([legacy, row()]);
    expect(current).toEqual([row()]);
    expect(others[0].rows).toBe(1);
    expect(describeCondition(others[0].conditions)).toContain('unrecorded');
  });
});

describe('readers pool by condition', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pools-'));
    const dir = path.join(tempDir, SCENARIOS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'pooled.md'),
      '# Eval: pooled\n\n## Scope\nagent\n\n## Scenario\nDo it.\n\n## Grader\ncode\n',
    );
    // An older pool at a 1800 s ceiling that failed, and a newer one at 900 s that passed.
    for (const t of [1, 2, 3]) {
      appendResult(
        row({
          trial: t,
          trialTimeoutMs: 1800000,
          passed: false,
          score: 0,
          runId: '20260929-100000',
        }),
        tempDir,
      );
    }
    for (const t of [1, 2]) {
      appendResult(
        row({ trial: t, timestamp: '2026-09-30T12:00:00.000Z', runId: '20260930-120000' }),
        tempDir,
      );
    }
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loadResultPools returns the newest pool and the others separately', () => {
    const { current, others } = loadResultPools('pooled', tempDir);
    expect(current).toHaveLength(2);
    expect(others).toHaveLength(1);
    expect(others[0].rows).toBe(3);
  });

  it('the benchmark judges the newest pool and reports the other pool beside it', () => {
    const entry = generateBenchmark(tempDir).evals.pooled;
    expect(entry.trials).toBe(2);
    expect(entry.pass_rate).toBe(1);
    expect(entry.other_pools).toEqual([
      { conditions: expect.objectContaining({ trialTimeoutMs: 1800000 }), rows: 3 },
    ]);
  });
});
