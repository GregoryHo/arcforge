// scripts/lib/session-utils.js
const fs = require('node:fs');
const path = require('node:path');

const {
  getArcforgeHome,
  getProjectDiariesDir,
  getDateDiariesDir,
  getProjectSessionsDir,
  getSessionDir,
  sanitizeSessionId,
  sanitizeProjectName,
  sanitizeFilename,
  atomicWriteFile,
} = require('./utils');
const { getDateDirs, findLatestSessionRecord, getSessionById } = require('./session-records');

// The marker the diary draft template leaves in every unfilled section.
const DIARY_PLACEHOLDER = 'TO BE ENRICHED';

function getDiaryPath(project, date, sessionId) {
  return path.join(getDateDiariesDir(project, date), `diary-${sanitizeSessionId(sessionId)}.md`);
}

/**
 * Save diary file, creating parent directories if needed.
 */
function saveDiary(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

/**
 * Get processed.log path for project or global.
 */
function getProcessedLogPath(project) {
  const base = path.join(getArcforgeHome(), 'diaryed');
  return project
    ? path.join(base, project, 'processed.log')
    : path.join(base, 'global', 'processed.log');
}

/**
 * Parse processed.log and return set of processed diary filenames.
 */
function parseProcessedLog(logPath) {
  const processed = new Set();
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8');
    for (const line of content.split('\n')) {
      if (line.trim() && !line.startsWith('#')) {
        const [filename] = line.split('|').map((s) => s.trim());
        if (filename) processed.add(filename);
      }
    }
  }
  return processed;
}

/**
 * Whether a file in a diary date directory counts toward reflection (B-8,
 * D-042): a regular file, read successfully, with no TO BE ENRICHED
 * placeholder. Anything unreadable — a dangling symlink, a file gone between
 * readdir and read, permission denied — is uncountable, never enriched.
 * scanDiaries and determineReflectStrategy share this so the strategy picker,
 * the scan and the Stop nudge agree about the same directory (#169).
 */
function isCountableDiary(dirPath, fileName) {
  if (!fileName.startsWith('diary-') || !fileName.endsWith('.md')) return false;
  const filePath = path.join(dirPath, fileName);
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    return !fs.readFileSync(filePath, 'utf-8').includes(DIARY_PLACEHOLDER);
  } catch {
    // Unreadable: uncountable — counting it would claim content nobody can read.
    return false;
  }
}

/**
 * Scan for diary files based on strategy.
 */
function scanDiaries(project, strategy, processedLogPath) {
  const diariesDir = getProjectDiariesDir(project);
  if (!fs.existsSync(diariesDir)) return [];

  const processed = parseProcessedLog(processedLogPath);
  const allDiaries = [];

  const dateDirs = fs
    .readdirSync(diariesDir)
    .filter((d) => fs.statSync(path.join(diariesDir, d)).isDirectory())
    .sort();

  for (const dateDir of dateDirs) {
    const dirPath = path.join(diariesDir, dateDir);
    const diaries = fs
      .readdirSync(dirPath)
      .filter((f) => isCountableDiary(dirPath, f))
      .map((f) => path.join(dirPath, f))
      .sort();
    allDiaries.push(...diaries);
  }

  if (strategy === 'unprocessed') {
    return allDiaries.filter((d) => !processed.has(path.basename(d)));
  } else if (strategy === 'project_focused') {
    return allDiaries.slice(0, 10);
  } else {
    return allDiaries.slice(-10);
  }
}

/**
 * Determine which reflection strategy to use.
 */
function determineReflectStrategy(project, processedLogPath) {
  const diariesDir = getProjectDiariesDir(project);
  if (!fs.existsSync(diariesDir)) return 'recent_window';

  const allDiaries = [];
  const dateDirs = fs
    .readdirSync(diariesDir)
    .filter((d) => fs.statSync(path.join(diariesDir, d)).isDirectory());
  for (const dateDir of dateDirs) {
    const dirPath = path.join(diariesDir, dateDir);
    const diaries = fs.readdirSync(dirPath).filter((f) => isCountableDiary(dirPath, f));
    allDiaries.push(...diaries);
  }

  // Count unprocessed
  const processed = parseProcessedLog(processedLogPath);
  const unprocessed = allDiaries.filter((d) => !processed.has(d));

  if (unprocessed.length >= 5) return 'unprocessed';
  if (allDiaries.length >= 5) return 'project_focused';
  return 'recent_window';
}

/**
 * Append processed diary entries to log.
 */
function updateProcessedLog(logPath, diaryFiles, reflectionId) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const lines = diaryFiles.map((d) => `${path.basename(d)} | ${date} | ${reflectionId}\n`).join('');

  fs.appendFileSync(logPath, lines, 'utf-8');
}

// ─────────────────────────────────────────────
// Session Archive (cli B-9, D-056)
// ─────────────────────────────────────────────
//
// An archive is `sessions/<project>/<date>/archive-<alias>.md`: an H1, the
// engine-written metrics header (ARCHIVE_HEADER_FIELDS, from the
// session-tracker record), then the five handover sections the caller wrote.
// It never carries text of the user's messages (learning B-20). A
// `.handovers/<date>-<slug>.md` file is the same five sections without the
// header, so one reader serves both.

const HANDOVER_SECTIONS = ['Where it stands', 'Done', 'Unfinished', 'Decisions', 'Next'];
const V5_SECTIONS = ['Summary', 'What Worked', 'What Failed', 'Blockers', 'Next Step'];
const ARCHIVE_HEADER_FIELDS = [
  'Project',
  'Alias',
  'Saved',
  'Session',
  'Metrics',
  'Record started',
  'Duration',
  'Tool calls',
  'User messages',
  'Files modified',
];
const ARCHIVE_PREFIX = 'archive-';
const DEFAULT_LIST_LIMIT = 20;

/**
 * Split markdown into its H1 title, the preamble before the first `## `
 * heading, and every `## ` section. A `## ` line inside a fenced code block is
 * body text, not a heading.
 * @param {string} content
 * @returns {{ title: string|null, preamble: string, sections: Object<string, string> }}
 * @throws {Error} on a heading that appears twice
 */
function parseSessionSections(content) {
  const sections = {};
  const preamble = [];
  let current = null;
  let body = [];
  let inFence = false;

  const close = () => {
    if (current !== null) sections[current] = body.join('\n').trim();
  };

  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith('## ')) {
      close();
      current = line.slice(3).trim();
      if (Object.hasOwn(sections, current)) throw new Error(`duplicate section "${current}"`);
      body = [];
    } else if (current !== null) {
      body.push(line);
    } else {
      preamble.push(line);
    }
  }
  close();

  const titleLine = preamble.find((l) => l.startsWith('# '));
  return {
    title: titleLine ? titleLine.slice(2).trim() : null,
    preamble: preamble.join('\n').trim(),
    sections,
  };
}

/**
 * Read the five handover sections out of an archive or a handover file.
 * Lenient (resume) ignores any other section; strict (save) rejects other
 * sections and empty slots, so an archive holds the five and nothing else.
 * @param {string} content - Markdown
 * @param {string} source - Where it came from, for error messages
 * @param {{ strict?: boolean }} [options]
 * @returns {{ title: string|null, preamble: string, sections: Object<string, string> }}
 * @throws {Error} naming the source and what is wrong
 */
function readHandover(content, source, { strict = false } = {}) {
  if (typeof content !== 'string') throw new Error(`${source}: input must be a string`);
  let parsed;
  try {
    parsed = parseSessionSections(content);
  } catch (err) {
    throw new Error(`${source}: ${err.message}`);
  }
  const headings = Object.keys(parsed.sections);
  const missing = HANDOVER_SECTIONS.filter((h) => !headings.includes(h));
  if (missing.length > 0) {
    if (headings.some((h) => V5_SECTIONS.includes(h))) {
      throw new Error(
        `${source}: the v5 session archive format (${V5_SECTIONS.join(' / ')}) is not ` +
          `supported — only the five handover sections are read: ${HANDOVER_SECTIONS.join(', ')}`,
      );
    }
    throw new Error(`${source}: missing handover section(s): ${missing.join(', ')}`);
  }
  if (strict) {
    const order = headings.filter((h) => HANDOVER_SECTIONS.includes(h));
    if (order.join('\n') !== HANDOVER_SECTIONS.join('\n')) {
      throw new Error(
        `${source}: sections out of order (${order.join(', ')}) — they go ` +
          `${HANDOVER_SECTIONS.join(', ')}`,
      );
    }
    const extra = headings.filter((h) => !HANDOVER_SECTIONS.includes(h));
    if (extra.length > 0) {
      throw new Error(
        `${source}: unexpected section(s): ${extra.join(', ')} — an archive holds only ` +
          `the five handover sections`,
      );
    }
    const empty = HANDOVER_SECTIONS.filter((h) => parsed.sections[h] === '');
    if (empty.length > 0) {
      throw new Error(
        `${source}: empty section(s): ${empty.join(', ')} — write none in a slot with nothing in it`,
      );
    }
  }
  const sections = Object.fromEntries(HANDOVER_SECTIONS.map((h) => [h, parsed.sections[h]]));
  return { title: parsed.title, preamble: parsed.preamble, sections };
}

/**
 * The metrics header lines, as the record stood at its lastUpdated stamp. The
 * tracker resets its counters at each diary capture and `started` at each
 * resume, so the counts are never session totals and the stamp line says so.
 * Only counts and paths are read — never userMessageContent (learning B-20).
 */
function archiveHeader(record, { project, alias, savedAt }) {
  const none = 'none recorded';
  const lines = [
    `**Project:** ${project}`,
    `**Alias:** ${alias}`,
    `**Saved:** ${savedAt}`,
    `**Session:** ${record?.sessionId || none}`,
  ];
  if (!record) {
    lines.push('**Metrics:** no session-tracker record for this project');
    for (const field of ARCHIVE_HEADER_FIELDS.slice(5)) lines.push(`**${field}:** unknown`);
    return lines;
  }
  const minutes =
    record.started && record.lastUpdated
      ? Math.round((new Date(record.lastUpdated) - new Date(record.started)) / 60000)
      : null;
  const files = Array.isArray(record.filesModified) ? record.filesModified : [];
  lines.push(
    `**Metrics:** as the session-tracker record holds them at ${record.lastUpdated || none} — ` +
      "since the record's last diary capture or resume, not since the session began; " +
      'the current turn may not be counted',
  );
  lines.push(`**Record started:** ${record.started || none}`);
  lines.push(`**Duration:** ${Number.isFinite(minutes) ? `~${minutes} minutes` : none}`);
  lines.push(`**Tool calls:** ${record.toolCalls ?? none}`);
  lines.push(`**User messages:** ${record.userMessages ?? none}`);
  lines.push(`**Files modified:** ${files.length > 0 ? files.length : none}`);
  for (const f of files) lines.push(`- ${f}`);
  return lines;
}

/**
 * Render an archive: H1, metrics header, the five sections in order.
 * @param {Object|null} record - session-tracker record, or null when none exists
 * @param {{ title: string|null, sections: Object<string, string> }} handover - from readHandover
 * @param {{ project: string, alias: string, date: string, savedAt: string }} meta
 * @returns {string} Archive markdown
 */
function generateSession(record, handover, meta) {
  const lines = [`# ${handover.title || `${meta.alias} — ${meta.date}`}`, ''];
  lines.push(...archiveHeader(record, meta), '');
  for (const heading of HANDOVER_SECTIONS) {
    lines.push(`## ${heading}`, handover.sections[heading], '');
  }
  return lines.join('\n');
}

/**
 * Save the caller's five sections as an archive and point the alias at it.
 * Every refusal (alias, an existing name or file without force, input, an
 * unknown --session) happens before anything is written.
 * @param {string} project
 * @param {string} alias
 * @param {string} input - Markdown holding the five sections (an optional H1 is the title)
 * @param {{ now?: Date, sessionId?: string, force?: boolean }} [options]
 * @returns {{ alias: string, path: string, project: string, isNew: boolean, session: string|null }}
 * @throws {Error} naming what was refused, or a failed write
 */
function saveArchive(project, alias, input, { now = new Date(), sessionId, force = false } = {}) {
  const { validateAlias, resolveAlias, setAlias } = require('./session-aliases');
  const check = validateAlias(alias);
  if (!check.valid) throw new Error(`Invalid alias: ${check.error}`);
  if (!force && resolveAlias(project, alias)) {
    throw new Error(`alias "${alias}" already exists — pass --force to overwrite it`);
  }
  const handover = readHandover(input, 'session input', { strict: true });
  const record =
    sessionId === undefined ? findLatestSessionRecord(project) : getSessionById(project, sessionId);

  const savedAt = now.toISOString();
  const date = savedAt.slice(0, 10);
  const fileName = sanitizeFilename(`${ARCHIVE_PREFIX}${alias}.md`);
  const archivePath = path.join(getSessionDir(project, date), fileName);
  if (!force && fs.existsSync(archivePath)) {
    throw new Error(`archive ${archivePath} already exists — pass --force to overwrite it`);
  }
  atomicWriteFile(
    archivePath,
    generateSession(record, handover, { project, alias, date, savedAt }),
  );

  const result = setAlias(project, alias, archivePath, handover.title, { force });
  if (!result.success) {
    throw new Error(`Archive written to ${archivePath}, but alias "${alias}": ${result.error}`);
  }
  return {
    alias,
    path: archivePath,
    project,
    isNew: result.isNew,
    session: record?.sessionId || null,
  };
}

/**
 * The project's archives, newest first, each with every alias pointing at it.
 * Files other than `archive-*.md` (v5's `session-*.md` included) are not listed.
 * @param {string} project
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ date: string, path: string, title: string|null, aliases: string[] }>}
 */
function listArchives(project, { limit = DEFAULT_LIST_LIMIT } = {}) {
  const sessionsDir = getProjectSessionsDir(project);
  if (!fs.existsSync(sessionsDir)) return [];
  const { listAliases } = require('./session-aliases');
  const aliasesByPath = new Map();
  for (const a of listAliases(project)) {
    const key = path.resolve(a.sessionPath);
    aliasesByPath.set(key, [...(aliasesByPath.get(key) || []), a.name]);
  }

  const archives = [];
  for (const date of getDateDirs(sessionsDir)) {
    const dir = path.join(sessionsDir, date);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(ARCHIVE_PREFIX) && f.endsWith('.md'))
      .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { file } of files) {
      const firstLine = fs.readFileSync(file, 'utf-8').split('\n', 1)[0];
      archives.push({
        date,
        path: file,
        title: firstLine.startsWith('# ') ? firstLine.slice(2).trim() : null,
        aliases: aliasesByPath.get(file) || [],
      });
    }
  }
  return archives.slice(0, limit);
}

/**
 * Resolve `resume`'s argument: a bare name is an alias of this project; a
 * value with a path separator or ending `.md` is a file path (relative to cwd).
 * @param {string} project
 * @param {string} ref - Alias or path
 * @param {string} cwd - Base for a relative path
 * @returns {string} Absolute path to an existing file
 * @throws {Error} naming the alias or path that did not resolve
 */
function resolveSessionRef(project, ref, cwd) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error('Expected an alias or a path');
  }
  const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
  if (ref.includes('/') || ref.includes('\\') || ref.endsWith('.md')) {
    const resolved = path.resolve(cwd, ref);
    if (!isFile(resolved)) throw new Error(`not a file: ${resolved}`);
    return resolved;
  }
  const { resolveAlias } = require('./session-aliases');
  const entry = resolveAlias(project, ref);
  if (!entry) throw new Error(`no session alias "${ref}" in project "${project}"`);
  const resolved = path.resolve(entry.sessionPath);
  if (!isFile(resolved)) throw new Error(`alias "${ref}" points at ${resolved}, not a file`);
  return resolved;
}

/**
 * The briefing `resume` prints: where it came from, the archive header (or a
 * handover's title), then the five sections. It changes nothing.
 * @param {string} content - Archive or handover markdown
 * @param {string} sourcePath
 * @returns {string}
 * @throws {Error} when the content is not the five sections (v5 included)
 */
function formatSessionBriefing(content, sourcePath) {
  const { preamble, sections } = readHandover(content, sourcePath);
  const lines = [`Source: ${sourcePath}`, ''];
  if (preamble) lines.push(preamble, '');
  for (const heading of HANDOVER_SECTIONS) {
    lines.push(`## ${heading}`, sections[heading], '');
  }
  return lines.join('\n').trimEnd();
}

// ─────────────────────────────────────────────
// Observation & Instinct Path Helpers
// ─────────────────────────────────────────────

/**
 * Root for instinct storage. Also hosts observer daemon coordination
 * files — see `getObserverSignalFile` / `getObserverPidFile`.
 */
function getInstinctsRoot() {
  return path.join(getArcforgeHome(), 'instincts');
}

function getObservationsPath(project) {
  return path.join(getArcforgeHome(), 'observations', project, 'observations.jsonl');
}

function getInstinctsDir(project) {
  return path.join(getInstinctsRoot(), project);
}

function getInstinctsArchivedDir(project) {
  return path.join(getInstinctsDir(project), 'archived');
}

function getGlobalInstinctsDir() {
  return path.join(getInstinctsRoot(), 'global');
}

function getInstinctsGlobalIndex() {
  return path.join(getInstinctsRoot(), 'global-index.jsonl');
}

function getObserverSignalFile() {
  return path.join(getInstinctsRoot(), '.last_signal');
}

function getObserverPidFile() {
  return path.join(getInstinctsRoot(), '.observer.lock', 'pid');
}

function getEvolvedLogPath() {
  return path.join(getArcforgeHome(), 'evolved', 'evolved.jsonl');
}

// ─────────────────────────────────────────────
// Instinct keyspace migration (ICL-3)
// ─────────────────────────────────────────────
//
// Active instinct files were historically written under a hash-keyed
// directory (`instincts/<project_id>/`) by Layer 8 activation, while the
// injection/decay side resolves them under a name-keyed directory
// (`instincts/<project>/`). The two never matched, so dashboard-activated
// instincts could never be loaded. The keyspace is now unified to the
// name-keyed dir. This one-time, idempotent migration relocates any
// previously-activated instinct files from a stale (hash-keyed) project dir
// into the canonical name-keyed dir for the current project.
//
// Each active instinct file embeds its source candidate scope in a fenced
// JSON metadata block, so the correct destination is read from the file
// itself — no hash→name mapping table is required.

// Reserved entries directly under the instincts root that are NOT
// project-scoped instinct directories (must never be migrated).
const RESERVED_INSTINCT_ROOT_ENTRIES = new Set([
  'global',
  'global-index.jsonl',
  '.last_signal',
  '.observer.lock',
]);

/**
 * Extract the embedded `scope.project` slug from an active instinct file.
 * Active files written by Layer 8 carry the source candidate metadata in a
 * fenced ```json block. Returns the sanitized project slug, or null when the
 * file has no parseable project scope (e.g. global-scoped or malformed).
 */
function readInstinctProjectScope(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const meta = JSON.parse(match[1]);
    const project = meta.scope?.project;
    if (typeof project !== 'string' || !project.trim()) return null;
    return sanitizeProjectName(project);
  } catch {
    return null;
  }
}

/**
 * Migrate active instinct files belonging to `project` from any stale
 * (hash-keyed) directory under the instincts root into the canonical
 * name-keyed directory `instincts/<project>/`.
 *
 * Idempotent: files already in the name-keyed dir are left untouched, and a
 * second invocation is a no-op. Collision-safe: if a file with the same
 * basename already exists at the destination, the source is left in place
 * (never overwrites an active artifact).
 *
 * @param {string} project — name-keyed project slug (e.g. getProjectName()).
 * @returns {{ moved: string[], skipped: string[] }} basenames moved / skipped.
 */
function migrateInstinctsToNameKey(project) {
  const result = { moved: [], skipped: [] };
  if (typeof project !== 'string' || !project.trim()) return result;

  const targetProject = sanitizeProjectName(project);
  const root = getInstinctsRoot();
  const destDir = getInstinctsDir(targetProject);

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return result; // instincts root absent — nothing to migrate
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (RESERVED_INSTINCT_ROOT_ENTRIES.has(entry.name)) continue;
    // Already the canonical name-keyed dir for this project — nothing to move.
    if (entry.name === targetProject) continue;

    const sourceDir = path.join(root, entry.name);
    let files;
    try {
      files = fs.readdirSync(sourceDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const sourcePath = path.join(sourceDir, file);
      try {
        if (!fs.statSync(sourcePath).isFile()) continue;
      } catch {
        continue;
      }
      if (readInstinctProjectScope(sourcePath) !== targetProject) continue;

      const destPath = path.join(destDir, file);
      if (fs.existsSync(destPath)) {
        result.skipped.push(file); // collision — never overwrite
        continue;
      }
      try {
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(sourcePath, destPath);
        result.moved.push(file);
      } catch {
        result.skipped.push(file);
      }
    }
  }

  return result;
}

module.exports = {
  getDiaryPath,
  saveDiary,
  getProcessedLogPath,
  parseProcessedLog,
  scanDiaries,
  determineReflectStrategy,
  updateProcessedLog,
  // Session archive
  HANDOVER_SECTIONS,
  ARCHIVE_HEADER_FIELDS,
  parseSessionSections,
  readHandover,
  generateSession,
  saveArchive,
  listArchives,
  resolveSessionRef,
  formatSessionBriefing,
  // Observation & Instinct paths
  getObservationsPath,
  getInstinctsRoot,
  getInstinctsDir,
  getInstinctsArchivedDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
  getObserverSignalFile,
  getObserverPidFile,
  getEvolvedLogPath,
  migrateInstinctsToNameKey,
  readInstinctProjectScope,
};
