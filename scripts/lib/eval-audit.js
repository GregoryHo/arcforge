/**
 * eval-audit.js - Aggregate grading history to surface promotion and retirement candidates
 *
 * Read-only: walks evals/results to collect discovered_claims and weak_assertions,
 * then produces ranked candidates without modifying any scenario files.
 *
 * Promotion candidates: claims that appeared frequently and often failed —
 * these should be promoted into formal assertions.
 *
 * Retirement candidates: assertions that are repeatedly flagged as weak across
 * multiple scenarios — these should be revised or retired.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Root directory for grading results */
const GRADING_RESULTS_DIR = path.join('evals', 'results');

/**
 * Derive a stable short hash for a canonical key (e.g., claim text).
 * Used for stable deduplication identifiers in output.
 * @param {string} key - Canonical key to hash
 * @returns {string} 8-char hex prefix of sha256(key)
 */
function stableHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

/**
 * Normalize claim text for bucketing: trim whitespace and lowercase.
 * Two claims with the same normalized text are considered the same claim.
 * @param {string} text - Raw claim text
 * @returns {string} Normalized key
 */
function normalizeClaim(text) {
  return (text || '').trim().toLowerCase();
}

/**
 * Walk evals/results/<scenario>/<runId>/grading/trial-*.json and collect all
 * discovered_claims and weak_assertions entries.
 *
 * Each claim entry is decorated with { ...claim, scenario }.
 * Each weak entry is decorated with { ...weak, scenario }.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {{ claimsEntries: Object[], weakEntries: Object[], trialCount: number }}
 */
function collectGradingData(projectRoot) {
  const resultsRoot = path.join(projectRoot, GRADING_RESULTS_DIR);
  const claimsEntries = [];
  const weakEntries = [];
  let trialCount = 0;

  if (!fs.existsSync(resultsRoot)) {
    return { claimsEntries, weakEntries, trialCount };
  }

  const scenarios = fs
    .readdirSync(resultsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const scenario of scenarios) {
    const scenarioDir = path.join(resultsRoot, scenario);
    const runDirs = fs
      .readdirSync(scenarioDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const runId of runDirs) {
      const gradingDir = path.join(scenarioDir, runId, 'grading');
      if (!fs.existsSync(gradingDir)) continue;

      const gradingFiles = fs
        .readdirSync(gradingDir)
        .filter((f) => f.startsWith('trial-') && f.endsWith('.json'));

      for (const gradingFile of gradingFiles) {
        const filePath = path.join(gradingDir, gradingFile);
        let data;
        try {
          data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
          continue;
        }

        trialCount++;

        if (Array.isArray(data.discovered_claims)) {
          for (const claim of data.discovered_claims) {
            if (claim && typeof claim === 'object') {
              claimsEntries.push({ ...claim, scenario });
            }
          }
        }

        if (Array.isArray(data.weak_assertions)) {
          for (const weak of data.weak_assertions) {
            if (weak && typeof weak === 'object') {
              weakEntries.push({ ...weak, scenario });
            }
          }
        }
      }
    }
  }

  return { claimsEntries, weakEntries, trialCount };
}

/**
 * Build promotion candidates from collected claim entries.
 *
 * Buckets entries by normalized claim text. For each bucket, computes:
 *   frequency     — total occurrences
 *   failure_rate  — fraction where passed === false
 *   score         — frequency × failure_rate (sort key)
 *   scenarios     — distinct scenarios where claim appeared
 *   hash          — stable sha256 prefix for reproducibility
 *
 * Sorted by descending score.
 *
 * @param {Object[]} claimsEntries - Decorated claim entries from collectGradingData
 * @returns {Array<{ text: string, frequency: number, failure_rate: number, score: number, scenarios: string[], hash: string }>}
 */
function buildPromotionCandidates(claimsEntries) {
  /** @type {Map<string, { text: string, count: number, failCount: number, scenarios: Set<string> }>} */
  const buckets = new Map();

  for (const entry of claimsEntries) {
    const key = normalizeClaim(entry.text);
    if (!key) continue;

    if (!buckets.has(key)) {
      buckets.set(key, {
        text: entry.text,
        count: 0,
        failCount: 0,
        scenarios: new Set(),
      });
    }

    const bucket = buckets.get(key);
    bucket.count++;
    if (entry.passed === false) bucket.failCount++;
    if (entry.scenario) bucket.scenarios.add(entry.scenario);
  }

  const candidates = [];
  for (const [key, bucket] of buckets) {
    const failure_rate = bucket.count > 0 ? bucket.failCount / bucket.count : 0;
    const score = bucket.count * failure_rate;
    candidates.push({
      text: bucket.text,
      frequency: bucket.count,
      failure_rate,
      score,
      scenarios: [...bucket.scenarios].sort(),
      hash: stableHash(key),
    });
  }

  // Sort by descending score (frequency × failure_rate)
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Build retirement candidates from collected weak-assertion entries.
 *
 * Buckets entries by assertion_id. For each bucket, computes:
 *   assertion_id   — the assertion identifier
 *   frequency      — total flagging occurrences
 *   scenario_count — distinct scenarios that flagged it
 *   scenarios      — sorted list of scenario names
 *   hash           — stable sha256 prefix for reproducibility
 *
 * Sorted by descending frequency.
 *
 * @param {Object[]} weakEntries - Decorated weak-assertion entries from collectGradingData
 * @returns {Array<{ assertion_id: string, frequency: number, scenario_count: number, scenarios: string[], hash: string }>}
 */
function buildRetirementCandidates(weakEntries) {
  /** @type {Map<string, { assertion_id: string, count: number, scenarios: Set<string> }>} */
  const buckets = new Map();

  for (const entry of weakEntries) {
    const id = (entry.assertion_id || '').trim();
    if (!id) continue;

    if (!buckets.has(id)) {
      buckets.set(id, { assertion_id: id, count: 0, scenarios: new Set() });
    }

    const bucket = buckets.get(id);
    bucket.count++;
    if (entry.scenario) bucket.scenarios.add(entry.scenario);
  }

  const candidates = [];
  for (const [, bucket] of buckets) {
    candidates.push({
      assertion_id: bucket.assertion_id,
      frequency: bucket.count,
      scenario_count: bucket.scenarios.size,
      scenarios: [...bucket.scenarios].sort(),
      hash: stableHash(bucket.assertion_id),
    });
  }

  // Sort by descending frequency
  candidates.sort((a, b) => b.frequency - a.frequency);

  return candidates;
}

/**
 * Run a full audit of the grading history.
 *
 * Collects all grading.json data, then builds promotion and retirement
 * candidate lists. Read-only — never modifies scenario files.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {{
 *   trialCount: number,
 *   promotionCandidates: Array<{ text: string, frequency: number, failure_rate: number, score: number, scenarios: string[], hash: string }>,
 *   retirementCandidates: Array<{ assertion_id: string, frequency: number, scenario_count: number, scenarios: string[], hash: string }>
 * }}
 */
function runAudit(projectRoot) {
  const { claimsEntries, weakEntries, trialCount } = collectGradingData(projectRoot);
  const promotionCandidates = buildPromotionCandidates(claimsEntries);
  const retirementCandidates = buildRetirementCandidates(weakEntries);

  return { trialCount, promotionCandidates, retirementCandidates };
}

module.exports = {
  collectGradingData,
  buildPromotionCandidates,
  buildRetirementCandidates,
  runAudit,
  stableHash,
};
