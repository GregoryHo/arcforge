/**
 * Pending Actions — per-action consume queue for deferred actions
 *
 * Stores pending actions (e.g., "reflection ready") that should be
 * shown to the user on next session start. Uses per-action consume
 * to avoid losing concurrent actions.
 *
 * Storage: ~/.claude/sessions/{project}/pending-actions.json
 * Format: { actions: [{ id, type, payload, created, consumed, consumed_at }] }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const EXPIRY_DAYS = 7;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

/**
 * Get the pending-actions.json path for a project.
 * @param {string} project - Project name
 * @returns {string} Path to pending-actions.json
 */
function getActionsPath(project) {
  return path.join(CLAUDE_DIR, 'sessions', project, 'pending-actions.json');
}

/**
 * Read actions from file.
 * @param {string} project - Project name
 * @returns {{ actions: Array }} Parsed actions object
 */
function readActions(project) {
  const filePath = getActionsPath(project);
  if (!fs.existsSync(filePath)) return { actions: [] };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data && Array.isArray(data.actions) ? data : { actions: [] };
  } catch {
    return { actions: [] };
  }
}

/**
 * Write actions to file.
 * @param {string} project - Project name
 * @param {{ actions: Array }} data - Actions data
 */
function writeActions(project, data) {
  const filePath = getActionsPath(project);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Add a pending action.
 * @param {string} project - Project name
 * @param {string} type - Action type (e.g., 'reflect-ready', 'diary-saved')
 * @param {Object} [payload={}] - Additional data
 * @returns {Object} The created action
 */
function addPendingAction(project, type, payload = {}) {
  const data = readActions(project);

  const action = {
    id: crypto.randomUUID(),
    type,
    payload,
    created: new Date().toISOString(),
    consumed: false,
    consumed_at: null
  };

  data.actions.push(action);
  writeActions(project, data);

  return action;
}

/**
 * Get unconsumed, unexpired pending actions.
 * @param {string} project - Project name
 * @param {string} [type] - Optional type filter
 * @returns {Array} Matching actions
 */
function getPendingActions(project, type) {
  const data = readActions(project);
  const now = new Date();
  const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  return data.actions.filter(a => {
    if (a.consumed) return false;

    const created = new Date(a.created);
    if (now.getTime() - created.getTime() > expiryMs) return false;

    if (type && a.type !== type) return false;

    return true;
  });
}

/**
 * Consume (mark as processed) a specific action.
 * @param {string} project - Project name
 * @param {string} actionId - Action ID to consume
 * @returns {boolean} True if action was found and consumed
 */
function consumeAction(project, actionId) {
  const data = readActions(project);

  const action = data.actions.find(a => a.id === actionId);
  if (!action) return false;

  action.consumed = true;
  action.consumed_at = new Date().toISOString();
  writeActions(project, data);

  return true;
}

/**
 * Remove expired actions (older than 7 days).
 * @param {string} project - Project name
 * @returns {number} Number of pruned actions
 */
function pruneExpired(project) {
  const data = readActions(project);
  const now = new Date();
  const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const before = data.actions.length;
  data.actions = data.actions.filter(a => {
    const created = new Date(a.created);
    return now.getTime() - created.getTime() <= expiryMs;
  });

  const pruned = before - data.actions.length;
  if (pruned > 0) {
    writeActions(project, data);
  }

  return pruned;
}

module.exports = {
  EXPIRY_DAYS,
  getActionsPath,
  addPendingAction,
  getPendingActions,
  consumeAction,
  pruneExpired
};
