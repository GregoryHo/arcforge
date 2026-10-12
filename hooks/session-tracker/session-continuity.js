/**
 * Session Tracker - Session Continuity Line
 *
 * One line naming the project's newest session archive and the command that
 * reads it, for inject-context.js to add to both of its outputs. It names the
 * archive and never quotes it: no archive is opened here.
 */

const path = require('node:path');
const { latestArchive } = require('../../scripts/lib/session-archive');

// A session that is still going (resume, compact) needs no pointer to the
// previous one; only a fresh context does.
const FRESH_SOURCES = ['startup', 'clear'];

/** `p` as one shell word: bare when every character is safe, single-quoted otherwise. */
function shellWord(p) {
  return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the continuity line for a SessionStart.
 * @param {string} project
 * @param {string} source - The SessionStart payload's `source`
 * @returns {string|null} the line, or null when there is nothing to point at
 */
function loadSessionContinuity(project, source) {
  try {
    if (!FRESH_SOURCES.includes(source)) return null;
    // A session arcforge spawned itself (diary enricher, loop task session) is
    // not the user picking work back up — same marker loadPendingActions reads.
    if (process.env.ARCFORGE_SPAWNED) return null;

    const archive = latestArchive(project);
    if (!archive) return null;
    // The path is the one part not drawn from a fixed character set (it starts
    // at the arcforge home), and this line reaches the model.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char validation
    if (/[\x00-\x1f\x7f]/.test(archive.path)) return null;

    const name = archive.alias || path.basename(archive.path);
    const ref = archive.alias || shellWord(archive.path);
    return `Previous session archive: ${name}, saved ${archive.date}. Read it: arcforge session resume ${ref}`;
  } catch {
    // silent — never block SessionStart
    return null;
  }
}

module.exports = { loadSessionContinuity };
