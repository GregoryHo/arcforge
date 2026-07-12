/**
 * hook-dispatch.js — shared runner for the PreToolUse / PostToolUse sub-hook
 * dispatchers.
 *
 * Consolidation (v5) collapses the former per-hook registrations into two sync
 * dispatcher processes (one PreToolUse, one PostToolUse). Each dispatcher owns a
 * list of sub-hook RULES; this module runs them against a SINGLE parsed event:
 *
 *   - stdin is read ONCE and parsed ONCE (a dispatcher is one process for all
 *     sub-hooks, unlike the old process-per-hook model).
 *   - setSessionIdFromInput is called EXACTLY once — utils.js caches the session
 *     id at module level, so the per-event derivation must happen a single time
 *     before any rule reads a session-scoped counter/state file.
 *   - each rule runs under its OWN try/catch (fault isolation): a rule throwing
 *     must not block the event or its siblings — this replaces the process
 *     isolation that separate registrations gave for free.
 *   - ARCFORGE_DISABLED_HOOKS (comma-separated sub-hook ids) disables individual
 *     rules by id; a disabled rule is skipped without affecting its siblings or
 *     any shared counter a sibling owns.
 *
 * A rule is `{ id: string, evaluate: (input) => any }`. runRules returns the
 * per-rule return values in order; the dispatcher decides how to emit them
 * (first-deny for PreToolUse, merged single JSON object for PostToolUse).
 */

const { readStdinSync, parseStdinJson, setSessionIdFromInput } = require('./utils');

/**
 * Parse ARCFORGE_DISABLED_HOOKS into a set of sub-hook ids.
 * @returns {Set<string>}
 */
function disabledSet() {
  return new Set(
    (process.env.ARCFORGE_DISABLED_HOOKS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Run a list of sub-hook rules against one hook event.
 *
 * @param {Array<{id: string, evaluate: (input: object|null) => any}>} rules
 * @returns {{ input: object|null, results: Array<{id: string, value: any}> }}
 */
function runRules(rules) {
  const input = parseStdinJson(readStdinSync());
  setSessionIdFromInput(input);
  const disabled = disabledSet();

  const results = [];
  for (const rule of rules) {
    if (disabled.has(rule.id)) {
      results.push({ id: rule.id, value: null });
      continue;
    }
    let value = null;
    try {
      value = rule.evaluate(input);
    } catch {
      // Fault isolation — one rule crashing must never block the event or its
      // siblings. Treat a thrown rule as "no output" and continue.
      value = null;
    }
    results.push({ id: rule.id, value });
  }
  return { input, results };
}

module.exports = { runRules, disabledSet };
