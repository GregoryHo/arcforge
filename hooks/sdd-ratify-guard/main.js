#!/usr/bin/env node
/**
 * sdd-ratify-guard — PreToolUse best-effort guard for "arcforge ratify" in loop context.
 *
 * Task 3b (B1 "辅"): Intercepts Bash tool calls containing "arcforge ratify" or
 * "node scripts/cli.js ratify" and DENIES them when the loop sentinel
 * (.arcforge-loop.json) is present at project root.
 *
 * HONEST LIMITS (per implementation-plan.md §0.5 B1 decision):
 *   - This hook IS bypassable with --dangerously-skip-permissions. That is a known,
 *     accepted limit (user choice, documented in README).
 *   - The PRIMARY guard is the ENGINE-SIDE gate in scripts/cli/ratify-command.js:
 *     ARCFORGE_MODE !== 'attended' OR sentinel present → refuse to mint.
 *   - This hook provides the best-effort harness layer as defense-in-depth.
 *   - Do NOT invest in making loop refuse skip-permissions (per user decision §0.5 B1).
 *
 * FAIL-OPEN INVARIANT: any internal error → silently catch → ALLOW.
 */

const { readStdinSync, parseStdinJson, output } = require('../../scripts/lib/utils');
const { LOOP_SENTINEL, loopSentinelPresent } = require('../../scripts/lib/sdd-utils');

// Patterns that identify a ratify CLI invocation in a Bash command string.
// Matches "arcforge ratify" and "node <anything>/cli.js ratify".
const RATIFY_PATTERN = /(?:^|\s)(?:arcforge\s+ratify|node\s+\S*cli\.js\s+ratify)(?:\s|$)/;

/** Alias kept for backwards-compat with unit-test exports. */
const sentinelPresent = loopSentinelPresent;

/**
 * Pure decision core for a PreToolUse Bash event.
 * Returns a deny reason string, or null to allow.
 *
 * @param {Object|null} input - Parsed hook stdin.
 * @returns {string|null}
 */
function evaluate(input) {
  if (!input) return null;

  // Only intercept Bash tool calls.
  if (input.tool_name !== 'Bash') return null;

  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !command) return null;

  // Only act if this looks like a ratify invocation.
  if (!RATIFY_PATTERN.test(command)) return null;

  const cwd = input.cwd || process.cwd();

  // Check for loop sentinel.
  if (!sentinelPresent(cwd)) return null;

  return (
    `"arcforge ratify" denied — loop sentinel ${LOOP_SENTINEL} detected at ${cwd}.\n` +
    `Ratification must not occur inside an autonomous loop (B1 harness guard).\n` +
    `Note: the primary engine gate (ARCFORGE_MODE check in ratify-command.js) provides\n` +
    `the deterministic guarantee. This hook is best-effort and bypassable by\n` +
    `--dangerously-skip-permissions (known limit, per implementation-plan.md §0.5 B1).`
  );
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

module.exports = { evaluate, sentinelPresent };

if (require.main === module) {
  main();
}
