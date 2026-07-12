#!/usr/bin/env node
/**
 * dag-guard — PreToolUse transition guard for specs/<id>/dag.yaml.
 *
 * Intercepts Edit and Write tool calls whose target file basename is
 * `dag.yaml`, computes the resulting content, and validates the proposed
 * transition against a baseline (HEAD when tracked, otherwise the pre-edit
 * on-disk content) via validateDagTransition. DENY on:
 *   (a) an illegal TaskStatus transition — `completed` is monotonic, so a task
 *       cannot leave the completed state;
 *   (b) dependency deletion — a task's depends_on array cannot shrink.
 * All other paths are no-ops.
 *
 * BLOCK MECHANISM: same as sdd-ledger-guard — stdout JSON
 *   { hookSpecificOutput: { hookEventName: 'PreToolUse',
 *       permissionDecision: 'deny', permissionDecisionReason } }
 * with exit 0. Hook must be synchronous (async hooks cannot block).
 *
 * FAIL-OPEN INVARIANT (tested): any parse failure / unreadable file / no
 * baseline → silently ALLOW. A false-positive block is the expensive failure
 * mode; uncertain → allow.
 *
 * ENGINE-SIDE TWIN: PreToolUse denies are void under
 * --dangerously-skip-permissions, so the same invariants are enforced on the
 * engine write path (scripts/lib/coordinator-core.js `_saveDag`).
 */

const path = require('node:path');
const { readStdinSync, parseStdinJson, output, readFileSafe } = require('../../scripts/lib/utils');
const { parseDagYaml } = require('../../scripts/lib/yaml-parser');
const { validateDagTransition } = require('../../scripts/lib/dag-schema');
const { getHeadLedgerContent } = require('../../scripts/lib/sdd-utils');
const { computeWriteContent, computeEditContent } = require('../../scripts/lib/resulting-content');

/**
 * Decide whether the proposed resulting content of a dag.yaml write is valid.
 * @param {string|null} resultingContent - The YAML that would be written to disk.
 * @param {string|null} baselineContent - The YAML at the baseline (HEAD or on-disk).
 * @returns {string|null} A deny reason string, or null to allow.
 */
function decideDagEdit(resultingContent, baselineContent) {
  if (typeof resultingContent !== 'string' || typeof baselineContent !== 'string') return null;

  let nextDag;
  let prevDag;
  try {
    nextDag = parseDagYaml(resultingContent);
    prevDag = parseDagYaml(baselineContent);
  } catch {
    // Unparseable either side → can't compare → ALLOW (fail-open).
    return null;
  }
  if (!Array.isArray(nextDag?.epics) || !Array.isArray(prevDag?.epics)) return null;

  const { valid, errors } = validateDagTransition(prevDag, nextDag);
  if (valid) return null;

  return (
    'dag.yaml transition blocked — the DAG enforces two hard invariants.\n' +
    errors.join('\n') +
    '\nTo change course, add a new task or record a blocker instead of rewriting ' +
    'completed state or dropping dependencies.'
  );
}

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

  // Self-gating signal: only intercept writes to dag.yaml.
  if (path.basename(filePath) !== 'dag.yaml') return null;

  const cwd = input.cwd || process.cwd();
  const absPath = path.resolve(cwd, filePath);

  let resultingContent;
  if (toolName === 'Write') {
    resultingContent = computeWriteContent(input.tool_input);
  } else {
    resultingContent = computeEditContent(input.tool_input, absPath);
  }
  if (resultingContent === null) return null; // uncertain → ALLOW

  // Baseline: HEAD when tracked (binding), else pre-edit on-disk content.
  const headContent = getHeadLedgerContent(absPath, cwd);
  const baselineContent = headContent !== null ? headContent : readFileSafe(absPath);
  if (baselineContent === null) return null; // brand-new dag.yaml → nothing to compare → ALLOW

  return decideDagEdit(resultingContent, baselineContent);
}

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

module.exports = { evaluate, decideDagEdit };

if (require.main === module) {
  main();
}
