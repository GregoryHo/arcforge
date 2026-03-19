/**
 * eval-stats.js - Statistical analysis for eval results
 *
 * Pure functions for computing metrics, confidence intervals, and verdicts.
 * Extracted from eval.js to keep orchestration and analysis separate.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const DELTA_IMPROVED_THRESHOLD = 0.15;
const DELTA_REGRESSED_THRESHOLD = -0.05;

/**
 * Two-tailed t-critical values at 95% confidence, keyed by degrees of freedom.
 * For df > 30, the t-distribution converges to z=1.96 (normal approximation).
 */
const T_CRITICAL_95 = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  21: 2.08,
  22: 2.074,
  23: 2.069,
  24: 2.064,
  25: 2.06,
  26: 2.056,
  27: 2.052,
  28: 2.048,
  29: 2.045,
  30: 2.042,
};

/**
 * Compute pass@k metric: at least 1 success in k trials
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {boolean} Whether pass@k is satisfied
 */
function passAtK(results) {
  return results.some((r) => r.passed);
}

/**
 * Compute pass^k metric: all k trials succeed
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {boolean} Whether pass^k is satisfied
 */
function passAllK(results) {
  return results.length > 0 && results.every((r) => r.passed);
}

/**
 * Compute average score from trial results
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {number} Average score (0.0 to 1.0), or 0 if empty
 */
function avgScore(results) {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.score, 0) / results.length;
}

/**
 * Compute pass rate from trial results
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {number} Pass rate (0.0 to 1.0), or 0 if empty
 */
function passRate(results) {
  if (results.length === 0) return 0;
  return results.filter((r) => r.passed).length / results.length;
}

/**
 * Compute sample standard deviation of scores (Bessel's correction).
 * Accepts optional precomputed mean to avoid redundant traversals.
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @param {number} [mean] - Precomputed mean score
 * @returns {number} Standard deviation, or 0 if fewer than 2 results
 */
function stddev(results, mean) {
  if (results.length < 2) return 0;
  const avg = mean ?? avgScore(results);
  const variance = results.reduce((sum, r) => sum + (r.score - avg) ** 2, 0) / (results.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute 95% confidence interval for mean score using Student's t-distribution.
 * Uses t-critical values for df=1-30; falls back to z=1.96 for larger samples.
 * Accepts optional precomputed mean and sd to avoid redundant traversals.
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @param {number} [mean] - Precomputed mean score
 * @param {number} [sd] - Precomputed standard deviation
 * @returns {{ lower: number, upper: number, width: number }} CI bounds
 */
function ci95(results, mean, sd) {
  if (results.length < 2) return { lower: 0, upper: 0, width: 0 };
  const avg = mean ?? avgScore(results);
  const se = (sd ?? stddev(results, avg)) / Math.sqrt(results.length);
  const df = results.length - 1;
  const tCritical = T_CRITICAL_95[df] || 1.96;
  const margin = tCritical * se;
  return {
    lower: Math.round(Math.max(0, avg - margin) * 100) / 100,
    upper: Math.round(Math.min(1, avg + margin) * 100) / 100,
    width: Math.round(margin * 2 * 100) / 100,
  };
}

/**
 * Whether sample size is large enough for CI to be meaningfully displayed.
 * At k < 5, t-distribution CIs are too wide to provide useful guidance.
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {boolean} True if CI should be shown in output
 */
function shouldShowCI(results) {
  return results.length >= 5;
}

/**
 * Compute default trial count based on eval characteristics.
 * A/B comparisons need more data than single-condition evals.
 * Model grading adds noise, requiring additional trials.
 * @param {Object} scenario - Parsed eval scenario
 * @param {string} scenario.grader - Grader type ('code' | 'model' | 'human')
 * @param {number} [scenario.trials] - Explicit trial count from scenario
 * @param {boolean} [isAb=false] - Whether this is an A/B comparison
 * @returns {number} Recommended trial count per condition
 */
function defaultK(scenario, isAb = false) {
  if (scenario.trials) return scenario.trials;
  const isModel = scenario.grader === 'model' || scenario.grader === 'human';
  if (isAb) return isModel ? 10 : 5;
  return isModel ? 5 : 3;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Compute comprehensive statistics from trial results.
 * Computes avg once and threads it through stddev/ci95 to avoid redundant traversals.
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {{ count: number, avg: number, stddev: number, min: number, max: number, ci95: Object, passRate: number }}
 */
function statsFromResults(results) {
  if (results.length === 0) {
    return { count: 0, avg: 0, stddev: 0, min: 0, max: 0, ci95: ci95([]), passRate: 0 };
  }
  const scores = results.map((r) => r.score);
  const avg = avgScore(results);
  const sd = stddev(results, avg);
  return {
    count: results.length,
    avg: round2(avg),
    stddev: round2(sd),
    min: Math.min(...scores),
    max: Math.max(...scores),
    ci95: ci95(results, avg, sd),
    passRate: round2(passRate(results)),
  };
}

/**
 * Return a warning string when sample size is too small for reliable statistics
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {string|null} Warning message, or null if sample is adequate
 */
function confidenceWarning(results) {
  if (results.length < 2) return 'WARNING: k=1, no variance information';
  if (results.length < 5) return `NOTE: k=${results.length}, confidence intervals are wide`;
  return null;
}

/**
 * Compute delta between baseline and treatment results
 * @param {import('./eval').TrialResult[]} baseline - Baseline results
 * @param {import('./eval').TrialResult[]} treatment - Treatment results
 * @returns {number} Delta (treatment avg score - baseline avg score)
 */
function computeDelta(baseline, treatment) {
  if (baseline.length === 0 || treatment.length === 0) {
    return 0;
  }
  return avgScore(treatment) - avgScore(baseline);
}

/**
 * Get verdict from a numeric pass rate
 * @param {number} rate - Pass rate (0.0 to 1.0)
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function verdictFromRate(rate) {
  if (rate >= 1.0) return 'SHIP';
  if (rate >= 0.6) return 'NEEDS WORK';
  return 'BLOCKED';
}

/**
 * Get verdict for an eval based on pass rate
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function getVerdict(results) {
  if (results.length === 0) return 'BLOCKED';
  return verdictFromRate(passRate(results));
}

/**
 * Get A/B comparison verdict from a delta value
 * @param {number} delta - Treatment avg score minus baseline avg score
 * @param {Object} [thresholds] - Custom threshold overrides
 * @param {number} [thresholds.improved=0.15] - Delta above this = IMPROVED
 * @param {number} [thresholds.regressed=-0.05] - Delta below this = REGRESSED
 * @returns {'IMPROVED' | 'INCONCLUSIVE' | 'REGRESSED'} Verdict
 */
function verdictFromDelta(delta, thresholds = {}) {
  const improved = thresholds.improved ?? DELTA_IMPROVED_THRESHOLD;
  const regressed = thresholds.regressed ?? DELTA_REGRESSED_THRESHOLD;
  if (delta > improved) return 'IMPROVED';
  if (delta >= regressed) return 'INCONCLUSIVE';
  return 'REGRESSED';
}

module.exports = {
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
  DELTA_IMPROVED_THRESHOLD,
  DELTA_REGRESSED_THRESHOLD,
};
