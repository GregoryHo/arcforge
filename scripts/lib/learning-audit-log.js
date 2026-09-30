/**
 * learning-audit-log.js — owner of the learning audit log (B-5).
 *
 * One append-only JSONL file, `~/.arcforge/learning/dashboard/actions.jsonl`,
 * records every reviewer action the dashboard and the CLI dispatch — accepted
 * or refused — and every archive the decay cycle performs (B-10). Entries carry
 * no absolute filesystem path.
 */

const fs = require('node:fs');
const path = require('node:path');

const { getArcforgeHome } = require('./utils');

/**
 * @param {string} [arcforgeRoot] - defaults to the arcforge home
 * @returns {string} absolute path of the audit log
 */
function getAuditLogPath(arcforgeRoot = getArcforgeHome()) {
  return path.join(arcforgeRoot, 'learning', 'dashboard', 'actions.jsonl');
}

/**
 * Append one entry to the audit log.
 *
 * @param {object} entry
 * @param {string} [arcforgeRoot] - defaults to the arcforge home
 */
function writeAuditEntry(entry, arcforgeRoot = getArcforgeHome()) {
  const logPath = getAuditLogPath(arcforgeRoot);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

module.exports = { getAuditLogPath, writeAuditEntry };
