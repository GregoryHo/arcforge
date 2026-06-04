/**
 * marker.js - canonical reader for the `.arcforge-epic` worktree marker.
 *
 * The marker is written into an epic worktree root by `coordinator.expandWorktrees`
 * and is the single source of truth linking a checkout back to its spec-id. It is
 * the one high-precision discriminator arcforge has for "am I inside an epic
 * worktree" — `Coordinator.dagPath`, `cli.resolveSpecId`, and the arc-guard hook
 * all parse it, so they must stay in lockstep on how they read it.
 *
 * Extracted into this lightweight module so hot-path callers (e.g. a PreToolUse
 * hook that fires on every Bash call) can check for / read the marker without
 * pulling in the ~1000-line coordinator module.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseDagYaml } = require('./yaml-parser');

const MARKER_FILENAME = '.arcforge-epic';

/**
 * Absolute path to the marker within a directory.
 * @param {string} dir - Directory expected to hold the marker (typically a worktree root).
 * @returns {string|null} marker path, or null when `dir` is not a usable string
 */
function markerPath(dir) {
  if (typeof dir !== 'string' || !dir) return null;
  return path.join(dir, MARKER_FILENAME);
}

/**
 * Cheap existence check — does `dir` carry an `.arcforge-epic` marker?
 * Use this on hot paths; it does no YAML parsing.
 * @param {string} dir
 * @returns {boolean}
 */
function hasArcforgeMarker(dir) {
  const p = markerPath(dir);
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Read and parse the `.arcforge-epic` marker, returning the parsed object or
 * null when the file is missing / unreadable. The schema carries at least
 * `{ epic, spec_id, base_worktree, base_branch, local }` when authored by
 * `expandWorktrees`.
 * @param {string} dir
 * @returns {Object|null}
 */
function readArcforgeMarker(dir) {
  const p = markerPath(dir);
  if (!p || !hasArcforgeMarker(dir)) return null;
  try {
    return parseDagYaml(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { MARKER_FILENAME, markerPath, hasArcforgeMarker, readArcforgeMarker };
