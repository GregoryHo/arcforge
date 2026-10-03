// scripts/lib/session-records.js
//
// Read-only lookups over the session-tracker records
// (`sessions/<project>/<date>/session-*.json`, written by hooks/session-tracker/).
// The session archive's metrics header (cli B-9) is read from one of them.

const fs = require('node:fs');
const path = require('node:path');
const { getProjectSessionsDir } = require('./utils');

/**
 * Get all date directories sorted by date descending.
 * @param {string} parentDir - Directory containing YYYY-MM-DD subdirectories
 * @returns {string[]} Date directory names sorted newest-first
 */
function getDateDirs(parentDir) {
  return fs
    .readdirSync(parentDir)
    .filter((entry) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) return false;
      return fs.statSync(path.join(parentDir, entry)).isDirectory();
    })
    .sort()
    .reverse();
}

/** Parsed records in one date directory; an unparseable file is skipped. */
function readRecords(dir) {
  const records = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.startsWith('session-') || !file.endsWith('.json')) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')));
    } catch {
      // A record mid-write or corrupt is not one we can report from; skip it.
    }
  }
  return records;
}

const byLastUpdatedDesc = (a, b) => String(b.lastUpdated).localeCompare(String(a.lastUpdated));

/**
 * The project's most recent session-tracker record: the most recently updated
 * `session-*.json` in the newest date directory that holds one.
 * @param {string} project
 * @returns {Object|null}
 */
function findLatestSessionRecord(project) {
  const sessionsDir = getProjectSessionsDir(project);
  if (!fs.existsSync(sessionsDir)) return null;
  for (const date of getDateDirs(sessionsDir)) {
    const records = readRecords(path.join(sessionsDir, date));
    if (records.length > 0) return records.sort(byLastUpdatedDesc)[0];
  }
  return null;
}

/**
 * The record whose sessionId starts with `idPrefix` (`session-` optional).
 * The same id in several date directories is one session; its latest record wins.
 * @param {string} project
 * @param {string} idPrefix
 * @returns {Object}
 * @throws {Error} when no record or more than one session matches
 */
function getSessionById(project, idPrefix) {
  if (typeof idPrefix !== 'string' || idPrefix.trim() === '') {
    throw new Error('--session needs a session id prefix');
  }
  const normalized = idPrefix.startsWith('session-') ? idPrefix : `session-${idPrefix}`;
  const sessionsDir = getProjectSessionsDir(project);
  const latestById = new Map();
  if (fs.existsSync(sessionsDir)) {
    for (const date of getDateDirs(sessionsDir)) {
      for (const record of readRecords(path.join(sessionsDir, date))) {
        if (typeof record.sessionId !== 'string' || !record.sessionId.startsWith(normalized)) {
          continue;
        }
        const seen = latestById.get(record.sessionId);
        if (!seen || byLastUpdatedDesc(record, seen) < 0) latestById.set(record.sessionId, record);
      }
    }
  }
  if (latestById.size === 0) {
    throw new Error(
      `no session-tracker record matches --session "${idPrefix}" in project "${project}"`,
    );
  }
  if (latestById.size > 1) {
    const ids = [...latestById.keys()].sort();
    throw new Error(`--session "${idPrefix}" matches ${ids.length} records: ${ids.join(', ')}`);
  }
  return [...latestById.values()][0];
}

module.exports = { getDateDirs, findLatestSessionRecord, getSessionById };
