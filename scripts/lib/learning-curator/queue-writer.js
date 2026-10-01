/**
 * queue-writer.js — Layer 5 candidate store writer.
 *
 * Public API:
 *   appendCandidate(record, options)  — validate, sanitize, append to queue.jsonl
 *   rejectProposal(reasons, source)   — append rejection record to rejections.jsonl
 *   readRejections()                  — live rejections.jsonl records, newest first
 *   readCurrentCandidates()           — replay queue.jsonl, return current candidate map
 *   getQueuePath()                    — absolute path of the canonical queue.jsonl
 *
 * Paths are derived at call time through getArcforgeHome(), so ARCFORGE_HOME
 * redirects the whole candidate store (eval trials, e2e probes) and tests can
 * still redirect HOME. Before v6/P5 this resolved os.homedir() directly, which
 * meant an "isolated" trial wrote candidates into the real user home.
 *
 * All writes acquire ~/.arcforge/learning/candidates/store.lock (exclusive).
 * Sanitizer (scripts/lib/sanitize-observation.js) runs on body and every
 * evidence field before append (PR #31 reconcile 1.9).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateCandidateV1 } = require('./schema');
const { redactObservationText } = require('../sanitize-observation');
const { getArcforgeHome } = require('../utils');

// ---------------------------------------------------------------------------
// Path helpers — evaluated lazily so ARCFORGE_HOME/HOME can be redirected
// ---------------------------------------------------------------------------

function getCandidatesDir() {
  return path.join(getArcforgeHome(), 'learning', 'candidates');
}

function getQueuePath() {
  return path.join(getCandidatesDir(), 'queue.jsonl');
}

function getRejectionsPath() {
  return path.join(getCandidatesDir(), 'rejections.jsonl');
}

function getRejectionsArchivePath() {
  return path.join(getCandidatesDir(), 'rejections.archive.jsonl');
}

function getLockPath() {
  return path.join(getCandidatesDir(), 'store.lock');
}

// ---------------------------------------------------------------------------
// Inline exclusive lock (cannot reuse locking.js — it hardcodes .arcforge-lock)
// ---------------------------------------------------------------------------

const LOCK_TIMEOUT = 5000;
const LOCK_STALE_THRESHOLD = 30000;

function acquireStoreLock() {
  const lockPath = getLockPath();
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });

  const timeout = LOCK_TIMEOUT;
  const startTime = Date.now();
  let interval = 50;

  while (true) {
    try {
      const fd = fs.openSync(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      );
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }));
      fs.closeSync(fd);
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      // Check if stale
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_THRESHOLD) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            // Another process may have removed it — retry
          }
          continue;
        }
      } catch {
        // File may have been removed between check and stat — retry
        continue;
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Failed to acquire store.lock after ${timeout}ms: ${lockPath}`);
      }

      const waitMs = Math.min(interval, 500);
      const end = Date.now() + waitMs;
      while (Date.now() < end) {
        // Busy-wait (matches locking.js pattern; avoids async dependency)
      }
      interval = Math.min(interval * 2, 500);
    }
  }
}

function releaseStoreLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function withStoreLock(fn) {
  const lockPath = acquireStoreLock();
  try {
    return fn();
  } finally {
    releaseStoreLock(lockPath);
  }
}

// ---------------------------------------------------------------------------
// Atomic JSONL append — one line, newline-terminated
// ---------------------------------------------------------------------------

function appendJsonlLine(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// rejections.jsonl retention (Layer 5 "Retention limits"; B-17, D-041)
//
// Once the live file passes any limit, its records move to the archive file
// and the live file starts over. Rotation moves records, never deletes one —
// malformed lines included. Callers hold store.lock.
// ---------------------------------------------------------------------------

const REJECTIONS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REJECTIONS_MAX_RECORDS = 5000;
const REJECTIONS_MAX_BYTES = 10 * 1024 * 1024;

function oldestRejectedAt(lines) {
  let oldest = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    try {
      const ts = Date.parse(JSON.parse(line).rejected_at);
      if (ts < oldest) oldest = ts;
    } catch {
      // Malformed line — it carries no date; it still moves with the rest.
    }
  }
  return oldest;
}

function rotateRejectionsIfPastLimits(now = Date.now()) {
  const livePath = getRejectionsPath();
  if (!fs.existsSync(livePath)) return;
  const content = fs.readFileSync(livePath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const pastLimit =
    Buffer.byteLength(content, 'utf8') >= REJECTIONS_MAX_BYTES ||
    lines.length >= REJECTIONS_MAX_RECORDS ||
    now - oldestRejectedAt(lines) > REJECTIONS_MAX_AGE_MS;
  if (!pastLimit) return;
  const terminated = content.endsWith('\n') ? content : `${content}\n`;
  fs.appendFileSync(getRejectionsArchivePath(), terminated, 'utf8');
  fs.unlinkSync(livePath);
}

function appendRejection(rejection) {
  rotateRejectionsIfPastLimits();
  appendJsonlLine(getRejectionsPath(), rejection);
}

// ---------------------------------------------------------------------------
// Sanitizer — run on body and every evidence field (PR #31 reconcile 1.9)
// Per advisor guidance: use redactObservationText (no truncation) because
// validation already enforces length limits on the input.
// ---------------------------------------------------------------------------

function sanitizeRecord(record) {
  const r = { ...record };

  // Sanitize body
  if (typeof r.body === 'string') {
    r.body = redactObservationText(r.body);
  }

  // Sanitize every evidence field's summary and relevance
  if (Array.isArray(r.evidence)) {
    r.evidence = r.evidence.map((ev) => ({
      ...ev,
      summary: typeof ev.summary === 'string' ? redactObservationText(ev.summary) : ev.summary,
      relevance:
        typeof ev.relevance === 'string' ? redactObservationText(ev.relevance) : ev.relevance,
    }));
  }

  return r;
}

// ---------------------------------------------------------------------------
// Event ID generation
// ---------------------------------------------------------------------------

function generateEventId() {
  return `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a CandidateQueueRecord, sanitize it, and append to queue.jsonl.
 * If invalid, writes a rejection record to rejections.jsonl instead.
 *
 * @param {object} record — CandidateQueueRecord
 * @param {object} [options]
 * @param {object} [options.actor] — actor metadata for the queue event
 * @returns {{ ok: true, candidate_id: string } | { ok: false, reasons: object[] }}
 *   Whether the record reached the queue. A caller that reports the new
 *   candidate to someone must check `ok`: an invalid record is recorded only in
 *   rejections.jsonl.
 */
function appendCandidate(record, options = {}) {
  const validation = validateCandidateV1(record);

  if (!validation.ok) {
    // Invalid → write rejection
    withStoreLock(() => {
      const rejection = {
        schema_version: 1,
        rejection_id: `rej_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        rejected_at: new Date().toISOString(),
        source: record.source || { source_type: 'unknown' },
        reasons: validation.reasons,
        artifact_type: record.artifact_type,
        // Sanitize before persistence — a malformed proposal could carry a
        // secret in its name field. The 120-char cap is the spec FIELD_LIMIT.
        normalized_name:
          typeof record.name === 'string'
            ? redactObservationText(record.name).slice(0, 120)
            : undefined,
        scope: record.scope,
        safety: {
          raw_prompt_included: false,
          raw_response_included: false,
          raw_hook_payloads_included: false,
          raw_transcripts_included: false,
          edit_bodies_included: false,
          skill_args_included: false,
        },
        raw_proposal_saved: false,
      };
      appendRejection(rejection);
    });
    return { ok: false, reasons: validation.reasons };
  }

  // Valid → sanitize then append to queue
  const sanitized = sanitizeRecord(record);

  withStoreLock(() => {
    const event = {
      schema_version: 1,
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      candidate_id: sanitized.candidate_id,
      event_type: 'candidate.created',
      actor: options.actor || { layer: 5, actor_type: 'validator' },
      record: sanitized,
    };
    appendJsonlLine(getQueuePath(), event);
  });
  return { ok: true, candidate_id: sanitized.candidate_id };
}

/**
 * Write a rejection record directly (for pre-validation or upstream rejections).
 *
 * @param {object[]} reasons — CandidateRejectionReason[]
 * @param {object} source — CandidateSourceRef (or partial)
 */
function rejectProposal(reasons, source) {
  withStoreLock(() => {
    const rejection = {
      schema_version: 1,
      rejection_id: `rej_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      rejected_at: new Date().toISOString(),
      source: source || { source_type: 'unknown' },
      reasons,
      safety: {
        raw_prompt_included: false,
        raw_response_included: false,
        raw_hook_payloads_included: false,
        raw_transcripts_included: false,
        edit_bodies_included: false,
        skill_args_included: false,
      },
      raw_proposal_saved: false,
    };
    appendRejection(rejection);
  });
}

/**
 * Replay queue.jsonl events and return current candidate map.
 * Corrupted lines are skipped (not fatal).
 *
 * @returns {Record<string, object>} candidate_id → CandidateQueueRecord
 */
function readCurrentCandidates() {
  const queuePath = getQueuePath();
  if (!fs.existsSync(queuePath)) return {};

  const content = fs.readFileSync(queuePath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  const candidates = {};

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      // Corrupted line — skip (spec: "partial trailing JSONL lines are ignored")
      continue;
    }

    if (!event || typeof event !== 'object') continue;

    const { event_type, candidate_id } = event;

    if (!candidate_id) continue;

    if (event_type === 'candidate.created') {
      if (event.record) {
        candidates[candidate_id] = { ...event.record };
      }
    } else if (event_type === 'candidate.transitioned') {
      if (candidates[candidate_id] && event.next_status) {
        candidates[candidate_id] = {
          ...candidates[candidate_id],
          lifecycle: {
            ...candidates[candidate_id].lifecycle,
            status: event.next_status,
            status_changed_at: event.ts || new Date().toISOString(),
          },
        };
      }
    } else if (event_type === 'candidate.updated') {
      if (candidates[candidate_id] && event.patch) {
        candidates[candidate_id] = {
          ...candidates[candidate_id],
          ...event.patch,
        };
      }
    } else if (event_type === 'candidate.related') {
      if (candidates[candidate_id] && event.patch) {
        candidates[candidate_id] = {
          ...candidates[candidate_id],
          relationships: {
            ...(candidates[candidate_id].relationships || {}),
            ...event.patch,
          },
        };
      }
    }
  }

  return candidates;
}

/**
 * Read the live rejections.jsonl, newest first. Malformed lines are skipped
 * (Layer 5: rejection log corruption never blocks a reader). Archived records
 * are not read. These are audit records for display — never learning evidence.
 *
 * @returns {object[]} CandidateRejectionRecord[] as stored
 */
function readRejections() {
  const livePath = getRejectionsPath();
  if (!fs.existsSync(livePath)) return [];
  const records = [];
  for (const line of fs.readFileSync(livePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record && typeof record === 'object') records.push(record);
    } catch {
      // Malformed line — skipped for display; it stays in the file.
    }
  }
  return records.reverse();
}

module.exports = {
  appendCandidate,
  rejectProposal,
  readCurrentCandidates,
  readRejections,
  getQueuePath,
};
