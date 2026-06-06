#!/usr/bin/env node
/**
 * sdd-ledger-guard — PreToolUse immutability guard for specs/<id>/decisions.yml.
 *
 * Intercepts Edit and Write tool calls whose target file basename is
 * `decisions.yml`, computes the resulting content, and validates it against
 * the ledger stored in HEAD via validateDecisionLedger. DENY on any
 * immutability / monotonicity violation. All other paths are no-ops.
 *
 * BLOCK MECHANISM: same as arc-guard — stdout JSON
 *   { hookSpecificOutput: { hookEventName: 'PreToolUse',
 *       permissionDecision: 'deny', permissionDecisionReason } }
 * with exit 0. Hook must be synchronous (registered without `async`).
 *
 * FAIL-OPEN INVARIANT (tested): any internal error → silently catch → ALLOW.
 * A false-positive block is the expensive failure mode; uncertain → allow.
 *
 * COVERAGE BOUNDARY (documented, not code-enforced):
 *   - Only intercepts Edit and Write tool calls. Bash-level writes
 *     (echo >>, sed -i, tee) bypass this hook entirely.
 *   - Immutability is HEAD-relative. A same-session pre-commit
 *     append-then-edit within a single session escapes the check
 *     (S8 limitation from validateDecisionLedger's doc comment).
 *   - Non-git-repo or detached-HEAD cwd → getHeadLedgerContent returns null
 *     → previous=null → immutability checks skip → ALLOW (fail-open).
 */

const fs = require('node:fs');
const path = require('node:path');
const { readStdinSync, parseStdinJson, output } = require('../../scripts/lib/utils');
const {
  parseDecisionLedgerContent,
  validateDecisionLedger,
  getHeadLedgerContent,
} = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// Pure decision core — no git, no fs. Tests for cases (a/b/c) call this directly.
// ---------------------------------------------------------------------------

/**
 * Decide whether the proposed resulting content of a decisions.yml write is valid.
 *
 * @param {string|null} resultingContent - The YAML that would be written to disk.
 * @param {string|null} headContent - The YAML currently at HEAD (null if new/non-repo).
 * @returns {string|null} A deny reason string, or null to allow.
 */
function decideLedgerEdit(resultingContent, headContent) {
  const current = parseDecisionLedgerContent(resultingContent);
  // If content doesn't parse to a valid array (empty file, garbage) → ALLOW.
  // Never feed non-array into validateDecisionLedger (it returns valid:false).
  if (!Array.isArray(current)) return null;

  // headContent null (new file, non-repo) → previous=null →
  // validateDecisionLedger skips immutability/status-transition checks → ALLOW.
  const previous = parseDecisionLedgerContent(headContent);

  const { valid, errors } = validateDecisionLedger(current, previous);
  if (valid) return null;

  return (
    'decisions.yml immutability violation — the decision ledger is append-only.\n' +
    errors.join('\n') +
    '\nTo correct a frozen entry, record a new superseding entry instead of editing in-place.'
  );
}

// ---------------------------------------------------------------------------
// Content computation helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// evaluate — gate + dispatch
// ---------------------------------------------------------------------------

/**
 * Pure decision core for a PreToolUse event. Returns a deny reason, or null to allow.
 * @param {Object|null} input - Parsed hook stdin.
 * @returns {string|null}
 */
function evaluate(input) {
  if (!input) return null;

  const toolName = input.tool_name;
  if (toolName !== 'Edit' && toolName !== 'Write') return null;

  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath) return null;

  // Self-gating signal: only intercept writes to decisions.yml.
  if (path.basename(filePath) !== 'decisions.yml') return null;

  const cwd = input.cwd || process.cwd();
  const absPath = path.resolve(cwd, filePath);

  // Compute the resulting content depending on tool type.
  let resultingContent;
  if (toolName === 'Write') {
    resultingContent = computeWriteContent(input.tool_input);
  } else {
    resultingContent = computeEditContent(input.tool_input, absPath);
  }

  if (resultingContent === null) return null; // uncertain → ALLOW

  // Fetch HEAD state (null if new file / non-repo / git absent).
  const headContent = getHeadLedgerContent(absPath, cwd);

  return decideLedgerEdit(resultingContent, headContent);
}

// ---------------------------------------------------------------------------
// main — wire format entry point
// ---------------------------------------------------------------------------

function main() {
  try {
    const reason = evaluate(parseStdinJson(readStdinSync()));
    if (reason) {
      output({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      });
    }
  } catch {
    // Never crash the session — on any error, allow the tool call (fail-open).
  }
}

module.exports = {
  evaluate,
  decideLedgerEdit,
  computeWriteContent,
  computeEditContent,
};

if (require.main === module) {
  main();
}
