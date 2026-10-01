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
const { writeAuditEntry } = require('./learning-audit-log');
const { getInstinctsDir, getInstinctsArchivedDir } = require('./session-utils');
const { atomicWriteFile, sanitizeFilename } = require('./utils');

/** The suffix the decay cycle gives an archive when the plain name is taken. */
const DATED_SUFFIX = /\.\d{4}-\d{2}-\d{2}(?:\.\d+)?$/;

/** Frontmatter keys that describe the archive, and are false of an active file. */
const ARCHIVE_STAMPS = new Set(['archived_at', 'archive_reason']);

/**
 * The archive files `name` can mean: the archive named exactly that, or an
 * archive of the instinct `name` that decay gave a dated name to.
 * @returns {string[]} file names under the archive directory
 */
function archiveMatches(archiveDir, name) {
  if (!fs.existsSync(archiveDir)) return [];
  return fs
    .readdirSync(archiveDir)
    .filter((file) => file.endsWith('.md'))
    .filter((file) => {
      const stem = path.basename(file, '.md');
      return stem === name || stem.replace(DATED_SUFFIX, '') === name;
    })
    .sort();
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
 * @returns {{ id: string, path: string, from: string, archive_reason?: string }}
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
    const stems = matches.map((file) => path.basename(file, '.md'));
    refuse(
      'ambiguous_archive',
      `${matches.length} archives of "${name}" in ${archiveDir}: ${stems.join(', ')} — ` +
        'restore one by its exact name, e.g. arcforge learn instinct restore ' +
        `${stems[stems.length - 1]} --project`,
      { candidates: stems },
    );
  }

  const archiveFile = matches[0];
  const fromPath = path.join(archiveDir, archiveFile);
  const id = path.basename(archiveFile, '.md').replace(DATED_SUFFIX, '');
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
  return {
    id,
    path: toPath,
    from: fromPath,
    ...(reason ? { archive_reason: String(reason) } : {}),
  };
}

module.exports = { restoreInstinct };
