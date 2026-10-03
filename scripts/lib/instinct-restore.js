/**
 * instinct-restore.js — the way back from the instinct archive (B-11, D-040).
 *
 * `restoreInstinct()` moves an archived instinct of one project back to the
 * project's instincts directory, whatever archived it: the decay cycle (which
 * stamps `archive_reason: decay` and may give the archive a dated name) or a
 * contradiction (which stamps `archived_at` only). It refuses a same-name
 * collision with an active instinct rather than overwrite either file, and
 * every outcome — restored or refused — is written to the learning audit log,
 * with no absolute path in the entry.
 *
 * Errors throw with context (lib tier); a refusal throws after it is audited.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { parseConfidenceFrontmatter } = require('./confidence');
const { readActivationState } = require('./learning-curator/activation-state');
const { writeAuditEntry } = require('./learning-audit-log');
const { getInstinctsDir, getInstinctsArchivedDir } = require('./session-utils');
const { atomicWriteFile } = require('./atomic-write');
const { getArcforgeHome, sanitizeFilename } = require('./utils');

/**
 * The instinct id an archive file holds. The file's own `id` wins. Without one,
 * the file name is the id, less the one suffix the decay cycle adds when the
 * plain name is taken — `.<archived_at>` or `.<archived_at>.<n>`, the archive
 * day it stamped into this same file — so an id that merely ends in a date
 * (`release.2026-09-20`) is never cut short.
 */
function archivedId(archiveDir, file) {
  const stem = path.basename(file, '.md');
  const { frontmatter } = parseConfidenceFrontmatter(
    fs.readFileSync(path.join(archiveDir, file), 'utf8'),
  );
  if (typeof frontmatter.id === 'string' && isSafeName(frontmatter.id)) return frontmatter.id;
  const day = typeof frontmatter.archived_at === 'string' ? frontmatter.archived_at : '';
  if (!day) return stem;
  // `<id>.<day>.<n>` (n >= 2) first, then `<id>.<day>` — plain string checks,
  // since `archived_at` is file content, not a pattern.
  const numbered = stem.match(/^(.+)\.(\d+)$/);
  const unnumbered = numbered && numbered[2] !== '1' ? numbered[1] : stem;
  const suffix = `.${day}`;
  if (unnumbered.endsWith(suffix) && unnumbered.length > suffix.length) {
    return unnumbered.slice(0, -suffix.length);
  }
  return stem;
}

function isSafeName(name) {
  try {
    sanitizeFilename(name);
    return true;
  } catch {
    return false;
  }
}

/** Frontmatter keys that describe the archive, and are false of an active file. */
const ARCHIVE_STAMPS = new Set(['archived_at', 'archive_reason']);

/**
 * The archives `name` can mean: the archive file named exactly that, or an
 * archive whose instinct id is `name`.
 * @returns {Array<{file: string, id: string}>}
 */
function archiveMatches(archiveDir, name) {
  if (!fs.existsSync(archiveDir)) return [];
  return fs
    .readdirSync(archiveDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ file, id: archivedId(archiveDir, file) }))
    .filter(({ file, id }) => path.basename(file, '.md') === name || id === name);
}

/** The archived content with the archive's own stamps removed from its frontmatter. */
function withoutArchiveStamps(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return content;
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return content;
  const kept = normalized
    .slice(4, end)
    .split('\n')
    .filter((line) => !ARCHIVE_STAMPS.has(line.slice(0, line.indexOf(':')).trim()));
  return `---\n${kept.join('\n')}${normalized.slice(end)}`;
}

/**
 * Move an archived instinct back to its project.
 *
 * @param {{ name: string, project: string, actor: object }} opts
 *   `name` is the instinct's name, or the exact name of one archive file
 *   (without `.md`) when several archives of that instinct exist.
 * @returns {{ id: string, path: string, from: string, injected: boolean, archive_reason?: string }}
 * @throws {Error} on a refusal (already audited) or an invalid name
 */
function restoreInstinct({ name, project, actor }) {
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error(`project must be a non-empty string (got ${JSON.stringify(project)})`);
  }
  sanitizeFilename(name);
  const instinctsDir = getInstinctsDir(project);
  const archiveDir = getInstinctsArchivedDir(project);
  const requestedAt = new Date().toISOString();
  const audit = (extra) =>
    writeAuditEntry({
      action_id: `restore_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      requested_at: requestedAt,
      action: 'instinct_restore',
      instinct_id: name,
      instinct_dir: project,
      actor,
      ...extra,
    });
  const refuse = (reason, message, extra = {}) => {
    audit({ accepted: false, reason, ...extra });
    throw new Error(`arcforge learn instinct restore refused: ${reason} — ${message}`);
  };

  const matches = archiveMatches(archiveDir, name);
  if (matches.length === 0) {
    refuse('instinct_not_archived', `no archived instinct named "${name}" in ${archiveDir}`);
  }
  // An exact archive name matches only itself, so several matches means the
  // plain instinct name was given and decay archived it more than once.
  if (matches.length > 1) {
    const stems = matches.map(({ file }) => path.basename(file, '.md'));
    refuse(
      'ambiguous_archive',
      `${matches.length} archives of "${name}" in ${archiveDir}: ${stems.join(', ')} — ` +
        'restore one by its exact name, e.g. arcforge learn instinct restore ' +
        `${stems[stems.length - 1]} --project`,
      { candidates: stems },
    );
  }

  const { file: archiveFile, id } = matches[0];
  const fromPath = path.join(archiveDir, archiveFile);
  const toPath = path.join(instinctsDir, `${id}.md`);
  const content = fs.readFileSync(fromPath, 'utf8');
  const reason = parseConfidenceFrontmatter(content).frontmatter.archive_reason;
  const where = {
    instinct_id: id,
    restored_from: path.join('archived', archiveFile),
    restored_to: `${id}.md`,
    ...(reason ? { archive_reason: String(reason) } : {}),
  };

  if (fs.existsSync(toPath)) {
    refuse(
      'active_instinct_exists',
      `an active instinct already exists at ${toPath}; the archived one is at ${fromPath}. ` +
        'Neither file was changed',
      where,
    );
  }

  // Copy, audit, then remove the archive — an audit that cannot be written
  // rolls the copy back, so no restore happens without its record (B-11).
  atomicWriteFile(toPath, withoutArchiveStamps(content));
  try {
    audit({ accepted: true, ...where });
  } catch (err) {
    fs.unlinkSync(toPath);
    throw new Error(`restore not performed — audit entry could not be written: ${err.message}`);
  }
  fs.unlinkSync(fromPath);
  // Restore moves a file; it never activates anything. Whether sessions receive
  // the instinct is the activation gate's answer, reported as it stands.
  const injected = readActivationState(getArcforgeHome()).activated.has(id);
  return {
    id,
    path: toPath,
    from: fromPath,
    injected,
    ...(reason ? { archive_reason: String(reason) } : {}),
  };
}

module.exports = { restoreInstinct };
