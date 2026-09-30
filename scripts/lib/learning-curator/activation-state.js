/**
 * activation-state.js — read the ActivationRecords under learning/activations.
 *
 * Extracted from activate.js (which writes the records) so the reader has one
 * owner that both the activation gate (`listActivatedCandidateIds`) and the
 * decay cycle's archive guard import.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Directory holding one ActivationRecord JSON per activate/deactivate. */
function getActivationsDir(arcforgeRoot) {
  return path.join(arcforgeRoot, 'learning', 'activations');
}

/**
 * Fold every ActivationRecord by candidate_id — the latest created_at wins,
 * file name breaking ties — into the ids whose latest action is `activate`,
 * plus what could not be read: an unreadable directory or a record that is
 * not JSON. Injection treats those as "not activated" (fail
 * closed for influence); a destructive caller — decay's archive — must treat
 * them as unknown instead (B-10).
 *
 * @returns {{ activated: Set<string>, unreadable: string[] }}
 */
function readActivationState(arcforgeRoot) {
  const activated = new Set();
  const unreadable = [];
  const activationsDir = getActivationsDir(arcforgeRoot);
  if (!fs.existsSync(activationsDir)) return { activated, unreadable };

  let entries;
  try {
    entries = fs.readdirSync(activationsDir).sort();
  } catch (err) {
    unreadable.push(`activations directory: ${err.message}`);
    return { activated, unreadable };
  }

  // candidate_id -> { action, created_at }
  const latestByCandidate = new Map();
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(activationsDir, entry), 'utf8'));
      const id = record.candidate_id;
      if (!id || (record.action !== 'activate' && record.action !== 'deactivate')) continue;
      const prev = latestByCandidate.get(id);
      // Sorted file iteration gives a stable tiebreak when created_at ties.
      if (!prev || record.created_at >= prev.created_at) {
        latestByCandidate.set(id, { action: record.action, created_at: record.created_at });
      }
    } catch (err) {
      unreadable.push(`${entry}: ${err.message}`);
    }
  }

  for (const [id, latest] of latestByCandidate) {
    if (latest.action === 'activate') activated.add(id);
  }
  return { activated, unreadable };
}

module.exports = { getActivationsDir, readActivationState };
