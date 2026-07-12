#!/usr/bin/env node
/**
 * dispatch-pre.js — the single sync PreToolUse guard dispatcher (v5).
 *
 * Runs the deterministic BLOCK guards in one process instead of one registration
 * each: arc-guard (Bash/Edit/Write), sdd-ledger-guard (Edit/Write decisions.yml),
 * sdd-ratify-guard (Bash ratify). Each guard keeps its own per-tool self-gating,
 * so the '.*' matcher is safe — a guard that does not apply returns null.
 *
 * Deny precedence follows registration order (arc-guard, ledger, ratify); the
 * first guard to return a reason denies the tool call. New Wave-2 guards
 * (dag-guard, secrets-guard, autopilot denies) slot into RULES without changing
 * the dispatch or output shape.
 *
 * BLOCK MECHANISM: PreToolUse stdout JSON with exit 0 (same as the former
 * per-hook guards). MUST be sync — async hooks cannot block.
 */

const { runRules } = require('../scripts/lib/hook-dispatch');
const { output } = require('../scripts/lib/utils');

const arcGuard = require('./arc-guard/main');
const ledgerGuard = require('./sdd-ledger-guard/main');
const ratifyGuard = require('./sdd-ratify-guard/main');

const RULES = [
  { id: 'arc-guard', evaluate: arcGuard.evaluate },
  { id: 'sdd-ledger-guard', evaluate: ledgerGuard.evaluate },
  { id: 'sdd-ratify-guard', evaluate: ratifyGuard.evaluate },
];

function main() {
  try {
    const { results } = runRules(RULES);
    for (const { value } of results) {
      if (value) {
        output({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: value,
          },
        });
        return;
      }
    }
  } catch {
    // Never crash the session — on any error, allow the tool call (fail-open).
  }
}

module.exports = { RULES, main };

if (require.main === module) {
  main();
}
