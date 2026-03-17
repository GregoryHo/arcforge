/**
 * eval-stats.js - Statistical analysis for eval results
 *
 * Pure functions for computing metrics, confidence intervals, and verdicts.
 * Extracted from eval.js to keep orchestration and analysis separate.
 *
 * Zero external dependencies — Node.js standard library only.
 */

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
 * Compute sample standard deviation of scores (Bessel's correction)
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {number} Standard deviation, or 0 if fewer than 2 results
 */
function stddev(results) {
  if (results.length < 2) return 0;
  const avg = avgScore(results);
  const variance = results.reduce((sum, r) => sum + (r.score - avg) ** 2, 0) / (results.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute 95% confidence interval for mean score (normal approximation)
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {{ lower: number, upper: number, width: number }} CI bounds
 */
function ci95(results) {
  if (results.length < 2) return { lower: 0, upper: 0, width: 0 };
  const avg = avgScore(results);
  const se = stddev(results) / Math.sqrt(results.length);
  const margin = 1.96 * se;
  return {
    lower: Math.round(Math.max(0, avg - margin) * 100) / 100,
    upper: Math.round(Math.min(1, avg + margin) * 100) / 100,
    width: Math.round(margin * 2 * 100) / 100,
  };
}

/**
 * Compute comprehensive statistics from trial results
 * @param {import('./eval').TrialResult[]} results - Trial results
 * @returns {{ count: number, avg: number, stddev: number, min: number, max: number, ci95: Object, passRate: number }}
 */
function statsFromResults(results) {
  const scores = results.map((r) => r.score);
  return {
    count: results.length,
    avg: Math.round(avgScore(results) * 100) / 100,
    stddev: Math.round(stddev(results) * 100) / 100,
    min: scores.length > 0 ? Math.min(...scores) : 0,
    max: scores.length > 0 ? Math.max(...scores) : 0,
    ci95: ci95(results),
    passRate: Math.round(passRate(results) * 100) / 100,
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
  const improved = thresholds.improved ?? 0.15;
  const regressed = thresholds.regressed ?? -0.05;
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
  statsFromResults,
  confidenceWarning,
  computeDelta,
  verdictFromRate,
  verdictFromDelta,
  getVerdict,
};
