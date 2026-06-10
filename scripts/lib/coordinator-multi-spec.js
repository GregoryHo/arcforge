/**
 * coordinator-multi-spec.js — cross-spec module-level operations.
 *
 * Split from coordinator.js (decomposition per file-size limits).
 * Module-level, not instance, because a Coordinator is scoped to one spec.
 * A single project-level withLock covers the whole iteration. Callers
 * import via the coordinator.js facade.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DAG } = require('./models');
const { parseDagYaml, stringifyDagYaml } = require('./yaml-parser');
const { withLock } = require('./locking');
const { normalizeStatus } = require('./dag-schema');
const { Coordinator } = require('./coordinator-core');

/**
 * List every `specs/<id>/dag.yaml` that currently exists in the project.
 * @param {string} projectRoot
 * @returns {Array<{specId: string, dagPath: string}>}
 */
function listSpecDagPaths(projectRoot) {
  const specsRoot = path.join(projectRoot, 'specs');
  if (!fs.existsSync(specsRoot)) return [];
  const out = [];
  for (const entry of fs.readdirSync(specsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dagPath = path.join(specsRoot, entry.name, 'dag.yaml');
    if (fs.existsSync(dagPath)) {
      out.push({ specId: entry.name, dagPath });
    }
  }
  return out;
}

/**
 * Aggregate base-side sync across every spec in the project. Each member
 * spec's dag.yaml is scanned for epics whose worktree markers advertise a
 * newer status; matches are pulled into the dag.
 *
 * @param {string} projectRoot
 * @returns {{ specs: Object<string, SyncResult> }} Per-spec results keyed by spec id.
 */
function syncAllSpecs(projectRoot) {
  return withLock(projectRoot, () => {
    const specs = {};
    for (const { specId, dagPath } of listSpecDagPaths(projectRoot)) {
      try {
        specs[specId] = _syncSpecDagInline(projectRoot, specId, dagPath);
      } catch (err) {
        specs[specId] = { error: err.message };
      }
    }
    return { specs };
  });
}

// Inline single-spec sync — matches Coordinator.prototype._syncBase but
// without _dagTransaction's nested withLock. Reached only from
// syncAllSpecs, which already holds the project-level lock; calling the
// instance method here would deadlock (file-based locks are not
// re-entrant).
function _syncSpecDagInline(projectRoot, specId, dagPath) {
  const original = fs.readFileSync(dagPath, 'utf8');
  const dag = DAG.fromObject(parseDagYaml(original));
  const coord = new Coordinator(projectRoot, specId);
  const updates = [];
  let scanned = 0;

  for (const epic of dag.epics) {
    if (!epic.worktree) continue;
    const worktreePath = coord._resolveWorktreePath(epic.worktree);
    const markerPath = path.join(worktreePath, '.arcforge-epic');
    if (!fs.existsSync(markerPath)) continue;

    const epicData = parseDagYaml(fs.readFileSync(markerPath, 'utf8'));
    const local = epicData.local || {};
    if (local.status) {
      const validStatus = normalizeStatus(local.status);
      const oldStatus = epic.status;
      if (validStatus !== oldStatus) {
        epic.status = validStatus;
        updates.push({
          epic: epicData.epic,
          old_status: oldStatus,
          new_status: validStatus,
        });
      }
    }
    scanned++;
  }

  const newContent = stringifyDagYaml(dag.toObject());
  if (newContent !== original) {
    fs.writeFileSync(dagPath, newContent);
  }
  return { scanned, updates };
}

/**
 * Aggregate reboot context across every spec in the project.
 *
 * @param {string} projectRoot
 * @returns {{ specs: Object<string, Object>, totals: Object }}
 */
function rebootAllSpecs(projectRoot) {
  const specs = {};
  const totals = { completed_count: 0, remaining_count: 0, blocked_count: 0 };
  for (const { specId } of listSpecDagPaths(projectRoot)) {
    const coord = new Coordinator(projectRoot, specId);
    try {
      const ctx = coord.rebootContext();
      specs[specId] = ctx;
      totals.completed_count += ctx.completed_count;
      totals.remaining_count += ctx.remaining_count;
      totals.blocked_count += ctx.blocked_count;
    } catch (err) {
      specs[specId] = { error: err.message };
    }
  }
  return { specs, totals };
}

module.exports = {
  listSpecDagPaths,
  syncAllSpecs,
  rebootAllSpecs,
};
