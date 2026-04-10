/**
 * worktree-paths.js - Canonical path helper for arcforge worktrees.
 *
 * Worktrees live under ~/.arcforge-worktrees/<project>-<hash>-<epic>/
 * where <hash> is a 6-char sha256 prefix of the absolute project root.
 * Storing worktrees outside the git tree keeps them from polluting the
 * working copy; the hash prevents collisions between same-named projects.
 *
 * All worktree path computation must go through this module. Hardcoded
 * paths in skills, rules, and tests will break when the derivation rule
 * evolves.
 */

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const WORKTREE_DIR_NAME = '.arcforge-worktrees';
const HASH_LENGTH = 6;
// Matches `<project>-<hash>-<epic>` where hash is exactly HASH_LENGTH hex chars.
// Greedy `.+` on both sides of a fixed-width hash anchor matches the last
// occurrence, which is what we want — project/epic may contain hyphens but
// the hash is always the final `-<hex>-` before the epic segment.
const WORKTREE_NAME_RE = new RegExp(`^(.+)-([0-9a-f]{${HASH_LENGTH}})-(.+)$`);

/**
 * Return the root directory that holds all arcforge worktrees.
 * @param {string} [homeDir] - Override for the home directory (for tests).
 * @returns {string}
 */
function getWorktreeRoot(homeDir) {
  return path.join(homeDir || os.homedir(), WORKTREE_DIR_NAME);
}

/**
 * Strip trailing separators without collapsing a root path like "/".
 */
function stripTrailingSlash(p) {
  return p.length > 1 ? p.replace(/[\\/]+$/, '') : p;
}

/**
 * Sanitize a project basename for use in the worktree directory name.
 * Replaces runs of non-[a-zA-Z0-9._-] characters with a single hyphen and
 * trims leading/trailing hyphens. Empty result falls back to "project".
 */
function sanitizeProjectName(name) {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'project';
}

/**
 * Return the first 6 hex chars of sha256(absolutePath), normalizing any
 * trailing separator so /foo and /foo/ produce the same hash.
 * @param {string} absolutePath
 * @returns {string}
 */
function hashRepoPath(absolutePath) {
  if (typeof absolutePath !== 'string') {
    throw new TypeError('hashRepoPath requires a string');
  }
  if (!path.isAbsolute(absolutePath)) {
    throw new Error(`hashRepoPath requires an absolute path, got: ${absolutePath}`);
  }
  const normalized = stripTrailingSlash(absolutePath);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Compose the worktree path for a given project + epic.
 *
 * @param {string} projectRoot - Absolute path to the repository root.
 * @param {string} epicId - Epic identifier (e.g. "epic-001").
 * @param {string} [homeDir] - Override for the home directory (for tests).
 * @returns {string} Absolute worktree path.
 */
function getWorktreePath(projectRoot, epicId, homeDir) {
  if (typeof projectRoot !== 'string' || !projectRoot) {
    throw new TypeError('getWorktreePath requires a non-empty projectRoot string');
  }
  if (!path.isAbsolute(projectRoot)) {
    throw new Error(`getWorktreePath requires an absolute projectRoot, got: ${projectRoot}`);
  }
  if (typeof epicId !== 'string' || !epicId.trim()) {
    throw new TypeError('getWorktreePath requires a non-empty epicId string');
  }

  const normalizedRoot = stripTrailingSlash(projectRoot);
  const projectName = sanitizeProjectName(path.basename(normalizedRoot));
  const hash = hashRepoPath(normalizedRoot);
  const dirName = `${projectName}-${hash}-${epicId}`;
  return path.join(getWorktreeRoot(homeDir), dirName);
}

/**
 * Parse an absolute worktree path back into {project, hash, epic}.
 * Returns null if the path is not under the worktree root or the basename
 * does not match the expected pattern.
 *
 * @param {string} worktreePath
 * @returns {{project: string, hash: string, epic: string} | null}
 */
function parseWorktreePath(worktreePath) {
  if (typeof worktreePath !== 'string' || !worktreePath) return null;

  const normalized = stripTrailingSlash(worktreePath);
  const root = getWorktreeRoot();
  const rel = path.relative(root, normalized);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  // Only a single segment under the root counts as a worktree dir.
  const segments = rel.split(path.sep);
  if (segments.length !== 1) return null;

  const match = segments[0].match(WORKTREE_NAME_RE);
  if (!match) return null;

  return { project: match[1], hash: match[2], epic: match[3] };
}

module.exports = {
  WORKTREE_DIR_NAME,
  getWorktreeRoot,
  hashRepoPath,
  getWorktreePath,
  parseWorktreePath,
};
