// scripts/lib/session-utils.js
const fs = require('node:fs');
const path = require('node:path');

const {
  getArcforgeHome,
  getProjectDiariesDir,
  getDateDiariesDir,
  sanitizeSessionId,
  sanitizeProjectName,
} = require('./utils');

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
