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
 * The skill a skill-scope A/B injects, and whether its files are staged. A
 * workflow A/B injects no skill text, so it takes no staging either.
 * @param {{ scope: string, target?: string }} scenario
 * @param {string} projectRoot
 * @param {{ skillFile?: string, stage?: boolean }} given - Parsed CLI values
 * @returns {{ skillFile?: string, skillPath?: string, skillInstruction?: string, stageSkillFiles: boolean }}
 *   skillFile is the path as given (for display), skillPath the resolved one
 */
function resolveSkillOptions(scenario, projectRoot, given) {
  const skillFile = given.skillFile || scenario.target;
  const stageSkillFiles = Boolean(given.stage);
  if (scenario.scope === 'workflow') {
    if (stageSkillFiles) {
      throw new Error(
        'eval ab --stage-skill-files is refused for a workflow-scope scenario: staging belongs to an injected skill text, and a workflow A/B injects none (B-19).',
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
  return { skillFile, skillPath: skill.path, skillInstruction: skill.text, stageSkillFiles };
}

module.exports = { readSkillFile, resolveSkillOptions };
