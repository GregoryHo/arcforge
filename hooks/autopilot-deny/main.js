#!/usr/bin/env node
/**
 * autopilot-deny — PreToolUse ship gate that is ACTIVE ONLY under a live loop.
 *
 * When `loopSentinelPresent(cwd)` is true (an arcforge autopilot loop is driving
 * the session, possibly inside an epic worktree resolved via its `.arcforge-epic`
 * marker), a `gh pr merge` / `git push` is DENIED when either:
 *   - no test command was observed this session (the same test-seen counter
 *     arc-remind writes on PostToolUse), or
 *   - the stale-eval predicate fires: a skill was edited this session and no
 *     benchmark postdates that edit (latestBenchmarkTime <= lastSkillEditTime).
 *
 * ATTENDED mode (no loop sentinel): no deny — a human is watching arc-remind's
 * nudge, so the boundary stays advisory. The regex is deliberately NARROWER than
 * arc-remind's PR_BOUNDARY_RE: it never touches `gh pr create` — only merge/push.
 *
 * Cross-event dependency: this PreToolUse deny reads counters/state that
 * arc-remind's PostToolUse recorder wrote. Both dispatchers derive the same
 * sessionId per event (setSessionIdFromInput), so the counter files line up.
 *
 * BLOCK MECHANISM: PreToolUse stdout JSON with permissionDecision:'deny', exit 0.
 * MUST be synchronous. Fail-open on any error (uncertain → allow).
 */

const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  output,
  createSessionCounter,
} = require('../../scripts/lib/utils');
const { loopSentinelPresent } = require('../../scripts/lib/sdd-utils');
const { readSkillEdits, lastSkillEditTime, latestBenchmarkTime } = require('../arc-remind/main');

// Narrower than arc-remind's PR_BOUNDARY_RE — merge/push only, never `pr create`.
const MERGE_RE = /\bgh\s+pr\s+merge\b/;
const PUSH_RE = /\bgit\s+push\b/;

function isMergeOrPush(command) {
  return typeof command === 'string' && (MERGE_RE.test(command) || PUSH_RE.test(command));
}

/**
 * Stale-eval predicate — mirrors arc-remind's stale branch (main.js:280-288):
 * a skill was edited this session AND a benchmark exists that is NOT newer than
 * the edit. Missing edit or missing benchmark → not stale (no deny on that axis).
 * @param {string} cwd
 * @returns {boolean}
 */
function staleEval(cwd) {
  const editTime = lastSkillEditTime(readSkillEdits());
  const benchTime = latestBenchmarkTime(cwd);
  if (editTime === null || benchTime === null) return false;
  return benchTime <= editTime;
}

/**
 * Pure decision core for a PreToolUse event. Returns a deny reason, or null.
 * Session id must already be set (dispatcher does this once per event).
 * @param {Object|null} input - Parsed hook stdin.
 * @returns {string|null}
 */
function evaluate(input) {
  if (!input || input.tool_name !== 'Bash') return null;
  const command = input.tool_input?.command;
  if (!isMergeOrPush(command)) return null;

  const cwd = input.cwd || process.cwd();
  // Autopilot-only: attended sessions keep arc-remind's (unchanged) nudge behavior.
  if (!loopSentinelPresent(cwd)) return null;

  const testSeen = createSessionCounter('arc-remind-test-seen').read() > 0;
  const stale = staleEval(cwd);
  if (testSeen && !stale) return null;

  const reasons = [];
  if (!testSeen) {
    reasons.push('no test command was observed this session');
  }
  if (stale) {
    reasons.push('a skill was edited but no eval postdates the edit');
  }

  return (
    'Autopilot ship gate — a live arcforge loop is driving this session, so this ' +
    '`gh pr merge` / `git push` is blocked because ' +
    `${reasons.join(' and ')}. ` +
    'Produce the missing evidence first: run the actual checks now (arc-verifying), and ' +
    "re-run the edited skill's eval (RED → GREEN → REFACTOR) before shipping a behavioral " +
    'change. Then retry the ship command. Override (human-authorized only): set ' +
    'ARCFORGE_DISABLED_HOOKS=autopilot-deny.'
  );
}

function main() {
  try {
    const input = parseStdinJson(readStdinSync());
    if (!input) return;
    setSessionIdFromInput(input);
    const reason = evaluate(input);
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

module.exports = { evaluate, staleEval, isMergeOrPush, MERGE_RE, PUSH_RE };

if (require.main === module) {
  main();
}
