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
 * A copy belongs to one trial: each trial of an injected arm is staged a copy
 * of its own, removed when that trial ends (trialArm), so what a trial writes
 * into its copy is never what a later trial is given.
 *
 * One call stages one directory. A run that needs a second skill's files in an
 * arm calls stageSkillDir again for that directory and adds its own
 * base-directory line; nothing here assumes a single staged directory per trial.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isProcessAlive } = require('./eval-run-lock');

/** What a staged copy is named: this, the PID of the run that staged it, a random suffix. */
const STAGED_PREFIX = 'arcforge-eval-skill-';

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
 * The directory a skill file sits in, links resolved: the one path that is
 * both digested and copied, so a directory reached through a link
 * (`linked-skill -> real-skill`) is staged as the directory it names.
 * @param {string} skillFile - Absolute path to the skill file
 * @returns {string}
 */
function skillDirOf(skillFile) {
  return fs.realpathSync.native(path.dirname(skillFile));
}

/**
 * The line a host opens a loaded skill with.
 * @param {string} dir - The skill's base directory
 * @returns {string}
 */
function baseDirectoryLine(dir) {
  return `Base directory for this skill: ${dir}`;
}

const COPIED = ' once the directory is copied';

/**
 * Refuse a symlink the copy would keep pointing outside the skill directory.
 * The copy keeps a link as it is, so such a link would hand the arm a path the
 * write check does not watch and the digest does not cover. The target is
 * followed, not read as text: a relative path can leave through another link.
 * @param {string} realRoot - The directory the link must stay in, symlinks resolved
 * @param {string} entry - Path of an entry under it
 * @param {string} link - The path the error names: the entry as the operator gave it
 * @param {string} [where] - Appended to the reason when the entry is a copy
 */
function refuseEscapingLink(realRoot, entry, link, where = '') {
  if (!fs.lstatSync(entry).isSymbolicLink()) return;
  const target = fs.readlinkSync(entry);
  if (path.isAbsolute(target)) {
    throw new Error(`Cannot stage ${link}: its link target ${target} is an absolute path`);
  }
  let real;
  try {
    // The OS resolver: fs.realpathSync collapses `link/..` as text before following `link`.
    real = fs.realpathSync.native(entry);
  } catch (err) {
    throw new Error(
      `Cannot stage ${link}: its link target ${target} does not resolve${where} (${err.code})`,
    );
  }
  const rel = path.relative(realRoot, real);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(
      `Cannot stage ${link}: its link target ${target} is outside the skill directory${where}`,
    );
  }
}

/** Copies this process staged and has not removed yet. */
const live = new Set();
let removesOnExit = false;

/**
 * Remove a copy when the process exits, however it gets there. No signal is
 * handled: a trial is a synchronous child, so a SIGINT or SIGTERM listener
 * would not run until the whole run had finished, and the run could no longer
 * be interrupted. A killed run's copy is left for removeAbandonedCopies.
 * @param {string} staged - Path of a copy just made
 */
function removeOnExit(staged) {
  live.add(staged);
  if (removesOnExit) return;
  removesOnExit = true;
  // `process.exit()` skips a caller's finally block; this does not.
  process.once('exit', () => {
    for (const dir of [...live]) removeStagedDir(dir);
  });
}

/**
 * Remove the copies of runs that were killed before they could: those under
 * the system temp dir named for a process that is gone. As with the run lock,
 * a PID reused by a live process keeps its copy until removed by hand.
 */
function removeAbandonedCopies() {
  const owner = new RegExp(`^${STAGED_PREFIX}(\\d+)-`);
  for (const name of fs.readdirSync(os.tmpdir())) {
    const pid = Number(name.match(owner)?.[1]);
    if (!pid || isProcessAlive(pid)) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    } catch {
      // Another user's leftover in a shared temp dir: not this run's to remove,
      // and no reason to refuse this run.
    }
  }
}

/**
 * Copy the directory a skill file sits in to a fresh directory under the
 * system temp dir. A symlink is copied as a link, and refused unless its
 * target is a relative path that resolves inside the directory, both where the
 * directory sits and in the copy: `../<the directory's name>/x` stays inside the
 * first and leaves the second.
 * @param {string} skillFile - Absolute path to the skill file
 * @returns {string} Absolute path of the copy
 */
function stageSkillDir(skillFile) {
  if (typeof skillFile !== 'string' || !path.isAbsolute(skillFile)) {
    throw new Error(`stageSkillDir: skillFile must be an absolute path, got ${skillFile}`);
  }
  const source = path.dirname(skillFile);
  let staged;
  try {
    const realRoot = skillDirOf(skillFile);
    // Ahead of the copy: the digest names an entry that cannot be staged (a
    // FIFO, a socket), where cpSync fails without naming it.
    digestSkillDir(realRoot);
    removeAbandonedCopies();
    staged = fs.mkdtempSync(path.join(os.tmpdir(), `${STAGED_PREFIX}${process.pid}-`));
    removeOnExit(staged);
    // From the resolved directory: with verbatimSymlinks a source that is itself
    // a link would be copied as that link, over the directory just made.
    fs.cpSync(realRoot, staged, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (src) => {
        if (src === realRoot) return true;
        if (SKIP_NAMES.has(path.basename(src))) return false;
        refuseEscapingLink(realRoot, src, path.join(source, path.relative(realRoot, src)));
        return true;
      },
    });
    const realStaged = fs.realpathSync.native(staged);
    // Only real directories are entered: a walk that follows a link to a
    // directory never returns from `sub/a -> ..` beside `sub/b -> ..`.
    const check = (rel) => {
      for (const entry of fs.readdirSync(path.join(staged, rel), { withFileTypes: true })) {
        const childRel = path.join(rel, entry.name);
        if (entry.isDirectory()) check(childRel);
        else {
          const named = path.join(source, childRel);
          refuseEscapingLink(realStaged, path.join(staged, childRel), named, COPIED);
        }
      }
    };
    check('');
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
  if (!staged || !path.basename(staged).startsWith(STAGED_PREFIX)) return;
  fs.rmSync(staged, { recursive: true, force: true });
  live.delete(staged);
}

/**
 * The staged copies a trial left with other content than was staged. The write
 * check compares each file's mtime, size and mode, so a rewrite that puts all
 * three back passes it; this reads the content. A write confined to a
 * directory the digest leaves out (SKIP_NAMES) is not seen here either.
 * @param {Array<{ dir: string, filesHash: string }>} [copies] - Every copy staged for the trial
 * @returns {string[]} Paths of the copies that changed
 */
function changedCopies(copies = []) {
  const changed = ({ dir, filesHash }) => {
    try {
      return digestSkillDir(dir) !== filesHash;
    } catch {
      return true; // gone, or holding what cannot be digested: not what was staged
    }
  };
  return copies.filter(changed).map(({ dir }) => dir);
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
 * The staged copies of a trial's injections, as changedCopies checks them.
 * @param {Array<{ baseDir: string|null, filesHash: string|null }>} injections - From buildInjection
 * @returns {Array<{ dir: string, filesHash: string }>}
 */
function stagedCopies(injections) {
  return injections
    .filter(({ baseDir }) => baseDir)
    .map(({ baseDir, filesHash }) => ({ dir: baseDir, filesHash }));
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
 * One arm of a run, staged again for each of its trials (B-19). The arm is
 * staged once here and the copy removed, so a directory that cannot be staged
 * is refused before any trial runs, and the digest every row records is
 * taken. A later copy with another digest means the skill directory changed
 * under the run, and is refused: its rows would not be of one arm.
 * @param {Object} scenario - Parsed scenario
 * @param {{ text?: string, skillFile?: string, stage?: boolean }} arm - As buildInjection
 * @returns {{ textHash: string|null, filesHash: string|null, forTrial: () => { scenario: Object, skillInjection: { baseDir: string|null, copies: Array<{ dir: string, filesHash: string }> }, remove: () => void } }}
 *   forTrial stages a copy for one trial: the scenario as that trial runs it,
 *   the part of runTrial's skillInjection that is the trial's own, and what
 *   removes the copy once the trial has ended
 */
function trialArm(scenario, arm) {
  const first = buildInjection(arm);
  removeStagedDir(first.baseDir);
  const { textHash, filesHash } = first;
  const forTrial = () => {
    const injection = buildInjection(arm);
    if (injection.filesHash !== filesHash) {
      removeStagedDir(injection.baseDir);
      throw new Error(
        `Skill files in ${path.dirname(arm.skillFile)} changed during the run: staged as ${filesHash} when it started, ${injection.filesHash} now`,
      );
    }
    return {
      scenario: withInjection(scenario, injection),
      skillInjection: { baseDir: injection.baseDir, copies: stagedCopies([injection]) },
      remove: () => removeStagedDir(injection.baseDir),
    };
  };
  return { textHash, filesHash, forTrial };
}

/**
 * The baseline arm on its own, as `eval preflight` runs it. Nothing is staged
 * until the first trial asks for the arm, so the caller can hold this across
 * its own checks.
 * @param {Object} scenario - Parsed scenario
 * @param {{ text?: string, skillFile?: string, stage?: boolean }} baseline - As buildInjection
 * @returns {{ arm: () => { scenario: Object, skillInjection: Object, remove: () => void } }}
 *   arm stages a copy for one trial; skillInjection as runTrial takes it, and
 *   remove is owed once that trial has ended
 */
function baselineArm(scenario, baseline) {
  let staging = null;
  const arm = () => {
    staging = staging || trialArm(scenario, baseline);
    const { textHash, filesHash } = staging;
    const trial = staging.forTrial();
    return {
      scenario: trial.scenario,
      remove: trial.remove,
      skillInjection: {
        ...trial.skillInjection,
        textHash,
        filesHash,
        // Without a baseline text nothing is staged, whatever was asked for.
        staged: Boolean(filesHash),
        baselineHash: textHash,
        baselineFilesHash: filesHash,
      },
    };
  };
  return { arm };
}

module.exports = {
  hashSkillText,
  digestSkillDir,
  baseDirectoryLine,
  skillDirOf,
  stageSkillDir,
  removeStagedDir,
  changedCopies,
  stagedCopies,
  buildInjection,
  withInjection,
  trialArm,
  baselineArm,
};
