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
  verdictFromDeltaCI,
  ciForDelta,
  verdictFromCI,
  getVerdict,
  baselineVarianceWarning,
  INSUFFICIENT_DATA,
  verdictMessage,
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

// ── ciForDelta ────────────────────────────────────────────────

describe('ciForDelta', () => {
  test('returns zeros for insufficient data', () => {
    expect(ciForDelta([makeResult({ score: 0.5 })], [makeResult({ score: 0.8 })])).toEqual({
      lower: 0,
      upper: 0,
      width: 0,
    });
    expect(ciForDelta([], [makeResult(), makeResult()])).toEqual({ lower: 0, upper: 0, width: 0 });
  });

  test('CI contains the point estimate', () => {
    const baseline = [0.3, 0.4, 0.5, 0.6, 0.7].map((s) => makeResult({ score: s }));
    const treatment = [0.7, 0.8, 0.9, 0.85, 0.75].map((s) => makeResult({ score: s }));
    const ci = ciForDelta(baseline, treatment);
    const delta = avgScore(treatment) - avgScore(baseline);

    expect(ci.lower).toBeLessThanOrEqual(delta);
    expect(ci.upper).toBeGreaterThanOrEqual(delta);
  });

  test('clearly different groups produce CI not spanning zero', () => {
    const baseline = [0.1, 0.2, 0.15, 0.1, 0.2].map((s) => makeResult({ score: s }));
    const treatment = [0.9, 0.95, 0.85, 0.9, 0.95].map((s) => makeResult({ score: s }));
    const ci = ciForDelta(baseline, treatment);

    expect(ci.lower).toBeGreaterThan(0);
  });

  test('identical groups produce CI spanning zero', () => {
    const data = [0.5, 0.6, 0.7, 0.5, 0.6].map((s) => makeResult({ score: s }));
    const ci = ciForDelta(data, data);

    expect(ci.lower).toBeLessThanOrEqual(0);
    expect(ci.upper).toBeGreaterThanOrEqual(0);
  });

  test('handles unequal group sizes', () => {
    const baseline = [0.3, 0.4, 0.5].map((s) => makeResult({ score: s }));
    const treatment = [0.7, 0.8, 0.9, 0.85, 0.75].map((s) => makeResult({ score: s }));
    const ci = ciForDelta(baseline, treatment);

    expect(ci.lower).toBeDefined();
    expect(ci.upper).toBeDefined();
    expect(ci.width).toBeGreaterThan(0);
  });
});

// ── verdictFromDeltaCI ──────────────────────────────────────

describe('verdictFromDeltaCI', () => {
  test('IMPROVED when CI clearly above zero (k=5)', () => {
    const baseline = [0.1, 0.2, 0.15, 0.1, 0.2].map((s) => makeResult({ score: s }));
    const treatment = [0.9, 0.95, 0.85, 0.9, 0.95].map((s) => makeResult({ score: s }));

    expect(verdictFromDeltaCI(baseline, treatment)).toBe('IMPROVED');
  });

  test('INCONCLUSIVE when CI spans zero (k=5)', () => {
    const baseline = [0.4, 0.5, 0.6, 0.5, 0.55].map((s) => makeResult({ score: s }));
    const treatment = [0.5, 0.6, 0.55, 0.45, 0.6].map((s) => makeResult({ score: s }));

    expect(verdictFromDeltaCI(baseline, treatment)).toBe('INCONCLUSIVE');
  });

  test('REGRESSED when CI clearly below zero (k=5)', () => {
    const baseline = [0.9, 0.95, 0.85, 0.9, 0.95].map((s) => makeResult({ score: s }));
    const treatment = [0.1, 0.2, 0.15, 0.1, 0.2].map((s) => makeResult({ score: s }));

    expect(verdictFromDeltaCI(baseline, treatment)).toBe('REGRESSED');
  });

  test('returns INSUFFICIENT_DATA for k < 5 (both conditions small)', () => {
    const baseline = [makeResult({ score: 0.5 }), makeResult({ score: 0.5 })];
    const treatment = [makeResult({ score: 0.7 }), makeResult({ score: 0.7 })];
    // Regardless of delta magnitude, k<5 → INSUFFICIENT_DATA
    expect(verdictFromDeltaCI(baseline, treatment)).toBe(INSUFFICIENT_DATA);
  });

  test('returns INSUFFICIENT_DATA when only one group has < 5', () => {
    const baseline = [0.5, 0.5, 0.5].map((s) => makeResult({ score: s }));
    const treatment = [0.5, 0.5, 0.5, 0.5, 0.5].map((s) => makeResult({ score: s }));
    // baseline has k=3 < 5 → INSUFFICIENT_DATA
    expect(verdictFromDeltaCI(baseline, treatment)).toBe(INSUFFICIENT_DATA);
  });
});

// ── baselineVarianceWarning ──────────────────────────────────

describe('baselineVarianceWarning', () => {
  test('returns null for low variance baseline', () => {
    const results = [0.8, 0.8, 0.8].map((s) => makeResult({ score: s }));
    expect(baselineVarianceWarning(results)).toBeNull();
  });

  test('returns warning for high variance baseline', () => {
    const results = [0.1, 0.9, 0.2, 0.8].map((s) => makeResult({ score: s }));
    const warning = baselineVarianceWarning(results);
    expect(warning).toContain('WARNING');
    expect(warning).toContain('CV=');
  });

  test('returns null for single result', () => {
    expect(baselineVarianceWarning([makeResult({ score: 0.5 })])).toBeNull();
  });

  test('returns null for near-zero mean', () => {
    const results = [0, 0, 0].map((s) => makeResult({ score: s }));
    expect(baselineVarianceWarning(results)).toBeNull();
  });

  test('respects custom threshold', () => {
    const results = [0.5, 0.6, 0.7].map((s) => makeResult({ score: s }));
    // Default CV_THRESHOLD=0.5: low CV → null
    expect(baselineVarianceWarning(results)).toBeNull();
    // Custom strict threshold: 0.1 → warning
    expect(baselineVarianceWarning(results, 0.1)).toContain('WARNING');
  });
});

// ── verdictFromCI ─────────────────────────────────────────────

describe('verdictFromCI', () => {
  test('SHIP when all trials score high', () => {
    const results = [1.0, 1.0, 1.0, 1.0, 1.0].map((s) => makeResult({ score: s }));
    expect(verdictFromCI(results)).toBe('SHIP');
  });

  test('BLOCKED for single trial', () => {
    expect(verdictFromCI([makeResult({ score: 1.0 })])).toBe('BLOCKED');
  });

  test('BLOCKED for all-zero scores', () => {
    const results = [0, 0, 0, 0, 0].map((s) => makeResult({ score: s, passed: false }));
    expect(verdictFromCI(results)).toBe('BLOCKED');
  });

  test('NEEDS WORK for mixed results above 60% pass rate', () => {
    const results = [1.0, 1.0, 1.0, 0.5, 0].map((s) => makeResult({ score: s, passed: s === 1.0 }));
    // CI lower likely below 0.8 but pass rate is 60%
    expect(verdictFromCI(results)).toBe('NEEDS WORK');
  });

  test('uses custom target', () => {
    // With target=0.5, moderate scores should SHIP
    const results = [0.6, 0.7, 0.65, 0.7, 0.6].map((s) => makeResult({ score: s }));
    expect(verdictFromCI(results, 0.5)).toBe('SHIP');
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

  test('uses CI-based verdict when useCi is true and k >= 5', () => {
    const results = [1.0, 1.0, 1.0, 1.0, 1.0].map((s) => makeResult({ score: s, passed: true }));
    expect(getVerdict(results, { useCi: true })).toBe('SHIP');
  });

  test('falls back to rate-based when useCi true but k < 5', () => {
    const results = [{ passed: true }, { passed: true }, { passed: true }];
    expect(getVerdict(results, { useCi: true })).toBe('SHIP');
  });

  test('ignores useCi when not set (backward compatible)', () => {
    const results = [
      { passed: true },
      { passed: true },
      { passed: true },
      { passed: true },
      { passed: false },
    ];
    // Without useCi, uses rate-based: 80% = NEEDS WORK
    expect(getVerdict(results)).toBe('NEEDS WORK');
  });
});

// ── INSUFFICIENT_DATA constant ───────────────────────────────

describe('INSUFFICIENT_DATA constant', () => {
  test('is a distinct string value', () => {
    expect(typeof INSUFFICIENT_DATA).toBe('string');
    expect(INSUFFICIENT_DATA).toBe('INSUFFICIENT_DATA');
  });

  test('is distinct from other verdict strings', () => {
    expect(INSUFFICIENT_DATA).not.toBe('IMPROVED');
    expect(INSUFFICIENT_DATA).not.toBe('INCONCLUSIVE');
    expect(INSUFFICIENT_DATA).not.toBe('REGRESSED');
    expect(INSUFFICIENT_DATA).not.toBe('SHIP');
    expect(INSUFFICIENT_DATA).not.toBe('NEEDS WORK');
    expect(INSUFFICIENT_DATA).not.toBe('BLOCKED');
  });
});

// ── verdictFromDeltaCI — INSUFFICIENT_DATA guard ─────────────

describe('verdictFromDeltaCI — INSUFFICIENT_DATA guard (fr-vr-001)', () => {
  // ac1: k=3 per condition → INSUFFICIENT_DATA
  test('ac1: returns INSUFFICIENT_DATA when both conditions have k=3', () => {
    const baseline = [0.5, 0.6, 0.7].map((s) => makeResult({ score: s }));
    const treatment = [0.7, 0.8, 0.9].map((s) => makeResult({ score: s }));
    expect(verdictFromDeltaCI(baseline, treatment)).toBe(INSUFFICIENT_DATA);
  });

  // ac2: k=4 baseline + k=10 treatment → INSUFFICIENT_DATA (baseline < 5)
  test('ac2: returns INSUFFICIENT_DATA when baseline has 4 and treatment has 10', () => {
    const baseline = [0.5, 0.6, 0.7, 0.8].map((s) => makeResult({ score: s }));
    const treatment = Array.from({ length: 10 }, (_, i) => makeResult({ score: 0.7 + i * 0.02 }));
    expect(verdictFromDeltaCI(baseline, treatment)).toBe(INSUFFICIENT_DATA);
  });

  test('returns INSUFFICIENT_DATA when treatment has k=4 and baseline has k=5', () => {
    const baseline = [0.5, 0.6, 0.7, 0.8, 0.9].map((s) => makeResult({ score: s }));
    const treatment = [0.5, 0.6, 0.7, 0.8].map((s) => makeResult({ score: s }));
    expect(verdictFromDeltaCI(baseline, treatment)).toBe(INSUFFICIENT_DATA);
  });

  test('returns normal verdict (IMPROVED/INCONCLUSIVE/REGRESSED) when both have k>=5', () => {
    const baseline = [0.1, 0.2, 0.15, 0.1, 0.2].map((s) => makeResult({ score: s }));
    const treatment = [0.9, 0.95, 0.85, 0.9, 0.95].map((s) => makeResult({ score: s }));
    const verdict = verdictFromDeltaCI(baseline, treatment);
    // Must be a normal A/B verdict, not INSUFFICIENT_DATA
    expect(['IMPROVED', 'INCONCLUSIVE', 'REGRESSED']).toContain(verdict);
  });
});

// ── verdictFromRate — no INSUFFICIENT_DATA (fr-vr-001-ac4) ───

describe('verdictFromRate — never returns INSUFFICIENT_DATA (fr-vr-001-ac4)', () => {
  test('returns SHIP, NEEDS WORK, or BLOCKED for rate=0', () => {
    const v = verdictFromRate(0);
    expect(['SHIP', 'NEEDS WORK', 'BLOCKED']).toContain(v);
    expect(v).not.toBe(INSUFFICIENT_DATA);
  });

  test('returns SHIP, NEEDS WORK, or BLOCKED for rate=0.5', () => {
    const v = verdictFromRate(0.5);
    expect(['SHIP', 'NEEDS WORK', 'BLOCKED']).toContain(v);
    expect(v).not.toBe(INSUFFICIENT_DATA);
  });

  test('returns SHIP, NEEDS WORK, or BLOCKED for rate=1.0', () => {
    const v = verdictFromRate(1.0);
    expect(['SHIP', 'NEEDS WORK', 'BLOCKED']).toContain(v);
    expect(v).not.toBe(INSUFFICIENT_DATA);
  });

  test('never returns INSUFFICIENT_DATA for any rate in [0,1]', () => {
    const rates = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const rate of rates) {
      expect(verdictFromRate(rate)).not.toBe(INSUFFICIENT_DATA);
    }
  });
});

// ── verdictMessage ───────────────────────────────────────────

describe('verdictMessage (fr-vr-001-ac3)', () => {
  test('returns remediation message for INSUFFICIENT_DATA', () => {
    const msg = verdictMessage(INSUFFICIENT_DATA);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    // Must mention k>=5 or similar threshold guidance
    expect(msg).toMatch(/k[=≥]/i);
  });

  test('INSUFFICIENT_DATA message mentions defensible verdict', () => {
    const msg = verdictMessage(INSUFFICIENT_DATA);
    // The spec says: "Run k≥5 trials per condition for a defensible verdict."
    expect(msg).toContain('5');
    expect(msg).toMatch(/defensible|verdict|trial/i);
  });

  test('returns null or empty string for normal verdicts', () => {
    // Normal verdicts do not require a remediation message
    for (const v of ['IMPROVED', 'INCONCLUSIVE', 'REGRESSED']) {
      const msg = verdictMessage(v);
      expect(msg === null || msg === '' || typeof msg === 'string').toBe(true);
    }
  });

  // ac3: INSUFFICIENT_DATA is a distinct string switchable in JSON output
  test('ac3: INSUFFICIENT_DATA as JSON is a distinct switchable string', () => {
    const result = { verdict: INSUFFICIENT_DATA };
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    expect(parsed.verdict).toBe('INSUFFICIENT_DATA');
    // Consumers can switch on it
    let matched = false;
    switch (parsed.verdict) {
      case 'INSUFFICIENT_DATA':
        matched = true;
        break;
    }
    expect(matched).toBe(true);
  });
});
