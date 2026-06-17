/**
 * compaction-analysis.test.js (ICL-12)
 *
 * Deterministic correlation of suggestions[] × compactions[]. Synthetic fixtures
 * exercise the pairing math at both sample sizes; they are NOT evidence for
 * tuning any constant (the recommendation stays gated behind a real-data floor).
 */

const {
  MIN_COMPACTION_SAMPLES,
  INSUFFICIENT_DATA,
  analyzeCompactions,
  pairSession,
} = require('../../scripts/lib/compaction-analysis');

// Fixed base time so timestamps are deterministic.
const T0 = Date.parse('2026-06-16T10:00:00.000Z');
const at = (offsetMs) => new Date(T0 + offsetMs).toISOString();
const MIN = 60_000;

describe('pairSession', () => {
  it('pairs a compaction with the latest preceding suggestion', () => {
    const suggestions = [
      { count: 50, phase: 'read-heavy', at: at(0) },
      { count: 75, phase: 'write-heavy', at: at(10 * MIN) },
    ];
    const compactions = [at(12 * MIN)];
    const pairs = pairSession(suggestions, compactions);
    expect(pairs).toEqual([{ leadMs: 2 * MIN, count: 75, phase: 'write-heavy' }]);
  });

  it('omits a compaction that has no preceding suggestion', () => {
    const suggestions = [{ count: 50, phase: 'read-heavy', at: at(20 * MIN) }];
    const compactions = [at(5 * MIN)]; // before any suggestion
    expect(pairSession(suggestions, compactions)).toEqual([]);
  });

  it('matches a suggestion exactly at the compaction timestamp', () => {
    const suggestions = [{ count: 50, phase: 'neutral', at: at(0) }];
    const pairs = pairSession(suggestions, [at(0)]);
    expect(pairs).toEqual([{ leadMs: 0, count: 50, phase: 'neutral' }]);
  });

  it('skips unparseable timestamps without throwing', () => {
    const suggestions = [{ count: 50, phase: 'read-heavy', at: 'not-a-date' }];
    expect(pairSession(suggestions, ['also-bad'])).toEqual([]);
  });
});

describe('analyzeCompactions: descriptive stats (any sample size)', () => {
  it('aggregates pairing counts and lead-time across sessions', () => {
    const sessions = [
      {
        suggestions: [
          { count: 50, phase: 'read-heavy', at: at(0) },
          { count: 75, phase: 'write-heavy', at: at(8 * MIN) },
        ],
        compactions: [at(2 * MIN), at(10 * MIN)],
      },
      {
        suggestions: [{ count: 50, phase: 'neutral', at: at(0) }],
        compactions: [at(4 * MIN)],
      },
    ];

    const result = analyzeCompactions(sessions);
    expect(result.sessionCount).toBe(2);
    expect(result.compactionCount).toBe(3);
    expect(result.suggestionCount).toBe(3);
    expect(result.compactionsWithPrecedingSuggestion).toBe(3);
    // lead times: 2min, 2min (75 at 8min → compaction at 10min), 4min → median 2min
    expect(result.medianLeadMs).toBe(2 * MIN);
    // counts at compaction: 50, 75, 50 → median 50
    expect(result.countAtCompaction.median).toBe(50);
    expect(result.countAtCompaction.min).toBe(50);
    expect(result.countAtCompaction.max).toBe(75);
    expect(result.phaseAtCompaction).toEqual({ 'read-heavy': 1, 'write-heavy': 1, neutral: 1 });
  });

  it('counts compactions with no preceding suggestion separately', () => {
    const sessions = [
      {
        suggestions: [{ count: 50, phase: 'read-heavy', at: at(10 * MIN) }],
        compactions: [at(5 * MIN), at(15 * MIN)], // first has no preceding suggestion
      },
    ];
    const result = analyzeCompactions(sessions);
    expect(result.compactionCount).toBe(2);
    expect(result.compactionsWithPrecedingSuggestion).toBe(1);
  });

  it('handles sessions missing the arrays', () => {
    const result = analyzeCompactions([{}, { suggestions: [] }, { compactions: [] }]);
    expect(result.compactionCount).toBe(0);
    expect(result.suggestionCount).toBe(0);
    expect(result.compactionsWithPrecedingSuggestion).toBe(0);
    expect(result.medianLeadMs).toBeNull();
    expect(result.countAtCompaction.median).toBeNull();
  });

  it('throws with context on non-array input', () => {
    expect(() => analyzeCompactions(null)).toThrow(/must be an array/);
  });
});

describe('analyzeCompactions: gated recommendation', () => {
  it('reports insufficient data below the sample floor', () => {
    const sessions = [
      {
        suggestions: [{ count: 50, phase: 'read-heavy', at: at(0) }],
        compactions: [at(MIN), at(2 * MIN), at(3 * MIN)], // 3 < 20
      },
    ];
    const result = analyzeCompactions(sessions);
    expect(result.compactionCount).toBe(3);
    expect(result.recommendation).toBe(INSUFFICIENT_DATA);
  });

  it('produces a (non-insufficient) recommendation at or above the floor', () => {
    const suggestions = [{ count: 60, phase: 'write-heavy', at: at(0) }];
    const compactions = [];
    for (let i = 0; i < MIN_COMPACTION_SAMPLES; i++) {
      compactions.push(at((i + 1) * MIN));
    }
    const result = analyzeCompactions([{ suggestions, compactions }]);
    expect(result.compactionCount).toBe(MIN_COMPACTION_SAMPLES);
    expect(result.recommendation).not.toBe(INSUFFICIENT_DATA);
    expect(result.recommendation).toMatch(/sufficient sample/);
  });
});
