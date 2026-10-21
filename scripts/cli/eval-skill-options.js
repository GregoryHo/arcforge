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
  const { hashSkillText, digestSkillDir, skillDirOf } = require('../lib/eval-skill-staging');
  const baseline = readSkillFile(file, projectRoot);
  // An empty text is injected as no text, so its rows would pool with a baseline
  // given none while the preflight was keyed on the empty file's hash.
  if (baseline.text === '') {
    throw new Error(
      `--baseline-skill-file ${file} is empty: a baseline given an empty text is a baseline given none. Drop the flag, or name a file with text in it.`,
    );
  }
  return {
    ...(stage ? { baselineSkillFilesHash: digestSkillDir(skillDirOf(baseline.path)) } : {}),
    baselineSkillGiven: file,
    baselineSkillFile: baseline.path,
    baselineSkillInstruction: baseline.text,
    baselineSkillHash: hashSkillText(baseline.text),
  };
}

/**
 * The second skill directory a treatment is given (B-22): its path, and the
 * name and description its one injected line names it by.
 * @param {string|boolean|undefined} dir - The --also-stage value; true when given bare,
 *   undefined only when not given
 * @param {string} projectRoot
 * @param {boolean} stage - Whether skill files are staged; the flag requires it
 * @returns {{ dir: string, name: string, description: string }|undefined}
 */
function readAlsoStage(dir, projectRoot, stage) {
  if (dir === undefined) return undefined;
  // A bare `--also-stage` is parsed as a flag, and `--also-stage ""` as an empty
  // value: both refused, not run as an A/B without it.
  if (dir === true || !String(dir).trim()) {
    throw new Error('--also-stage requires a skill directory: --also-stage <skill-dir>.');
  }
  if (!stage) {
    throw new Error(
      `--also-stage requires --stage-skill-files: the second skill is reached through its staged copy, and without staging there is none (B-22).`,
    );
  }
  const resolved = path.resolve(projectRoot, dir);
  const skillMd = path.join(resolved, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    throw new Error(`--also-stage ${dir} has no SKILL.md: name a skill directory.`);
  }
  const { parse } = require('../lib/yaml-parser');
  const front = fs.readFileSync(skillMd, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const description = front ? parse(front[1]).description : undefined;
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error(
      `--also-stage ${dir}: its SKILL.md has no frontmatter description, which the line naming the skill carries.`,
    );
  }
  // The YAML reader keeps a block scalar's indicator as the value: refuse it
  // rather than name the skill `(>-)`.
  if (/^[>|][+-]?$/.test(description.trim())) {
    throw new Error(
      `--also-stage ${dir}: its SKILL.md description is a YAML block scalar (${description.trim()}), which is not read; write the description on one line.`,
    );
  }
  // A quoted `\n` is read as a newline, which would inject a line of its own.
  if (/[\r\n]/.test(description.trim())) {
    throw new Error(
      `--also-stage ${dir}: its SKILL.md description spans more than one line, which the line naming the skill cannot carry; write the description on one line.`,
    );
  }
  // The reader keeps a plain value's ` # comment`, which YAML drops; it
  // unquotes only a value quoted end to end, where a # is text.
  const raw = front[1].match(/^description:[ \t]*(.*?)[ \t]*\r?$/m)?.[1] || '';
  const quoted = raw.length > 1 && /^(["']).*\1$/.test(raw);
  const comment = quoted ? null : raw.match(/\s(#.*)$/);
  if (comment) {
    throw new Error(
      `--also-stage ${dir}: its SKILL.md description carries an inline YAML comment (${comment[1]}), which the line naming the skill would inject; write the description without it.`,
    );
  }
  return { dir: resolved, name: path.basename(resolved), description: description.trim() };
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
 * @param {{ baselineSkillFile?: string, stage?: boolean, alsoStage?: string }} given - Parsed CLI values
 * @returns {{ arm: Function, conditions: Object }} arm as
 *   baselineArm; conditions are what the preflight record is keyed on: the
 *   baseline text's hash, and the digest of its directory when it is staged
 */
function preflightBaseline(scenario, projectRoot, given) {
  if (given.alsoStage !== undefined) {
    throw new Error(
      'eval preflight refuses --also-stage: the second skill reaches the treatment only, and a preflight runs the baseline. Drop the flag; the A/B with it is gated by the same preflight (B-22).',
    );
  }
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
 * @param {{ skillFile?: string, baselineSkillFile?: string, stage?: boolean, alsoStage?: string }} given - Parsed CLI values
 * @returns {{ skillFile?: string, skillPath?: string, skillInstruction?: string, stageSkillFiles: boolean, baselineSkillFile?: string, baselineSkillInstruction?: string, baselineSkillHash?: string, alsoStage?: { dir: string, name: string, description: string } }}
 *   skillFile is the path as given (for display), skillPath the resolved one;
 *   alsoStage is the second skill directory the treatment is given (B-22)
 */
function resolveSkillOptions(scenario, projectRoot, given) {
  const skillFile = given.skillFile || scenario.target;
  const stageSkillFiles = Boolean(given.stage);
  if (given.alsoStage !== undefined && scenario.scope === 'workflow') {
    throw new Error(
      'eval ab --also-stage is refused for a workflow-scope scenario: it stages a second skill beside the injected one, and a workflow A/B injects none (B-22).',
    );
  }
  refuseSkillTextFlagsForWorkflow(scenario, given, 'ab');
  if (scenario.scope === 'workflow') return { skillFile, stageSkillFiles };
  if (!skillFile) {
    throw new Error(
      'eval ab for skill scope requires --skill-file <path> or ## Target in scenario',
    );
  }
  const skill = readSkillFile(skillFile, projectRoot);
  const alsoStage = readAlsoStage(given.alsoStage, projectRoot, stageSkillFiles);
  // An empty treatment text is injected as none, so nothing would be staged
  // while every row recorded the second skill.
  if (alsoStage && skill.text === '') {
    throw new Error(
      `--also-stage needs a treatment skill text: --skill-file ${skillFile} is empty, so nothing would be staged. Name a file with text in it.`,
    );
  }
  return {
    skillFile,
    skillPath: skill.path,
    skillInstruction: skill.text,
    stageSkillFiles,
    ...readBaselineSkill(given.baselineSkillFile, projectRoot, stageSkillFiles),
    alsoStage,
  };
}

module.exports = {
  skillNameFromFile,
  readSkillFile,
  readBaselineSkill,
  resolveSkillOptions,
  preflightBaseline,
};
