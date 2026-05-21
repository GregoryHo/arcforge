/**
 * dashboard-events.js — Layer 6 event appender for existing candidates.
 *
 * Provides helpers to persist lifecycle transition events and relationship
 * events to queue.jsonl without going through appendCandidate (which
 * validates + creates new records only).
 *
 * Uses the same store.lock and queue.jsonl path as queue-writer.js.
 * Callers must ensure they have already validated the action is legal
 * (via lifecycle.isLegalAction) before calling appendTransitionEvent.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Path helpers — evaluated lazily so tests can redirect via process.env.HOME
// ---------------------------------------------------------------------------

function getCandidatesDir() {
  return path.join(os.homedir(), '.arcforge', 'learning', 'candidates');
}

function getQueuePath() {
  return path.join(getCandidatesDir(), 'queue.jsonl');
}

function getLockPath() {
  return path.join(getCandidatesDir(), 'store.lock');
}

// ---------------------------------------------------------------------------
// Lock — identical pattern to queue-writer.js (same lock file serializes both)
// ---------------------------------------------------------------------------

const LOCK_TIMEOUT = 5000;
const LOCK_STALE_THRESHOLD = 30000;

function acquireStoreLock() {
  const lockPath = getLockPath();
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });

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
        continue;
      }

      if (Date.now() - startTime > LOCK_TIMEOUT) {
        throw new Error(`Failed to acquire store.lock after ${LOCK_TIMEOUT}ms: ${lockPath}`);
      }

      const waitMs = Math.min(interval, 500);
      const end = Date.now() + waitMs;
      while (Date.now() < end) {
        // Busy-wait
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
// Atomic JSONL append
// ---------------------------------------------------------------------------

function appendJsonlLine(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`, 'utf8');
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
 * Append a candidate.transitioned event for an existing candidate.
 *
 * readCurrentCandidates() already replays this event type to update
 * lifecycle.status on the in-memory candidate map.
 *
 * @param {string} candidateId
 * @param {string} action — the action that caused the transition
 * @param {string} nextStatus — the resulting lifecycle status
 * @param {object} [actor]
 */
function appendTransitionEvent(candidateId, action, nextStatus, actor) {
  withStoreLock(() => {
    const event = {
      schema_version: 1,
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      candidate_id: candidateId,
      event_type: 'candidate.transitioned',
      actor: actor || { layer: 6, actor_type: 'dashboard' },
      action,
      next_status: nextStatus,
    };
    appendJsonlLine(getQueuePath(), event);
  });
}

/**
 * Append a candidate.related event on a source candidate (e.g. after promote).
 * readCurrentCandidates() replays this to update candidate.relationships.
 *
 * @param {string} sourceCandidateId
 * @param {object} patch — relationships patch (e.g. { promoted_to_candidate_id: '...' })
 * @param {object} [actor]
 */
function appendRelatedEvent(sourceCandidateId, patch, actor) {
  withStoreLock(() => {
    const event = {
      schema_version: 1,
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      candidate_id: sourceCandidateId,
      event_type: 'candidate.related',
      actor: actor || { layer: 6, actor_type: 'dashboard' },
      patch,
    };
    appendJsonlLine(getQueuePath(), event);
  });
}

module.exports = { appendTransitionEvent, appendRelatedEvent };
