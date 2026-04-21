/**
 * eval-blind-autotrigger.js - Auto-trigger logic for blind comparator (fr-gr-005)
 *
 * Determines when to invoke the blind comparator after an A/B eval,
 * runs it once per (baseline, treatment) pair, and persists results.
 *
 * Rule:
 *   - all-model:  invoke blind comparator for each pair, surface preference rate
 *   - mixed:      skip, emit a note in the report
 *   - all-code:   skip silently (no mention)
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { runBlindComparator } = require('./eval-graders');
const { getScenarioGradingMode } = require('./eval-modality');

const RESULTS_DIR = path.join('evals', 'results');

/**
 * Save blind comparator preferences to blind.json for a given run.
 * @param {string} scenarioName - Scenario name (sanitized)
 * @param {string} runId - Run identifier (e.g., '20260420')
 * @param {Object[]} preferences - Array of per-pair blind decisions
 * @param {string} projectRoot - Project root directory
 */
function saveBlindResults(scenarioName, runId, preferences, projectRoot) {
  const runDir = path.join(projectRoot, RESULTS_DIR, scenarioName, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const blindPath = path.join(runDir, 'blind.json');
  const data = {
    scenario: scenarioName,
    runId,
    saved: new Date().toISOString(),
    blind_preferences: preferences,
  };
  fs.writeFileSync(blindPath, JSON.stringify(data, null, 2));
}

/**
 * Load previously saved blind comparator results.
 * @param {string} scenarioName - Scenario name
 * @param {string} runId - Run identifier
 * @param {string} projectRoot - Project root directory
 * @returns {Object|null} Loaded blind data, or null if not found
 */
function loadBlindResults(scenarioName, runId, projectRoot) {
  const blindPath = path.join(projectRoot, RESULTS_DIR, scenarioName, runId, 'blind.json');
  if (!fs.existsSync(blindPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(blindPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Compute preference rate counts from an array of blind decisions.
 * `errors` counts pairs whose comparator call failed (winner_original_label
 * is null). They are NOT folded into `tie` — that would silently inflate
 * tie counts and distort the supplementary preference signal.
 * @param {Object[]} preferences - Per-pair blind decisions
 * @returns {{ treatment: number, baseline: number, tie: number, errors: number, total: number }}
 */
function computePreferenceRate(preferences) {
  const rate = {
    treatment: 0,
    baseline: 0,
    tie: 0,
    errors: 0,
    total: preferences.length,
  };
  for (const p of preferences) {
    const label = p.winner_original_label;
    if (label === 'treatment') rate.treatment++;
    else if (label === 'baseline') rate.baseline++;
    else if (label === 'tie') rate.tie++;
    else rate.errors++;
  }
  return rate;
}

/**
 * Auto-trigger the blind comparator after an A/B eval, based on scenario modality.
 *
 * - all-model: runs blind comparator once per (baseline, treatment) pair.
 *   Pair count = min(baseline.length, treatment.length).
 *   Persists results to blind.json and returns preference rate.
 * - mixed: skips comparator, returns skipped=true with a skip note.
 * - all-code: skips comparator silently, returns skipped=true with no note.
 *
 * @param {import('./eval').EvalScenario} scenario - The eval scenario
 * @param {import('./eval').TrialResult[]} baseline - Baseline trial results
 * @param {import('./eval').TrialResult[]} treatment - Treatment trial results
 * @param {string} projectRoot - Project root directory
 * @param {Object} [opts] - Optional overrides
 * @param {string} [opts.runId] - Run ID for persisting results
 * @param {string} [opts.skillName] - Skill name for prompt sanitization
 * @returns {{
 *   skipped: boolean,
 *   skipNote?: string,
 *   blindPreferences?: Object[],
 *   preferenceRate?: { treatment: number, baseline: number, tie: number, total: number }
 * }}
 */
function runBlindAutoTrigger(scenario, baseline, treatment, projectRoot, opts = {}) {
  const modality = getScenarioGradingMode(scenario);

  if (modality === 'all-code') {
    // Silent skip — no mention in report
    return { skipped: true };
  }

  if (modality === 'mixed') {
    // Skip with a note
    return {
      skipped: true,
      skipNote: 'Blind comparator skipped: scenario mixes code-graded and model-graded assertions.',
    };
  }

  // all-model: run blind comparator once per pair
  const pairCount = Math.min(baseline.length, treatment.length);
  const taskPrompt = scenario.scenario || '';
  const { skillName, runId } = opts;

  const blindPreferences = [];

  for (let i = 0; i < pairCount; i++) {
    const baselineOutput = baseline[i].output || '';
    const treatmentOutput = treatment[i].output || '';

    const decision = runBlindComparator(
      taskPrompt,
      baselineOutput,
      treatmentOutput,
      projectRoot,
      skillName,
    );

    blindPreferences.push({
      pair: i + 1,
      winner_original_label: decision ? decision.winner_original_label : null,
      reasoning: decision ? decision.reasoning : null,
      score_baseline: decision ? decision.score_baseline : null,
      score_treatment: decision ? decision.score_treatment : null,
    });
  }

  const preferenceRate = computePreferenceRate(blindPreferences);

  // Persist results
  const effectiveRunId =
    runId ||
    (baseline[0] && baseline[0].runId) ||
    (baseline[0] && baseline[0].timestamp
      ? baseline[0].timestamp.slice(0, 10).replace(/-/g, '')
      : 'unknown');

  try {
    saveBlindResults(scenario.name, effectiveRunId, blindPreferences, projectRoot);
  } catch {
    /* persistence failure must not crash the eval run */
  }

  return { skipped: false, blindPreferences, preferenceRate };
}

module.exports = {
  runBlindAutoTrigger,
  saveBlindResults,
  loadBlindResults,
  computePreferenceRate,
};
