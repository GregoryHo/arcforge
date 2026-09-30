/**
 * evidence-files.js — Layer 3 selection of the typed evidence files (diary,
 * reflect, recall) that ride in a CuratorBatch beside the observations.
 *
 * Extracted from batch-assembler.js. Under a `sinceMs` (the instant the
 * current opt-in took effect, learning B-1) a file is selected only when its
 * own timestamp says it was recorded at or after that instant; older files are
 * left out and left where they are.
 */

const fs = require('node:fs');
const path = require('node:path');

const { sanitizeObservationPayload } = require('../sanitize-observation');
const { sha256Truncated } = require('../utils');
const { draftIsStale } = require('../diary-capture');

// Per Section 4 Slice E + Layer 3 open question #2: first-slice bounds
const MAX_DIARIES = 5;
const MAX_REFLECTS = 10;
const MAX_RECALLS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Walk a directory recursively, collecting files matching a name pattern.
// Returns { path, mtime } sorted by mtime descending.
// ---------------------------------------------------------------------------

function walkFilesByMtime(dir, namePattern) {
  const files = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && namePattern.test(entry.name)) {
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          // unreadable; sort to the end
        }
        files.push({ path: full, mtime });
      }
    }
  }
  walk(dir);
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

// ---------------------------------------------------------------------------
// Recorded-since checks — each kind's own timestamp
// ---------------------------------------------------------------------------

/**
 * A diary lives at `diaries/<project>/<YYYY-MM-DD>/diary-<session>[-draft].md`,
 * so its own date is the directory it is filed under. A day cannot order a
 * diary against an opt-in made that same day, so the file's write time must
 * also be at or after the stamp: a diary counts only when both are. The write
 * time is the EARLIER of creation and last modification — the same floor the
 * stale-draft check uses — so editing or touching a diary written before the
 * opt-in cannot pull it into a batch.
 */
function diaryRecordedSince(file, sinceMs) {
  const day = path.basename(path.dirname(file.path));
  if (!DATE_DIR_RE.test(day)) return false;
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(dayStart) || dayStart + DAY_MS <= sinceMs) return false;
  let stat;
  try {
    stat = fs.statSync(file.path);
  } catch {
    return false;
  }
  // birthtime is 0 on filesystems that don't record it; fall back to mtime.
  const writtenAt = stat.birthtimeMs > 0 ? Math.min(stat.mtimeMs, stat.birthtimeMs) : stat.mtimeMs;
  return writtenAt >= sinceMs;
}

/** Reflect and recall records carry `created_at` in their frontmatter. */
function createdAtRecordedSince(file, sinceMs) {
  let raw;
  try {
    raw = fs.readFileSync(file.path, 'utf8');
  } catch {
    return false;
  }
  const block = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  if (!block) return false;
  const line = block[1].match(/^created_at:\s*["']?([^"'\n]+)["']?\s*$/m);
  return line !== null && Date.parse(line[1]) >= sinceMs;
}

// ---------------------------------------------------------------------------
// Read recent typed-evidence files (diary / reflect / recall)
// ---------------------------------------------------------------------------

// Per-kind config: subdir under the arcforge dir, filename regex, max-count, ID
// field name on the item, a builder for the kind-specific extra fields, and the
// kind's recorded-since check. Shared shape across all three is applied in
// readRecentEvidence below.
//
// Note: evidence_id is derived from filePath (sha256[:12]). It's stable across runs
// for the same file, but not content-addressed — content rename = same id. Content
// identity is captured separately by source_ref.content_hash.
const EVIDENCE_KIND_CONFIG = {
  diary: {
    subdir: 'diaries',
    pattern: /^diary-.*\.md$/,
    maxN: () => MAX_DIARIES,
    idField: 'diary_id',
    store: 'diary',
    buildExtra: (sanitized) => ({ summary: sanitized }),
    recordedSince: diaryRecordedSince,
    // Drafts whose enricher never ran still carry the TO BE ENRICHED stub.
    // Skip them so a failed enrichment degrades to MISSING evidence rather
    // than feeding template placeholders into the curator (S5-5).
    skipStale: true,
  },
  reflect: {
    subdir: 'reflections',
    pattern: /^reflect-.*\.md$/,
    maxN: () => MAX_REFLECTS,
    idField: 'reflect_id',
    store: 'reflect',
    buildExtra: (sanitized) => ({
      pattern_summary: sanitized,
      supporting_sessions: [],
      support_count: 0,
    }),
    recordedSince: createdAtRecordedSince,
  },
  recall: {
    subdir: 'recalls',
    pattern: /^recall-.*\.md$/,
    maxN: () => MAX_RECALLS,
    idField: 'recall_id',
    store: 'recall',
    buildExtra: (sanitized) => ({ user_authored: true, summary: sanitized }),
    recordedSince: createdAtRecordedSince,
  },
};

/**
 * @param {'diary'|'reflect'|'recall'} kind
 * @param {string} arcforgeDir - the arcforge home
 * @param {string} project
 * @param {number|null} [sinceMs] - when set, only files recorded at or after it
 */
function readRecentEvidence(kind, arcforgeDir, project, sinceMs = null) {
  const cfg = EVIDENCE_KIND_CONFIG[kind];
  if (!cfg) throw new Error(`readRecentEvidence: unknown kind "${kind}"`);

  const dir = path.join(arcforgeDir, cfg.subdir, project);
  if (!fs.existsSync(dir)) return { items: [], scanned: 0, selected: 0 };

  const allFiles = walkFilesByMtime(dir, cfg.pattern);
  const scanned = allFiles.length;
  // Filter before selecting so the maxN budget is spent on eligible evidence:
  // nothing from before the current opt-in (B-1), and no unenriched diary stubs
  // (S5-5).
  const inPeriod =
    sinceMs === null ? allFiles : allFiles.filter((f) => cfg.recordedSince(f, sinceMs));
  const eligible = cfg.skipStale ? inPeriod.filter((f) => !draftIsStale(f.path)) : inPeriod;
  const selected = eligible.slice(0, cfg.maxN());

  const items = [];
  for (const { path: filePath } of selected) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const sanitized = sanitizeObservationPayload(raw, 2000);
      const itemId = path.basename(filePath, '.md');

      items.push({
        evidence_id: `evd-${kind}-${sha256Truncated(filePath, 12)}`,
        evidence_type: kind,
        [cfg.idField]: itemId,
        project,
        project_id: '',
        created_at: '',
        ...cfg.buildExtra(sanitized),
        source_ref: {
          store: cfg.store,
          path_hash: sha256Truncated(filePath, 16),
          content_hash: sha256Truncated(raw, 16),
        },
      });
    } catch {
      // skip unreadable files
    }
  }

  return { items, scanned, selected: items.length };
}

module.exports = { MAX_DIARIES, MAX_REFLECTS, MAX_RECALLS, readRecentEvidence };
