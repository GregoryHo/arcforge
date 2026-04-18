/**
 * worktree-paths.js - Canonical path helper for arcforge worktrees.
 *
 * Worktrees live under ~/.arcforge/worktrees/<project>-<hash>-<epic>/
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

const ARCFORGE_HOME_NAME = '.arcforge';
const WORKTREE_SUBDIR = 'worktrees';
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
  return path.join(homeDir || os.homedir(), ARCFORGE_HOME_NAME, WORKTREE_SUBDIR);
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
 * Return the first 6 hex chars of sha256(absolutePath[:specId]),
 * normalizing any trailing separator so /foo and /foo/ produce the same
 * hash. When specId is provided, it is folded into the hash input so
 * the same epic id across different specs produces different worktree
 * paths without changing the directory-name regex.
 *
 * @param {string} absolutePath
 * @param {string|null} [specId]
 * @returns {string}
 */
function hashRepoPath(absolutePath, specId = null) {
  if (typeof absolutePath !== 'string') {
    throw new TypeError('hashRepoPath requires a string');
  }
  if (!path.isAbsolute(absolutePath)) {
    throw new Error(`hashRepoPath requires an absolute path, got: ${absolutePath}`);
  }
  const normalized = stripTrailingSlash(absolutePath);
  const input = specId ? `${normalized}\u0000${specId}` : normalized;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Compose the worktree path for a given project + spec + epic.
 *
 * The spec id is folded into the 6-char hash rather than exposed as a
 * separate directory-name segment, so WORKTREE_NAME_RE stays stable
 * (existing parsers keep working). Distinct specs with the same epic
 * id still produce distinct paths because the hash input differs.
 *
 * @param {string} projectRoot - Absolute path to the repository root.
 * @param {string|null} specId - Spec identifier (null falls back to
 *   legacy single-spec hash; useful for pre-migration call sites).
 * @param {string} epicId - Epic identifier (e.g. "epic-001").
 * @param {string} [homeDir] - Override for the home directory (for tests).
 * @returns {string} Absolute worktree path.
 */
function getWorktreePath(projectRoot, specId, epicId, homeDir) {
  if (typeof projectRoot !== 'string' || !projectRoot) {
    throw new TypeError('getWorktreePath requires a non-empty projectRoot string');
  }
  if (!path.isAbsolute(projectRoot)) {
    throw new Error(`getWorktreePath requires an absolute projectRoot, got: ${projectRoot}`);
  }
  if (specId !== null && (typeof specId !== 'string' || !specId.trim())) {
    throw new TypeError('getWorktreePath requires a non-empty specId string or null');
  }
  if (typeof epicId !== 'string' || !epicId.trim()) {
    throw new TypeError('getWorktreePath requires a non-empty epicId string');
  }

  const normalizedRoot = stripTrailingSlash(projectRoot);
  const projectName = sanitizeProjectName(path.basename(normalizedRoot));
  const hash = hashRepoPath(normalizedRoot, specId);
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
  ARCFORGE_HOME_NAME,
  WORKTREE_SUBDIR,
  getWorktreeRoot,
  hashRepoPath,
  getWorktreePath,
  parseWorktreePath,
};
