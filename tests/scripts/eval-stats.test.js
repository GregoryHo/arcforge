const {
  passAtK,
  passAllK,
  avgScore,
  passRate,
  stddev,
  ci95,
  shouldShowCI,
  defaultK,
  statsFromResults,
  confidenceWarning,
  computeDelta,
  verdictFromRate,
  verdictFromDelta,
  getVerdict,
} = require('../../scripts/lib/eval-stats');

function makeResult(overrides = {}) {
  return { eval: 'test', trial: 1, k: 3, passed: false, grader: 'code', score: 0, ...overrides };
}

// ── passAtK ──────────────────────────────────────────────────

describe('passAtK', () => {
  test('returns true when at least one passes', () => {
    expect(passAtK([{ passed: false }, { passed: true }, { passed: false }])).toBe(true);
  });

  test('returns false when all fail', () => {
    expect(passAtK([{ passed: false }, { passed: false }])).toBe(false);
  });

  test('returns false for empty array', () => {
    expect(passAtK([])).toBe(false);
  });
});

// ── passAllK ─────────────────────────────────────────────────

describe('passAllK', () => {
  test('returns true when all pass', () => {
    expect(passAllK([{ passed: true }, { passed: true }])).toBe(true);
  });

  test('returns false when any fails', () => {
    expect(passAllK([{ passed: true }, { passed: false }])).toBe(false);
  });

  test('returns false for empty array', () => {
    expect(passAllK([])).toBe(false);
  });
});

// ── avgScore ─────────────────────────────────────────────────

describe('avgScore', () => {
  test('computes average', () => {
    expect(avgScore([{ score: 0.4 }, { score: 0.6 }])).toBeCloseTo(0.5);
  });

  test('returns 0 for empty', () => {
    expect(avgScore([])).toBe(0);
  });
});

// ── passRate ─────────────────────────────────────────────────

describe('passRate', () => {
  test('computes rate', () => {
    expect(passRate([{ passed: true }, { passed: false }, { passed: true }])).toBeCloseTo(0.667, 2);
  });

  test('returns 0 for empty', () => {
    expect(passRate([])).toBe(0);
  });
});

// ── stddev ───────────────────────────────────────────────────

describe('stddev', () => {
  test('returns 0 for single result', () => {
    expect(stddev([makeResult({ score: 0.5 })])).toBe(0);
  });

  test('returns 0 for identical scores', () => {
    expect(stddev([makeResult({ score: 0.7 }), makeResult({ score: 0.7 })])).toBe(0);
  });

  test('computes correct sample standard deviation', () => {
    // scores: [0.2, 0.4, 0.6, 0.8] → mean=0.5, sample variance=0.0667, sd≈0.2582
    const results = [0.2, 0.4, 0.6, 0.8].map((s) => makeResult({ score: s }));
    expect(stddev(results)).toBeCloseTo(0.2582, 3);
  });

  test('returns 0 for empty', () => {
    expect(stddev([])).toBe(0);
  });
});

// ── ci95 ─────────────────────────────────────────────────────

describe('ci95', () => {
  test('returns zeros for single result', () => {
    const result = ci95([makeResult({ score: 0.5 })]);
    expect(result).toEqual({ lower: 0, upper: 0, width: 0 });
  });

  test('returns valid interval for k=5', () => {
    const results = [0.7, 0.8, 0.9, 0.85, 0.75].map((s) => makeResult({ score: s }));
    const interval = ci95(results);

    expect(interval.lower).toBeGreaterThan(0);
    expect(interval.upper).toBeLessThanOrEqual(1);
    expect(interval.lower).toBeLessThan(interval.upper);
  });

  test('interval contains the mean', () => {
    const results = [0.6, 0.7, 0.8, 0.9].map((s) => makeResult({ score: s }));
    const interval = ci95(results);
    const mean = avgScore(results);

    expect(interval.lower).toBeLessThanOrEqual(mean);
    expect(interval.upper).toBeGreaterThanOrEqual(mean);
  });

  test('width decreases as k increases', () => {
    const small = [0.5, 0.6, 0.7].map((s) => makeResult({ score: s }));
    const large = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8].map((s) => makeResult({ score: s }));

    expect(ci95(small).width).toBeGreaterThan(ci95(large).width);
  });

  test('uses t-distribution for k=3 (df=2, t=4.303)', () => {
    // scores [0.5, 0.6, 0.7]: mean=0.6, sd=0.1, SE=0.0577
    // t=4.303: margin=0.2483, width=0.4967 ≈ 0.50
    const results = [0.5, 0.6, 0.7].map((s) => makeResult({ score: s }));
    const interval = ci95(results);
    expect(interval.width).toBeCloseTo(0.5, 1);
  });

  test('uses t-distribution for k=5 (df=4, t=2.776)', () => {
    // scores [0.7, 0.8, 0.9, 0.85, 0.75]: mean=0.8, sd≈0.0791, SE≈0.0354
    // t=2.776: margin=0.0983, width=0.1965 ≈ 0.20
    const results = [0.7, 0.8, 0.9, 0.85, 0.75].map((s) => makeResult({ score: s }));
    const interval = ci95(results);
    expect(interval.width).toBeCloseTo(0.2, 1);
  });

  test('falls back to z=1.96 for k>30', () => {
    // 31 identical scores: sd=0, SE=0, margin=0 regardless of critical value
    // Use varied scores to test the critical value path
    const results = Array.from({ length: 31 }, (_, i) =>
      makeResult({ score: 0.5 + (i % 3) * 0.1 }),
    );
    const interval31 = ci95(results);
    // For k=31 (z=1.96) vs k=30 (t=2.042), the 31-sample should use z=1.96
    // With 31 results, margin should be smaller than with 30 (both from more data and lower critical value)
    const results30 = results.slice(0, 30);
    const interval30 = ci95(results30);
    expect(interval31.width).toBeLessThanOrEqual(interval30.width);
  });
});

// ── shouldShowCI ────────────────────────────────────────────

describe('shouldShowCI', () => {
  test('returns false for k < 5', () => {
    expect(shouldShowCI([makeResult()])).toBe(false);
    expect(shouldShowCI([makeResult(), makeResult(), makeResult()])).toBe(false);
    expect(shouldShowCI([makeResult(), makeResult(), makeResult(), makeResult()])).toBe(false);
  });

  test('returns true for k >= 5', () => {
    expect(shouldShowCI(Array.from({ length: 5 }, () => makeResult()))).toBe(true);
    expect(shouldShowCI(Array.from({ length: 10 }, () => makeResult()))).toBe(true);
  });
});

// ── defaultK ────────────────────────────────────────────────

describe('defaultK', () => {
  test('returns 3 for code grader eval run', () => {
    expect(defaultK({ grader: 'code' }, false)).toBe(3);
  });

  test('returns 5 for model grader eval run', () => {
    expect(defaultK({ grader: 'model' }, false)).toBe(5);
  });

  test('returns 5 for human grader eval run', () => {
    expect(defaultK({ grader: 'human' }, false)).toBe(5);
  });

  test('returns 5 for code grader A/B', () => {
    expect(defaultK({ grader: 'code' }, true)).toBe(5);
  });

  test('returns 10 for model grader A/B', () => {
    expect(defaultK({ grader: 'model' }, true)).toBe(10);
  });

  test('uses scenario.trials when set', () => {
    expect(defaultK({ grader: 'code', trials: 15 }, false)).toBe(15);
    expect(defaultK({ grader: 'model', trials: 7 }, true)).toBe(7);
  });
});

// ── statsFromResults ─────────────────────────────────────────

describe('statsFromResults', () => {
  test('returns complete stats object', () => {
    const results = [0.6, 0.8, 1.0].map((s) => makeResult({ score: s, passed: s >= 0.7 }));
    const s = statsFromResults(results);

    expect(s.count).toBe(3);
    expect(s.avg).toBeCloseTo(0.8, 1);
    expect(s.stddev).toBeGreaterThan(0);
    expect(s.min).toBe(0.6);
    expect(s.max).toBe(1.0);
    expect(s.ci95).toBeDefined();
    expect(s.passRate).toBeCloseTo(0.67, 1);
  });

  test('handles empty array', () => {
    const s = statsFromResults([]);
    expect(s.count).toBe(0);
    expect(s.avg).toBe(0);
    expect(s.min).toBe(0);
    expect(s.max).toBe(0);
  });
});

// ── confidenceWarning ────────────────────────────────────────

describe('confidenceWarning', () => {
  test('returns warning for k=1', () => {
    expect(confidenceWarning([makeResult()])).toContain('WARNING');
  });

  test('returns note for k=3', () => {
    const results = [makeResult(), makeResult(), makeResult()];
    expect(confidenceWarning(results)).toContain('NOTE');
    expect(confidenceWarning(results)).toContain('k=3');
  });

  test('returns null for k=5+', () => {
    const results = Array.from({ length: 5 }, () => makeResult());
    expect(confidenceWarning(results)).toBeNull();
  });
});

// ── computeDelta ─────────────────────────────────────────────

describe('computeDelta', () => {
  test('computes positive delta', () => {
    const baseline = [{ score: 0.4 }, { score: 0.6 }];
    const treatment = [{ score: 0.7 }, { score: 0.9 }];
    expect(computeDelta(baseline, treatment)).toBeCloseTo(0.3);
  });

  test('computes negative delta', () => {
    expect(computeDelta([{ score: 0.8 }], [{ score: 0.5 }])).toBeCloseTo(-0.3);
  });

  test('returns 0 for empty baseline', () => {
    expect(computeDelta([], [{ score: 1.0 }])).toBe(0);
  });

  test('returns 0 for empty treatment', () => {
    expect(computeDelta([{ score: 1.0 }], [])).toBe(0);
  });
});

// ── verdictFromRate ──────────────────────────────────────────

describe('verdictFromRate', () => {
  test('SHIP at 100%', () => {
    expect(verdictFromRate(1.0)).toBe('SHIP');
  });

  test('NEEDS WORK at 80%', () => {
    expect(verdictFromRate(0.8)).toBe('NEEDS WORK');
  });

  test('BLOCKED below 60%', () => {
    expect(verdictFromRate(0.5)).toBe('BLOCKED');
  });
});

// ── verdictFromDelta ─────────────────────────────────────────

describe('verdictFromDelta', () => {
  test('IMPROVED for delta > 0.15', () => {
    expect(verdictFromDelta(0.2)).toBe('IMPROVED');
  });

  test('INCONCLUSIVE for delta between -0.05 and 0.15', () => {
    expect(verdictFromDelta(0.15)).toBe('INCONCLUSIVE');
    expect(verdictFromDelta(0.0)).toBe('INCONCLUSIVE');
    expect(verdictFromDelta(-0.05)).toBe('INCONCLUSIVE');
  });

  test('REGRESSED for delta < -0.05', () => {
    expect(verdictFromDelta(-0.06)).toBe('REGRESSED');
  });

  test('uses custom thresholds', () => {
    expect(verdictFromDelta(0.1, { improved: 0.05 })).toBe('IMPROVED');
    expect(verdictFromDelta(-0.01, { regressed: -0.1 })).toBe('INCONCLUSIVE');
  });

  test('falls back to defaults when thresholds partial', () => {
    expect(verdictFromDelta(0.2, { regressed: -0.1 })).toBe('IMPROVED');
    expect(verdictFromDelta(-0.06, { improved: 0.2 })).toBe('REGRESSED');
  });
});

// ── getVerdict ────────────────────────────────────────────────

describe('getVerdict', () => {
  test('SHIP for 100% pass rate', () => {
    expect(getVerdict([{ passed: true }, { passed: true }, { passed: true }])).toBe('SHIP');
  });

  test('NEEDS WORK for 80% pass rate', () => {
    const results = [
      { passed: true },
      { passed: true },
      { passed: true },
      { passed: true },
      { passed: false },
    ];
    expect(getVerdict(results)).toBe('NEEDS WORK');
  });

  test('BLOCKED for empty results', () => {
    expect(getVerdict([])).toBe('BLOCKED');
  });
});
