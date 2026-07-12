/**
 * resulting-content.js — compute the on-disk content a Write/Edit tool call
 * WOULD produce, without applying it.
 *
 * Shared by the PreToolUse content guards (sdd-ledger-guard, dag-guard) so they
 * can validate the proposed result against a baseline before the write lands.
 * Extracted from sdd-ledger-guard so both guards import one canonical copy
 * (canonical-source rule — no copy-paste).
 *
 * Uncertain cases (missing fields, unreadable file, old_string not found) return
 * null so callers fail-open (ALLOW) — a false-positive block is the expensive
 * failure mode for these guards.
 */

const fs = require('node:fs');

/**
 * Compute the resulting on-disk content after a Write tool call.
 * Write replaces the entire file with tool_input.content.
 *
 * @param {Object} tool_input
 * @returns {string|null}
 */
function computeWriteContent(tool_input) {
  const content = tool_input?.content;
  if (typeof content !== 'string') return null;
  return content;
}

/**
 * Compute the resulting on-disk content after an Edit tool call.
 * Edit replaces the first occurrence of old_string with new_string (or all if replace_all).
 *
 * @param {Object} tool_input
 * @param {string} absPath - Absolute path to the file being edited.
 * @returns {string|null}
 */
function computeEditContent(tool_input, absPath) {
  const oldStr = tool_input?.old_string;
  const newStr = tool_input?.new_string;
  if (typeof oldStr !== 'string' || typeof newStr !== 'string') return null;

  let onDisk;
  try {
    onDisk = fs.readFileSync(absPath, 'utf8');
  } catch {
    // File doesn't exist on disk or unreadable → can't compute result → ALLOW.
    return null;
  }

  if (!onDisk.includes(oldStr)) {
    // old_string not found → edit would fail anyway → ALLOW.
    return null;
  }

  const replaceAll = tool_input?.replace_all === true;
  if (replaceAll) {
    // Escape regex special chars and replace all occurrences.
    const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use a function replacer to avoid $& interpretation in replacement string.
    return onDisk.replace(new RegExp(escaped, 'g'), () => newStr);
  }
  // Replace first occurrence only.
  const idx = onDisk.indexOf(oldStr);
  return onDisk.slice(0, idx) + newStr + onDisk.slice(idx + oldStr.length);
}

module.exports = { computeWriteContent, computeEditContent };
