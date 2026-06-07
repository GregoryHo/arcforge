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
 * Task 3a: Detect forge-by-Edit attempts — deny any Edit/Write to decisions.yml that
 * introduces status:accepted or adds/changes ratified_by on an entry that did not have
 * it at HEAD.
 *
 * These fields may ONLY be minted by `arcforge ratify` (which writes via fs, NOT the
 * Edit/Write tool). An agent trying to self-ratify would use Edit/Write, which this
 * function blocks.
 *
 * Semantics:
 *   - For each entry in current: if it has status==='accepted' or non-empty ratified_by,
 *     look up the same D-id in previous (HEAD snapshot).
 *     - If previous is null (new file) → DENY (every accepted/ratified_by is a forge).
 *     - If D-id not in HEAD → DENY (new entry cannot be born accepted/ratified).
 *     - If D-id in HEAD but had different status/ratified_by → DENY (forged upgrade).
 *     - If D-id in HEAD with same values → ALLOW (legitimate carry-forward).
 *
 * FAIL-OPEN: if current doesn't parse → ALLOW (handled by caller).
 *
 * @param {Array<Object>} current - Parsed current ledger entries.
 * @param {Array<Object> | null} previous - Parsed HEAD entries, or null for new file.
 * @returns {string|null} Deny reason, or null to allow.
 */
function detectForgeAttempt(current, previous) {
  // Build a map from D-id → entry for HEAD snapshot.
  const prevMap = new Map();
  if (Array.isArray(previous)) {
    for (const e of previous) {
      if (e?.['D-id']) prevMap.set(String(e['D-id']), e);
    }
  }

  for (const entry of current) {
    if (!entry || !entry['D-id']) continue;
    const dId = String(entry['D-id']);
    const currStatus = String(entry.status || '');
    const currRatifiedBy = String(entry.ratified_by || '').trim();

    const hasAccepted = currStatus === 'accepted';
    const hasRatifiedBy = currRatifiedBy !== '';

    if (!hasAccepted && !hasRatifiedBy) continue; // benign entry

    // This entry has accepted status or ratified_by — check if it was already so at HEAD.
    if (previous === null) {
      // New file: no HEAD → every accepted/ratified entry is a forge.
      return (
        `decisions.yml forge attempt blocked — D-id "${dId}" has ` +
        `${hasAccepted ? 'status:accepted' : ''}${hasAccepted && hasRatifiedBy ? ' and ' : ''}` +
        `${hasRatifiedBy ? 'ratified_by' : ''} on a new file. ` +
        `These fields can only be set by "arcforge ratify", not by Edit/Write tool calls.`
      );
    }

    const prev = prevMap.get(dId);
    if (!prev) {
      // D-id not in HEAD: this is a new entry born with accepted/ratified_by.
      return (
        `decisions.yml forge attempt blocked — new D-id "${dId}" cannot be created with ` +
        `${hasAccepted ? 'status:accepted' : ''}${hasAccepted && hasRatifiedBy ? ' or ' : ''}` +
        `${hasRatifiedBy ? 'ratified_by' : ''}. ` +
        `Only "arcforge ratify" may set these fields.`
      );
    }

    const prevStatus = String(prev.status || '');
    const prevRatifiedBy = String(prev.ratified_by || '').trim();

    // Check if accepted/ratified_by are being forged (changed vs HEAD).
    if (hasAccepted && prevStatus !== 'accepted') {
      return (
        `decisions.yml forge attempt blocked — D-id "${dId}" status changed to "accepted" ` +
        `via Edit/Write tool. Only "arcforge ratify" may transition a decision to accepted.`
      );
    }
    if (hasRatifiedBy && prevRatifiedBy !== currRatifiedBy) {
      return (
        `decisions.yml forge attempt blocked — D-id "${dId}" ratified_by ` +
        `added or changed via Edit/Write tool. Only "arcforge ratify" may set ratified_by.`
      );
    }
    // Falls through: accepted/ratified_by at HEAD matches current → legitimate carry-forward.
  }

  return null;
}

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

  // Task 3a: Check for forge-by-Edit attempts FIRST. This closes the hole where an agent
  // writes status:accepted or ratified_by via Edit/Write (which bypasses the ratify CLI).
  const forgeReason = detectForgeAttempt(current, previous);
  if (forgeReason) return forgeReason;

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
  detectForgeAttempt,
};

if (require.main === module) {
  main();
}
