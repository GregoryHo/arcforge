/**
 * eval-modality.js - Scenario grading modality detection for eval harness (fr-gr-005)
 *
 * Determines whether a scenario's assertions are graded exclusively by model,
 * exclusively by code, or by a mix — used by the blind-comparator auto-trigger rule.
 *
 * Zero external dependencies — Node.js standard library only.
 */

/**
 * Determine the grading modality of a scenario.
 *
 * @param {import('./eval').EvalScenario} scenario - Parsed eval scenario
 * @returns {'all-model' | 'all-code' | 'mixed'} Grading modality
 *
 * Mapping:
 *   grader='model'  → 'all-model'  (every assertion is LLM-graded)
 *   grader='mixed'  → 'mixed'      (mix of behavioral/code and model assertions)
 *   grader='code'   → 'all-code'   (purely programmatic grading)
 *   grader='human'  → 'all-code'   (no LLM auto-grading, treat as non-model)
 *   grader=anything else → 'all-code'  (safe default)
 */
function getScenarioGradingMode(scenario) {
  const grader = (scenario && scenario.grader) || 'code';
  if (grader === 'model') return 'all-model';
  if (grader === 'mixed') return 'mixed';
  return 'all-code';
}

module.exports = { getScenarioGradingMode };
