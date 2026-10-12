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
 * Digest of a skill directory's content, as staging would copy it: what tells
 * two staged directories apart when their skill text is the same (B-20).
 *
 * Covered: every file and symlink under the directory, dotfiles included, in
 * sorted order of its relative path, each as its path, whether its owner may
 * execute it, and its bytes. A symlink is never followed: its target path
 * stands for it, as the copy keeps the link itself. Left out: the directories
 * staging leaves out (SKIP_NAMES), empty directories, and timestamps. Anything
 * else (a FIFO, a socket, a device) is refused, as the copy refuses it.
 * @param {string} dir - Skill directory, or a staged copy of one
 * @returns {string} First 16 hex characters of the SHA-256 digest
 */
function digestSkillDir(dir) {
  const entries = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (SKIP_NAMES.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile() || entry.isSymbolicLink()) entries.push(childRel);
      else throw new Error(`Cannot digest ${path.join(dir, childRel)}: not a file or a symlink`);
    }
  };
  walk('');
  const hash = crypto.createHash('sha256');
  for (const rel of entries.sort()) {
    const full = path.join(dir, rel);
    const stat = fs.lstatSync(full);
    const link = stat.isSymbolicLink();
    const body = link ? Buffer.from(fs.readlinkSync(full)) : fs.readFileSync(full);
    const kind = link ? 'link' : stat.mode & 0o100 ? 'exec' : 'file';
    // Length-prefixed, so no path or content can pass for another entry's.
    hash.update(`${kind} ${Buffer.byteLength(rel)} ${rel} ${body.length}\n`);
    hash.update(body);
  }
  return hash.digest('hex').slice(0, 16);
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
 * Refuse a symlink the copy would keep pointing outside the skill directory.
 * The copy keeps a link as it is, so such a link would hand the arm a path the
 * write check does not watch and the digest does not cover. The target is
 * followed, not read as text: a relative path can leave through another link.
 * @param {string} realRoot - The skill directory, symlinks resolved
 * @param {string} entry - Path of an entry under it
 */
function refuseEscapingLink(realRoot, entry) {
  if (!fs.lstatSync(entry).isSymbolicLink()) return;
  const target = fs.readlinkSync(entry);
  if (path.isAbsolute(target)) {
    throw new Error(`Cannot stage ${entry}: its link target ${target} is an absolute path`);
  }
  let real;
  try {
    // The OS resolver: fs.realpathSync collapses `link/..` as text before following `link`.
    real = fs.realpathSync.native(entry);
  } catch (err) {
    throw new Error(
      `Cannot stage ${entry}: its link target ${target} does not resolve (${err.code})`,
    );
  }
  const rel = path.relative(realRoot, real);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(
      `Cannot stage ${entry}: its link target ${target} is outside the skill directory`,
    );
  }
}

/**
 * Copy the directory a skill file sits in to a fresh directory under the
 * system temp dir. A symlink is copied as a link, and refused unless its
 * target is a relative path that resolves inside the directory.
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
    const realRoot = fs.realpathSync.native(source);
    fs.cpSync(source, staged, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (src) => {
        if (SKIP_NAMES.has(path.basename(src))) return false;
        if (src !== source) refuseEscapingLink(realRoot, src);
        return true;
      },
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
 * @returns {{ text: string|null, textHash: string|null, baseDir: string|null, filesHash: string|null }}
 *   text is what is prepended to the scenario context; the hash is of the skill
 *   text alone, since the base-directory line differs on every run; filesHash
 *   is the digest of the staged copy (digestSkillDir), null when nothing is staged
 */
function buildInjection({ text, skillFile, stage } = {}) {
  if (!text) return { text: null, textHash: null, baseDir: null, filesHash: null };
  const textHash = hashSkillText(text);
  if (!stage) return { text, textHash, baseDir: null, filesHash: null };
  if (!skillFile) {
    throw new Error('Staging skill files needs the path of the skill file, and none was given');
  }
  const baseDir = stageSkillDir(skillFile);
  let filesHash;
  try {
    filesHash = digestSkillDir(baseDir);
  } catch (err) {
    removeStagedDir(baseDir);
    throw new Error(`Failed to digest staged skill files in ${baseDir}: ${err.message}`);
  }
  return {
    text: `${baseDirectoryLine(baseDir)}\n\n${text}`,
    textHash,
    baseDir,
    filesHash,
  };
}

/**
 * A scenario as an injected arm runs it: the injection ahead of its context.
 * @param {Object} scenario - Parsed scenario
 * @param {{ text: string|null }} injection - From buildInjection
 * @returns {Object} The scenario itself for an arm injected with nothing
 */
function withInjection(scenario, { text }) {
  return text ? { ...scenario, context: `${text}\n\n${scenario.context}` } : scenario;
}

/**
 * The baseline arm on its own, as `eval preflight` runs it. Nothing is staged
 * until the first trial asks for the arm, so the caller can hold this across
 * its own checks and only owes a remove() once trials may have started.
 * @param {Object} scenario - Parsed scenario
 * @param {{ text?: string, skillFile?: string, stage?: boolean }} baseline - As buildInjection
 * @returns {{ arm: () => { scenario: Object, watchRoots: string[], skillInjection: Object }, remove: () => void }}
 */
function baselineArm(scenario, baseline) {
  let injection = null;
  const arm = () => {
    injection = injection || buildInjection(baseline);
    return {
      scenario: withInjection(scenario, injection),
      watchRoots: [injection.baseDir].filter(Boolean),
      skillInjection: {
        baseDir: injection.baseDir,
        textHash: injection.textHash,
        filesHash: injection.filesHash,
        staged: Boolean(baseline.stage),
        baselineHash: injection.textHash,
        baselineFilesHash: injection.filesHash,
      },
    };
  };
  return { arm, remove: () => removeStagedDir(injection?.baseDir) };
}

module.exports = {
  hashSkillText,
  digestSkillDir,
  baseDirectoryLine,
  stageSkillDir,
  removeStagedDir,
  buildInjection,
  withInjection,
  baselineArm,
};
