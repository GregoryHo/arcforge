#!/usr/bin/env node
/**
 * arc-guard - PreToolUse deterministic BLOCK guard for arcforge workflows.
 *
 * Hardens a few skill invariants from advisory prose into hard gates. Each rule
 * fires only when a precise, self-gating signal is present, and is a no-op
 * otherwise. A false-positive on the block path is the expensive failure mode
 * (users disable arcforge hooks wholesale), so every rule is narrow.
 *
 * Bash rules — gated by the `.arcforge-epic` marker in cwd (i.e. inside a worktree):
 *   G2  raw `git merge`        -> redirect to the arc-finishing-epic coordinator flow
 *   G3  arcforge loop launch   -> loops run from the base session, not a worktree
 *
 * Edit/Write rules — gated by `research-config.md` in cwd (i.e. an arc-researching
 * loop is locked):
 *   R-immutable  editing research-config.md     -> the locked judge is immutable
 *   R-scope      editing a CANNOT-modify path   -> out-of-scope write (exact paths only)
 *
 * NO-OP INVARIANT (tested): with no `.arcforge-epic` marker (Bash) and no
 * `research-config.md` (Edit/Write) in cwd, the hook emits nothing and the tool
 * call proceeds untouched.
 *
 * BLOCK MECHANISM: PreToolUse stdout JSON
 *   { hookSpecificOutput: { hookEventName: 'PreToolUse',
 *       permissionDecision: 'deny', permissionDecisionReason } }
 * with exit 0; the reason is fed back to Claude. The hook MUST run synchronously
 * (registered without `async`) — async hooks cannot block. The coordinator's own
 * git calls use execFileSync (not the Bash tool), so they bypass this hook — the
 * Bash rules only ever see the agent's manual command, which is the violation.
 */

const fs = require('node:fs');
const path = require('node:path');
const { readStdinSync, parseStdinJson, output } = require('../../scripts/lib/utils');
const { hasArcforgeMarker, readArcforgeMarker } = require('../../scripts/lib/marker');

// `git merge` that INITIATES a merge. Excludes `git merge-base`/`-file` (lookahead:
// next char is whitespace or end) AND conflict-recovery (`--abort`/`--continue`/
// `--quit`) — those are exactly what a worktree implementer runs during the
// arc-finishing-epic conflict flow, so blocking them would misdirect.
const GIT_MERGE_RE = /\bgit\s+merge(?!\s+--(?:abort|continue|quit)\b)(?=\s|$)/;
// Arcforge loop INVOCATIONS only — not reading/diffing a file named loop.js.
const LOOP_RE = /\bnode\s+\S*loop\.js\b|\bcli\.js\s+loop\b|\barcforge\s+loop\b/;

const RESEARCH_CONFIG = 'research-config.md';

/**
 * Build a deny reason for a Bash command known to run inside a worktree, or null.
 * @param {string} command - the Bash command being run
 * @param {string|undefined} specId - spec id from the marker, for a clearer message
 * @returns {string|null}
 */
function denyReason(command, specId) {
  const scope = specId ? ` (spec ${specId})` : '';
  if (GIT_MERGE_RE.test(command)) {
    return (
      `You're inside an arcforge epic worktree${scope} (an .arcforge-epic marker is present). ` +
      "Raw `git merge` here bypasses the coordinator's DAG and marker bookkeeping. " +
      'Use the arc-finishing-epic flow instead: `finish-epic.js merge` to merge the epic out, ' +
      'or `finish-epic.js sync --direction from-base` to pull base in. ' +
      'A genuine manual merge belongs in the base checkout, not the worktree.'
    );
  }
  if (LOOP_RE.test(command)) {
    return (
      `You're inside an arcforge epic worktree${scope} (an .arcforge-epic marker is present). ` +
      'Arcforge loops run from the project root / base session, not from inside a worktree — ' +
      'a nested loop duplicates coordination. Exit to the base checkout and start the loop there ' +
      '(see arc-looping).'
    );
  }
  return null;
}

/** Bash rule dispatch (G2/G3). */
function evaluateBash(input, cwd) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !command) return null;
  // Self-gating + no-op invariant: only active inside an epic worktree.
  if (!hasArcforgeMarker(cwd)) return null;
  // Cheap pattern check before the (rare) YAML parse for spec id.
  if (!GIT_MERGE_RE.test(command) && !LOOP_RE.test(command)) return null;
  const marker = readArcforgeMarker(cwd);
  return denyReason(command, marker?.spec_id);
}

/**
 * Parse the CANNOT-modify entries of a locked research-config.md into resolved
 * absolute paths — but ONLY those that resolve to an existing file/dir. Free-form
 * prose, glob patterns, and the unfilled `{template}` placeholder resolve to
 * nothing on disk and are skipped. Erring toward skipping is deliberate: a missed
 * fence is recoverable (the research loop runs on a branch and resets), a false
 * block mid-loop is not.
 * @param {string} configText
 * @param {string} cwd
 * @returns {string[]} absolute paths that exist and are off-limits
 */
function parseCannotPaths(configText, cwd) {
  const entries = [];
  for (const line of configText.split('\n')) {
    const m = line.match(/CANNOT\s+modify\s*:\s*(.+)/i);
    if (!m) continue;
    for (const raw of m[1].split(/[\s,]+/)) {
      const clean = raw.replace(/^[`'"{(]+|[`'"})]+$/g, '');
      if (!clean) continue;
      const resolved = path.resolve(cwd, clean);
      if (fs.existsSync(resolved)) entries.push(resolved);
    }
  }
  return entries;
}

/** Edit/Write rule dispatch (research-config immutability + scope fence). */
function evaluateFileEdit(input, cwd) {
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath) return null;

  const configPath = path.resolve(cwd, RESEARCH_CONFIG);
  // No-op invariant: only active when a locked research contract exists in cwd.
  if (!fs.existsSync(configPath)) return null;

  const target = path.resolve(cwd, filePath);

  if (target === configPath) {
    return (
      '`research-config.md` is the locked research contract — the immutable judge of an ' +
      'arc-researching loop. The autonomous loop must not silently edit what it measures. ' +
      'If a human approved changing it (e.g. raising Trials), edit it manually outside the ' +
      'loop or temporarily disable the arc-guard hook; do not modify it from within the run.'
    );
  }

  let configText;
  try {
    configText = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  for (const entry of parseCannotPaths(configText, cwd)) {
    if (target === entry || target.startsWith(entry + path.sep)) {
      return (
        `\`${filePath}\` is inside the CANNOT-modify scope of research-config.md. ` +
        "arc-researching's Iron Law #1: never modify files outside the declared scope. " +
        'If this file genuinely needs to change, the contract is wrong — stop and tell the human.'
      );
    }
  }
  return null;
}

/**
 * Pure decision core for a PreToolUse event. Returns a deny reason, or null to allow.
 * @param {Object|null} input - parsed hook stdin
 * @returns {string|null}
 */
function evaluate(input) {
  if (!input) return null;
  const cwd = input.cwd || process.cwd();
  if (input.tool_name === 'Bash') return evaluateBash(input, cwd);
  if (input.tool_name === 'Edit' || input.tool_name === 'Write') {
    return evaluateFileEdit(input, cwd);
  }
  return null;
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

module.exports = {
  evaluate,
  denyReason,
  parseCannotPaths,
  GIT_MERGE_RE,
  LOOP_RE,
  RESEARCH_CONFIG,
};

if (require.main === module) {
  main();
}
