/**
 * compaction-analysis.js — correlate compact-suggester suggestions against
 * actual compactions (ICL-12).
 *
 * Validates whether the compact-suggester threshold constants (THRESHOLD /
 * INTERVAL in hooks/compact-suggester, MIN_TOOL_CALLS in thresholds.js) fire
 * near where compactions actually happen. The session JSON records two arrays:
 *   - suggestions[]: { count, phase, at }   (compact-suggester snapshots)
 *   - compactions[]: [ ISO-timestamp, ... ] (pre-compact markers)
 *
 * Each compaction is paired with the most recent preceding suggestion (the one
 * that "led to" it). From that single pairing we derive descriptive stats at any
 * sample size. A tuning RECOMMENDATION is gated behind a minimum compaction
 * sample so that synthetic or sparse data never licenses a constant change.
 *
 * Pure analysis (analyzeCompactions) is deterministic: no disk, no clock. A thin
 * impure loader (loadSessions) reads the on-disk session corpus.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Minimum number of paired compaction events required before this tool will
 * surface a tuning recommendation. Below this, the corpus is too small to draw
 * any conclusion and the recommendation is INSUFFICIENT_DATA. Matches the ICL-12
 * spec floor (~20).
 * @type {number}
 */
const MIN_COMPACTION_SAMPLES = 20;

/**
 * Recommendation value when fewer than MIN_COMPACTION_SAMPLES compactions are
 * present. A distinct literal so downstream consumers can switch on it.
 * @type {'insufficient data'}
 */
const INSUFFICIENT_DATA = 'insufficient data';

/**
 * Parse an ISO timestamp to epoch milliseconds. Returns null on any unparseable
 * value rather than NaN so callers can skip cleanly.
 * @param {string} ts
 * @returns {number|null}
 */
function toEpoch(ts) {
  if (typeof ts !== 'string') return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Pair each compaction with the latest suggestion whose timestamp is at or
 * before the compaction. Suggestions and compactions are matched within a single
 * session only.
 *
 * @param {Array<{count:number, phase:string, at:string}>} suggestions
 * @param {string[]} compactions
 * @returns {Array<{leadMs:number, count:number, phase:string}>} One entry per
 *   compaction that had a preceding suggestion (compactions with no preceding
 *   suggestion are omitted from pairs but counted by the caller).
 */
function pairSession(suggestions, compactions) {
  const sugg = (Array.isArray(suggestions) ? suggestions : [])
    .map((s) => ({
      epoch: toEpoch(s?.at),
      count: Number(s?.count) || 0,
      phase: s?.phase || 'unknown',
    }))
    .filter((s) => s.epoch !== null)
    .sort((a, b) => a.epoch - b.epoch);

  const pairs = [];
  for (const rawCompaction of Array.isArray(compactions) ? compactions : []) {
    const cEpoch = toEpoch(rawCompaction);
    if (cEpoch === null) continue;
    // Latest suggestion at or before this compaction.
    let match = null;
    for (const s of sugg) {
      if (s.epoch <= cEpoch) match = s;
      else break;
    }
    if (match) {
      pairs.push({ leadMs: cEpoch - match.epoch, count: match.count, phase: match.phase });
    }
  }
  return pairs;
}

/**
 * Compute the median of a numeric array. Returns null for an empty array.
 * @param {number[]} nums
 * @returns {number|null}
 */
function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Analyze a corpus of session objects, correlating suggestions against
 * compactions. Pure and deterministic — no disk, no clock.
 *
 * @param {Array<{suggestions?:Array, compactions?:Array}>} sessions
 * @returns {{
 *   sessionCount: number,
 *   compactionCount: number,
 *   suggestionCount: number,
 *   compactionsWithPrecedingSuggestion: number,
 *   pairs: Array<{leadMs:number, count:number, phase:string}>,
 *   medianLeadMs: number|null,
 *   countAtCompaction: { median:number|null, min:number|null, max:number|null },
 *   phaseAtCompaction: Object<string, number>,
 *   recommendation: string,
 * }}
 */
function analyzeCompactions(sessions) {
  if (!Array.isArray(sessions)) {
    throw new Error('analyzeCompactions: sessions must be an array');
  }

  let compactionCount = 0;
  let suggestionCount = 0;
  const pairs = [];

  for (const session of sessions) {
    const suggestions = Array.isArray(session?.suggestions) ? session.suggestions : [];
    const compactions = Array.isArray(session?.compactions) ? session.compactions : [];
    suggestionCount += suggestions.length;
    compactionCount += compactions.length;
    pairs.push(...pairSession(suggestions, compactions));
  }

  const counts = pairs.map((p) => p.count);
  const phaseAtCompaction = {};
  for (const p of pairs) {
    phaseAtCompaction[p.phase] = (phaseAtCompaction[p.phase] || 0) + 1;
  }

  // Recommendation is gated: synthetic or sparse corpora never license tuning.
  const recommendation =
    compactionCount < MIN_COMPACTION_SAMPLES
      ? INSUFFICIENT_DATA
      : `sufficient sample (${compactionCount} compactions): review count-at-compaction distribution (median ${median(counts)}) against THRESHOLD before tuning`;

  return {
    sessionCount: sessions.length,
    compactionCount,
    suggestionCount,
    compactionsWithPrecedingSuggestion: pairs.length,
    pairs,
    medianLeadMs: median(pairs.map((p) => p.leadMs)),
    countAtCompaction: {
      median: median(counts),
      min: counts.length ? Math.min(...counts) : null,
      max: counts.length ? Math.max(...counts) : null,
    },
    phaseAtCompaction,
    recommendation,
  };
}

/**
 * Load every session JSON under the arcforge sessions root. Thin impure loader;
 * the pure analysis lives in analyzeCompactions.
 *
 * @param {string} [sessionsRoot] - Defaults to ~/.arcforge/sessions.
 * @returns {Array<Object>} Parsed session objects (unreadable/invalid skipped).
 */
function loadSessions(sessionsRoot) {
  const root = sessionsRoot || path.join(os.homedir(), '.arcforge', 'sessions');
  const sessions = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return sessions; // No corpus yet.
  }
  // sessions/<project>/<date>/<session>.json — walk two levels deep.
  for (const projectEntry of entries) {
    if (!projectEntry.isDirectory()) continue;
    const projectDir = path.join(root, projectEntry.name);
    let dateEntries;
    try {
      dateEntries = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dateEntry of dateEntries) {
      if (!dateEntry.isDirectory()) continue;
      const dateDir = path.join(projectDir, dateEntry.name);
      let files;
      try {
        files = fs.readdirSync(dateDir);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          sessions.push(JSON.parse(fs.readFileSync(path.join(dateDir, file), 'utf-8')));
        } catch {
          // Skip unreadable/corrupt session files.
        }
      }
    }
  }
  return sessions;
}

module.exports = {
  MIN_COMPACTION_SAMPLES,
  INSUFFICIENT_DATA,
  analyzeCompactions,
  loadSessions,
  pairSession,
};

// Ad-hoc CLI: print the analysis of the on-disk corpus as JSON.
if (require.main === module) {
  console.log(JSON.stringify(analyzeCompactions(loadSessions()), null, 2));
}
