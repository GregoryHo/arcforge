/**
 * eval-skill-staging.js - What a skill-scope arm is injected with
 *
 * By default an arm is injected with the text of a skill file and nothing else.
 * With staging, the directory that file sits in is copied to a temporary
 * directory outside the trial tree and the injection opens with the host's own
 * "Base directory for this skill:" line, so the arm reaches the skill's scripts
 * and references the way a session with the skill loaded would. The copy
 * belongs to the injection: an arm injected with nothing gets none, and cannot
 * list one from inside `<projectRoot>/.eval-trials/`.
 *
 * One call stages one directory. A run that needs a second skill's files in an
 * arm calls stageSkillDir again for that directory and adds its own
 * base-directory line; nothing here assumes a single staged directory per run.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Never part of a skill's own files: version control and installed dependencies. */
const SKIP_NAMES = new Set(['.git', 'node_modules', '.venv', '__pycache__']);

/**
 * Hash of an injected skill text, as rows and preflight records carry it.
 * @param {string} text - The skill file's text
 * @returns {string} First 16 hex characters of the SHA-256 digest
 */
function hashSkillText(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * The line a host opens a loaded skill with.
 * @param {string} dir - The skill's base directory
 * @returns {string}
 */
function baseDirectoryLine(dir) {
  return `Base directory for this skill: ${dir}`;
}

/**
 * Copy the directory a skill file sits in to a fresh directory under the
 * system temp dir.
 * @param {string} skillFile - Absolute path to the skill file
 * @returns {string} Absolute path of the copy
 */
function stageSkillDir(skillFile) {
  if (typeof skillFile !== 'string' || !path.isAbsolute(skillFile)) {
    throw new Error(`stageSkillDir: skillFile must be an absolute path, got ${skillFile}`);
  }
  const source = path.dirname(skillFile);
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-eval-skill-'));
  try {
    fs.cpSync(source, staged, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (src) => !SKIP_NAMES.has(path.basename(src)),
    });
  } catch (err) {
    removeStagedDir(staged);
    throw new Error(`Failed to stage skill files from ${source}: ${err.message}`);
  }
  return staged;
}

/**
 * Remove a staged copy. Only a directory stageSkillDir made is removed.
 * @param {string|null|undefined} staged - Path stageSkillDir returned
 */
function removeStagedDir(staged) {
  if (!staged || !path.basename(staged).startsWith('arcforge-eval-skill-')) return;
  fs.rmSync(staged, { recursive: true, force: true });
}

/**
 * Build what one arm is injected with. An arm given no text is injected with
 * nothing and gets no staged directory.
 * @param {Object} arm
 * @param {string} [arm.text] - Skill text to inject
 * @param {string} [arm.skillFile] - Absolute path the text was read from (staging needs it)
 * @param {boolean} [arm.stage] - Stage the skill file's directory for this arm
 * @returns {{ text: string|null, textHash: string|null, baseDir: string|null }}
 *   text is what is prepended to the scenario context; the hash is of the skill
 *   text alone, since the base-directory line differs on every run
 */
function buildInjection({ text, skillFile, stage } = {}) {
  if (!text) return { text: null, textHash: null, baseDir: null };
  const textHash = hashSkillText(text);
  if (!stage) return { text, textHash, baseDir: null };
  if (!skillFile) {
    throw new Error('Staging skill files needs the path of the skill file, and none was given');
  }
  const baseDir = stageSkillDir(skillFile);
  return { text: `${baseDirectoryLine(baseDir)}\n\n${text}`, textHash, baseDir };
}

module.exports = {
  hashSkillText,
  baseDirectoryLine,
  stageSkillDir,
  removeStagedDir,
  buildInjection,
};
