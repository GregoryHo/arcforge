/**
 * eval-skill-options.js - Resolve what `eval ab` injects into its arms.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Read a skill file named on the command line or by the scenario.
 * @param {string} file - Path as given, relative to the project root or absolute
 * @param {string} projectRoot
 * @returns {{ path: string, text: string }} Absolute path and contents
 */
function readSkillFile(file, projectRoot) {
  const resolved = path.resolve(projectRoot, file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`skill file not found: ${file}`);
  }
  return { path: resolved, text: fs.readFileSync(resolved, 'utf8') };
}

/**
 * The text a baseline is given in place of nothing (B-20), with the conditions
 * it adds to a run.
 * @param {string|undefined} file - The --baseline-skill-file value
 * @param {string} projectRoot
 * @returns {{ baselineSkillFile?: string, baselineSkillInstruction?: string, baselineSkillHash?: string }}
 */
function readBaselineSkill(file, projectRoot) {
  if (!file) return {};
  const { hashSkillText } = require('../lib/eval-skill-staging');
  const baseline = readSkillFile(file, projectRoot);
  return {
    baselineSkillFile: baseline.path,
    baselineSkillInstruction: baseline.text,
    baselineSkillHash: hashSkillText(baseline.text),
  };
}

/**
 * The skill a skill-scope A/B injects, the text its baseline is given if any,
 * and whether skill files are staged. A workflow A/B injects no skill text, so
 * it takes neither a baseline text nor staging.
 * @param {{ scope: string, target?: string }} scenario
 * @param {string} projectRoot
 * @param {{ skillFile?: string, baselineSkillFile?: string, stage?: boolean }} given - Parsed CLI values
 * @returns {{ skillFile?: string, skillPath?: string, skillInstruction?: string, stageSkillFiles: boolean, baselineSkillFile?: string, baselineSkillInstruction?: string, baselineSkillHash?: string }}
 *   skillFile is the path as given (for display), skillPath the resolved one
 */
function resolveSkillOptions(scenario, projectRoot, given) {
  const skillFile = given.skillFile || scenario.target;
  const stageSkillFiles = Boolean(given.stage);
  if (scenario.scope === 'workflow') {
    const refused = [
      stageSkillFiles ? '--stage-skill-files' : '',
      given.baselineSkillFile ? '--baseline-skill-file' : '',
    ].filter(Boolean);
    if (refused.length > 0) {
      throw new Error(
        `eval ab ${refused.join(' and ')} is refused for a workflow-scope scenario: both belong to an injected skill text, and a workflow A/B injects none (B-19, B-20).`,
      );
    }
    return { skillFile, stageSkillFiles };
  }
  if (!skillFile) {
    throw new Error(
      'eval ab for skill scope requires --skill-file <path> or ## Target in scenario',
    );
  }
  const skill = readSkillFile(skillFile, projectRoot);
  return {
    skillFile,
    skillPath: skill.path,
    skillInstruction: skill.text,
    stageSkillFiles,
    ...readBaselineSkill(given.baselineSkillFile, projectRoot),
  };
}

module.exports = { readSkillFile, readBaselineSkill, resolveSkillOptions };
