/**
 * eval-stats.js - Statistical analysis for eval results
 *
 * Pure functions for computing metrics, confidence intervals, and verdicts.
 * Extracted from eval.js to keep orchestration and analysis separate.
 *
 * Zero external dependencies — Node.js standard library only.
 */

/**
 * Asymmetric A/B delta thresholds (fallback for k < 5 where CI-based analysis
 * is not feasible). The asymmetry is intentional:
 *
 * +0.15 for improvement: Set high to avoid false positives. At k=5-10, deltas
 * in the 0.05-0.15 range are often noise. A change should show clear improvement
 * before being called IMPROVED.
 *
 * -0.05 for regression: Set with low tolerance because regressions are more costly
 * than missing an improvement. Even a small negative delta warrants investigation.
 * Better to flag a false regression than to miss a real one.
 */
const DELTA_IMPROVED_THRESHOLD = 0.15;
const DELTA_REGRESSED_THRESHOLD = -0.05;
const SHIP_CI_TARGET = 0.8;
const NEEDS_WORK_THRESHOLD = 0.6;
const CV_THRESHOLD = 0.5;

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

const round2 = (n) => Math.round(n * 100) / 100;

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
    lower: round2(Math.max(0, avg - margin)),
    upper: round2(Math.min(1, avg + margin)),
    width: round2(margin * 2),
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
  if (rate >= NEEDS_WORK_THRESHOLD) return 'NEEDS WORK';
  return 'BLOCKED';
}

/**
 * Get verdict using CI-based threshold: SHIP when we're 95% confident
 * the true mean score >= target. More noise-tolerant than 100% pass rate.
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @param {number} [target] - CI lower bound target (default: SHIP_CI_TARGET)
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function verdictFromCI(results, target) {
  if (results.length < 2) return 'BLOCKED';
  const t = target ?? SHIP_CI_TARGET;
  const interval = ci95(results);
  if (interval.lower >= t) return 'SHIP';
  if (passRate(results) >= NEEDS_WORK_THRESHOLD) return 'NEEDS WORK';
  return 'BLOCKED';
}

/**
 * Get verdict for an eval based on pass rate.
 * When options.useCi is true and k >= 5, uses CI-based verdict instead
 * of requiring 100% pass rate (more noise-tolerant for model grading).
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @param {Object} [options]
 * @param {boolean} [options.useCi=false] - Use CI-based SHIP threshold
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function getVerdict(results, options = {}) {
  if (results.length === 0) return 'BLOCKED';
  if (options.useCi && results.length >= 5) return verdictFromCI(results);
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

/**
 * Compute 95% confidence interval for the difference between two group means.
 * Uses Welch's t-test (does not assume equal variances).
 * @param {import('./eval').TrialResult[]} baseline - Baseline trial results
 * @param {import('./eval').TrialResult[]} treatment - Treatment trial results
 * @returns {{ lower: number, upper: number, width: number }} CI bounds for delta
 */
function ciForDelta(baseline, treatment) {
  if (baseline.length < 2 || treatment.length < 2) {
    return { lower: 0, upper: 0, width: 0 };
  }

  const bMean = avgScore(baseline);
  const tMean = avgScore(treatment);
  const bVar = stddev(baseline, bMean) ** 2;
  const tVar = stddev(treatment, tMean) ** 2;
  const nB = baseline.length;
  const nT = treatment.length;

  const seDelta = Math.sqrt(bVar / nB + tVar / nT);
  if (seDelta === 0) {
    const delta = tMean - bMean;
    return { lower: round2(delta), upper: round2(delta), width: 0 };
  }

  // Welch-Satterthwaite degrees of freedom
  const num = (bVar / nB + tVar / nT) ** 2;
  const denom = (bVar / nB) ** 2 / (nB - 1) + (tVar / nT) ** 2 / (nT - 1);
  const df = Math.max(1, Math.floor(num / denom));
  const tCritical = T_CRITICAL_95[df] || 1.96;
  const margin = tCritical * seDelta;

  const delta = tMean - bMean;
  return {
    lower: round2(Math.max(-1, delta - margin)),
    upper: round2(Math.min(1, delta + margin)),
    width: round2(margin * 2),
  };
}

/**
 * Warn when baseline has high coefficient of variation (stddev/mean),
 * indicating the baseline is too noisy for meaningful A/B delta comparison.
 * Accepts optional precomputed stats to avoid redundant computation.
 * @param {import('./eval').TrialResult[]} results - Baseline trial results
 * @param {Object} [precomputed] - Precomputed { avg, stddev } from statsFromResults
 * @param {number} [threshold] - CV threshold (default: CV_THRESHOLD)
 * @returns {string|null} Warning message, or null if variance is acceptable
 */
function baselineVarianceWarning(results, precomputed, threshold) {
  // Support old 2-arg call: baselineVarianceWarning(results, threshold)
  if (typeof precomputed === 'number') {
    threshold = precomputed;
    precomputed = undefined;
  }
  if (results.length < 2) return null;
  const mean = precomputed?.avg ?? avgScore(results);
  if (mean <= 0.01) return null;
  const sd = precomputed?.stddev ?? stddev(results, mean);
  const cv = sd / mean;
  const t = threshold ?? CV_THRESHOLD;
  if (cv > t) {
    return `WARNING: Baseline has high variance (CV=${cv.toFixed(2)}). A/B delta may be unreliable.`;
  }
  return null;
}

/**
 * Get A/B comparison verdict using CI when sample size is adequate, with
 * magic-threshold fallback for small samples.
 * When both groups have >= 5 results, uses ciForDelta: IMPROVED if lower > 0,
 * REGRESSED if upper < 0, else INCONCLUSIVE. Falls back to verdictFromDelta
 * for smaller samples where CI is too wide to be informative.
 * @param {import('./eval').TrialResult[]} baseline - Baseline results
 * @param {import('./eval').TrialResult[]} treatment - Treatment results
 * @param {Object} [fallbackThresholds] - Thresholds for small-sample fallback
 * @returns {'IMPROVED' | 'INCONCLUSIVE' | 'REGRESSED'} Verdict
 */
function verdictFromDeltaCI(baseline, treatment, fallbackThresholds) {
  if (baseline.length >= 5 && treatment.length >= 5) {
    const ci = ciForDelta(baseline, treatment);
    if (ci.lower > 0) return 'IMPROVED';
    if (ci.upper < 0) return 'REGRESSED';
    return 'INCONCLUSIVE';
  }
  return verdictFromDelta(computeDelta(baseline, treatment), fallbackThresholds);
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
  verdictFromDeltaCI,
  ciForDelta,
  verdictFromCI,
  getVerdict,
  DELTA_IMPROVED_THRESHOLD,
  DELTA_REGRESSED_THRESHOLD,
  baselineVarianceWarning,
  round2,
  SHIP_CI_TARGET,
  NEEDS_WORK_THRESHOLD,
  CV_THRESHOLD,
};
