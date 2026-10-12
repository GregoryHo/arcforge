/**
 * eval-preflight-gate.js - The preflight gate `eval ab` passes before any trial.
 */

/**
 * Require a PASS preflight for the baseline this A/B will run. The record is
 * keyed on the scenario's content, the model, and the conditions the baseline
 * runs under (the same resolution `eval preflight` used), so a PASS under
 * another model, budget, plugin dir, effort, ceiling or baseline text does not
 * unlock it. A scenario may opt out with `## Preflight\nskip`
 * (non-regression and non-interference scenarios); every other scenario gates.
 * @param {Object} scenario - Parsed scenario
 * @param {string} projectRoot
 * @param {Object} run - What the A/B was asked to run with
 * @param {string} [run.model]
 * @param {string} [run.effort]
 * @param {string} [run.pluginDir] - The --plugin-dir option
 * @param {number} [run.maxTurns] - The --max-turns option
 * @param {{ baselineSkillHash?: string, baselineSkillGiven?: string, baselineSkillFilesHash?: string }} [run.skill] -
 *   From resolveSkillOptions
 */
function requirePreflightPass(
  scenario,
  projectRoot,
  { model, effort, pluginDir, maxTurns, skill },
) {
  const eval_ = require('../lib/eval');
  const { checkPreflightGate, shouldSkipPreflightGate } = require('../lib/eval-preflight');
  if (shouldSkipPreflightGate(scenario)) {
    console.log(`Preflight: skipped by scenario policy (${scenario.name})`);
    return;
  }
  const abPluginDir = pluginDir || (scenario.scope === 'workflow' ? scenario.pluginDir : undefined);
  const shared = eval_.sharedArmOptions(scenario, { maxTurns, pluginDir: abPluginDir });
  const gateError = checkPreflightGate(scenario.name, projectRoot, {
    model,
    conditions: {
      maxTurns: shared.maxTurns,
      pluginDir: abPluginDir,
      effort,
      trialTimeoutMs: eval_.resolveTrialTimeoutMs(),
      baselineSkillHash: skill?.baselineSkillHash,
      baselineSkillFile: skill?.baselineSkillGiven,
      baselineSkillFilesHash: skill?.baselineSkillFilesHash,
    },
  });
  if (gateError) throw new Error(gateError);
}

module.exports = { requirePreflightPass };
