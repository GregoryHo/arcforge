/**
 * eval-skill-options.js - Resolve what `eval ab` injects into its arms.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * The name the blind comparator redacts for a skill file: its basename, or for
 * a `SKILL.md` the skill's directory (the basename "SKILL" names nothing).
 * @param {string} file - Skill file path
 * @returns {string}
 */
function skillNameFromFile(file) {
  const base = path.basename(file, '.md');
  return base.toUpperCase() === 'SKILL' ? path.basename(path.dirname(file)) : base;
}

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
 * @param {boolean} stage - Whether the baseline's files will be staged
 * @returns {{ baselineSkillGiven?: string, baselineSkillFile?: string, baselineSkillInstruction?: string, baselineSkillHash?: string, baselineSkillFilesHash?: string }}
 *   baselineSkillGiven is the path as given, baselineSkillFile the resolved one;
 *   baselineSkillFilesHash is the digest of the directory that will be staged
 */
function readBaselineSkill(file, projectRoot, stage) {
  if (!file) return {};
  const { hashSkillText, digestSkillDir } = require('../lib/eval-skill-staging');
  const baseline = readSkillFile(file, projectRoot);
  return {
    ...(stage ? { baselineSkillFilesHash: digestSkillDir(path.dirname(baseline.path)) } : {}),
    baselineSkillGiven: file,
    baselineSkillFile: baseline.path,
    baselineSkillInstruction: baseline.text,
    baselineSkillHash: hashSkillText(baseline.text),
  };
}

/**
 * Refuse the skill-text flags on a workflow scenario: both belong to an injected
 * skill text, and a workflow comparison injects none.
 * @param {{ scope: string }} scenario
 * @param {{ baselineSkillFile?: string, stage?: boolean }} given - Parsed CLI values
 * @param {string} cmd - Subcommand name for the message
 */
function refuseSkillTextFlagsForWorkflow(scenario, given, cmd) {
  if (scenario.scope !== 'workflow') return;
  const refused = [
    given.stage ? '--stage-skill-files' : '',
    given.baselineSkillFile ? '--baseline-skill-file' : '',
  ].filter(Boolean);
  if (refused.length === 0) return;
  throw new Error(
    `eval ${cmd} ${refused.join(' and ')} is refused for a workflow-scope scenario: both belong to an injected skill text, and a workflow A/B injects none (B-19, B-20).`,
  );
}

/**
 * The baseline `eval preflight` runs: the one the A/B will run (B-20). Given a
 * baseline text it is injected with it, and its files are staged when staging
 * was asked for too; without one it is injected with nothing, so staging has
 * nothing to stage for it.
 * @param {{ scope: string }} scenario
 * @param {string} projectRoot
 * @param {{ baselineSkillFile?: string, stage?: boolean }} given - Parsed CLI values
 * @returns {{ arm: Function, remove: Function, conditions: Object }} arm/remove as
 *   baselineArm; conditions are what the preflight record is keyed on: the
 *   baseline text's hash, and the digest of its directory when it is staged
 */
function preflightBaseline(scenario, projectRoot, given) {
  refuseSkillTextFlagsForWorkflow(scenario, given, 'preflight');
  const { baselineArm } = require('../lib/eval-skill-staging');
  const stage = Boolean(given.stage);
  const baseline = readBaselineSkill(given.baselineSkillFile, projectRoot, stage);
  return {
    ...baselineArm(scenario, {
      text: baseline.baselineSkillInstruction,
      skillFile: baseline.baselineSkillFile,
      stage,
    }),
    conditions: baseline.baselineSkillHash
      ? {
          baselineSkillHash: baseline.baselineSkillHash,
          baselineSkillFile: baseline.baselineSkillGiven,
          baselineSkillFilesHash: baseline.baselineSkillFilesHash,
        }
      : {},
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
  refuseSkillTextFlagsForWorkflow(scenario, given, 'ab');
  if (scenario.scope === 'workflow') return { skillFile, stageSkillFiles };
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
    ...readBaselineSkill(given.baselineSkillFile, projectRoot, stageSkillFiles),
  };
}

module.exports = {
  skillNameFromFile,
  readSkillFile,
  readBaselineSkill,
  resolveSkillOptions,
  preflightBaseline,
};
