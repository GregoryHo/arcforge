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
  isolation: 'isolated',
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
      'isolation',
    ]);
    expect(conditionOf({ model: 'opus' })).toEqual({
      model: 'opus',
      effort: null,
      trialTimeoutMs: null,
      maxTurns: null,
      pluginDir: null,
      isolation: null,
    });
  });
});

describe('error-only pools are instrument failures, never the measurement', () => {
  const { pairArms } = require('../../scripts/lib/eval-pools');
  const refusal = (overrides) =>
    row({
      passed: false,
      score: 0,
      infraError: true,
      errorType: 'provider_refusal',
      model: 'opus',
      timestamp: '2026-09-30T12:00:00.000Z',
      ...overrides,
    });

  it('keeps the previous scorable pool current when the newest pool is all errors', () => {
    const scored = [1, 2].map((t) => row({ trial: t }));
    const failed = [1, 2, 3].map((t) => refusal({ trial: t }));
    const { current, others } = splitPools([...scored, ...failed]);
    expect(current).toEqual(scored);
    expect(others).toEqual([
      {
        conditions: expect.objectContaining({ model: 'opus' }),
        rows: 3,
        instrumentFailure: true,
      },
    ]);
  });

  it('has no current pool when nothing was ever scored', () => {
    const { current, conditions, others } = splitPools([refusal()]);
    expect(current).toEqual([]);
    expect(conditions).toBeNull();
    expect(others[0].instrumentFailure).toBe(true);
  });

  it('keeps a valid A/B pair when a rerun under new conditions only errored', () => {
    const baseline = [row({ score: 0, passed: false }), refusal({ trial: 2 })];
    const treatment = [row({ score: 1 }), refusal({ trial: 2 })];
    const paired = pairArms(baseline, treatment);
    expect(paired.error).toBeUndefined();
    expect(paired.baseline).toHaveLength(1);
    expect(paired.treatment).toHaveLength(1);
    expect(paired.unpaired.every((p) => p.instrumentFailure)).toBe(true);
  });

  it('labels an error-only pool as an instrument failure when printed', () => {
    const { otherPoolLines } = require('../../scripts/lib/eval-pools');
    const [line] = otherPoolLines([{ conditions: {}, rows: 3, instrumentFailure: true }]);
    expect(line).toMatch(/^Instrument failure, not a measurement: 3 row\(s\)/);
  });
});

describe('splitPools', () => {
  it('never combines an isolated pool with a toolkit (--no-isolate) pool', () => {
    const isolated = [1, 2].map((t) => row({ trial: t, isolation: 'isolated' }));
    const toolkit = [1, 2, 3].map((t) =>
      row({ trial: t, isolation: 'toolkit', timestamp: '2026-09-30T11:00:00.000Z' }),
    );
    const { current, others } = splitPools([...isolated, ...toolkit]);
    expect(current).toHaveLength(3);
    expect(current.every((r) => r.isolation === 'toolkit')).toBe(true);
    expect(others).toEqual([
      { conditions: expect.objectContaining({ isolation: 'isolated' }), rows: 2 },
    ]);
  });

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

describe('pairArms', () => {
  const { pairArms } = require('../../scripts/lib/eval-pools');
  const at = (ts, overrides) => row({ timestamp: ts, ...overrides });

  it('pairs pools that match on model, effort, ceiling and budget; plugin dir may differ', () => {
    const baseline = [at('2026-09-30T10:00:00Z', { pluginDir: false, maxTurns: 10 })];
    const treatment = [at('2026-09-30T10:00:01Z', { pluginDir: true, maxTurns: 10 })];
    const paired = pairArms(baseline, treatment);
    expect(paired.error).toBeUndefined();
    expect(paired.baseline).toHaveLength(1);
    expect(paired.treatment).toHaveLength(1);
    expect(paired.unpaired).toEqual([]);
  });

  it('falls back to the newest pair both arms have, and reports the mismatch', () => {
    const common = { trialTimeoutMs: 900000 };
    const baseline = [
      at('2026-09-29T10:00:00Z', common),
      at('2026-09-30T10:00:00Z', { trialTimeoutMs: 1800000 }), // newest baseline, no partner
    ];
    const treatment = [at('2026-09-29T10:00:01Z', common)];
    const paired = pairArms(baseline, treatment);
    expect(paired.baseline.map((r) => r.trialTimeoutMs)).toEqual([900000]);
    expect(paired.treatment).toHaveLength(1);
    expect(paired.unpaired).toEqual([
      {
        arm: 'baseline',
        conditions: expect.objectContaining({ trialTimeoutMs: 1800000 }),
        rows: 1,
      },
    ]);
  });

  it('makes the benchmark refuse an A/B comparison with no common pair', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pair-bench-'));
    try {
      const dir = path.join(root, SCENARIOS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'ab.md'),
        '# Eval: ab\n\n## Scope\nskill\n\n## Scenario\nDo it.\n\n## Grader\ncode\n',
      );
      appendResult(row({ eval: 'ab-baseline', model: 'opus', runId: 'r1' }), root);
      appendResult(row({ eval: 'ab-treatment', model: 'sonnet', runId: 'r1' }), root);
      const { compared } = generateBenchmark(root).evals.ab;
      expect(compared.verdict).toBeNull();
      expect(compared.refused).toMatch(/no run conditions in common/);
      expect(compared.other_pools).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('exports every condition on raw rows and a baseline average per pool', () => {
    const { generateRawBenchmarkData } = require('../../scripts/lib/eval-benchmark');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-raw-pools-'));
    try {
      const dir = path.join(root, SCENARIOS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'raw.md'),
        '# Eval: raw\n\n## Scope\nskill\n\n## Scenario\nDo it.\n\n## Grader\ncode\n',
      );
      const put = (arm, score, overrides) =>
        appendResult(row({ eval: `raw-${arm}`, score, runId: 'r1', ...overrides }), root);
      // Two conditions: 900 s (baseline scores 0.2) and 1800 s (baseline scores 0.8).
      put('baseline', 0.2, { trialTimeoutMs: 900000, maxTurns: 10 });
      put('baseline', 0.8, { trialTimeoutMs: 1800000, timestamp: '2026-09-30T11:00:00.000Z' });
      put('treatment', 1, { trialTimeoutMs: 900000, pluginDir: true, maxTurns: 10 });
      put('treatment', 1, { trialTimeoutMs: 1800000, timestamp: '2026-09-30T11:00:00.000Z' });

      const { rows } = generateRawBenchmarkData(root, 'now');
      const treatmentAt = (ceiling) =>
        rows.find((r) => r.condition === 'treatment' && r.trialTimeoutMs === ceiling);
      // Each treatment row is compared with the baseline pool of its own conditions.
      expect(treatmentAt(900000).baseline_score_avg).toBe(0.2);
      expect(treatmentAt(900000).score_delta_vs_baseline_avg).toBe(0.8);
      expect(treatmentAt(1800000).baseline_score_avg).toBe(0.8);
      expect(treatmentAt(900000)).toEqual(
        expect.objectContaining({ effort: 'default', maxTurns: 10, pluginDir: true }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('pairs an isolated baseline with a plugin-dir or toolkit treatment: that is the treatment', () => {
    const baseline = [row({ isolation: 'isolated' })];
    expect(
      pairArms(baseline, [row({ isolation: 'plugin-dir', pluginDir: true })]).error,
    ).toBeUndefined();
    expect(pairArms(baseline, [row({ isolation: 'toolkit' })]).error).toBeUndefined();
  });

  it('never pairs arms whose isolation differs any other way', () => {
    const paired = pairArms([row({ isolation: 'toolkit' })], [row({ isolation: 'isolated' })]);
    expect(paired.error).toMatch(/no run conditions in common/);
  });

  it('keeps a baseline error row in the raw export but out of the baseline average', () => {
    const { generateRawBenchmarkData } = require('../../scripts/lib/eval-benchmark');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-raw-scorable-'));
    try {
      const dir = path.join(root, SCENARIOS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'rs.md'),
        '# Eval: rs\n\n## Scope\nskill\n\n## Scenario\nDo it.\n\n## Grader\ncode\n',
      );
      const put = (arm, trial, overrides) =>
        appendResult(row({ eval: `rs-${arm}`, trial, runId: 'r1', ...overrides }), root);
      put('baseline', 1, { score: 0.6 });
      // A provider refusal: placeholder score 0, which must not drag the average.
      put('baseline', 2, {
        score: 0,
        passed: false,
        infraError: true,
        errorType: 'provider_refusal',
      });
      put('treatment', 1, { score: 1 });

      const { rows } = generateRawBenchmarkData(root, 'now');
      expect(rows.filter((r) => r.condition === 'baseline')).toHaveLength(2);
      expect(rows.find((r) => r.infra_error)).toBeDefined();
      const treatment = rows.find((r) => r.condition === 'treatment');
      expect(treatment.baseline_score_avg).toBe(0.6);
      expect(treatment.score_delta_vs_baseline_avg).toBe(0.4);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses when the arms share no condition pair, listing every pool', () => {
    const paired = pairArms([row({ model: 'opus' })], [row({ model: 'sonnet' })]);
    expect(paired.error).toMatch(/no run conditions in common/);
    expect(paired.unpaired).toHaveLength(2);
  });
});
