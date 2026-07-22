#!/usr/bin/env node
/**
 * dispatch-pre.js — the single sync PreToolUse guard dispatcher (v5).
 *
 * Runs the deterministic BLOCK guards in one process instead of one registration
 * each: arc-guard (Bash/Edit/Write), sdd-ledger-guard (Edit/Write decisions.yml),
 * sdd-ratify-guard (Bash ratify). Each guard keeps its own per-tool self-gating,
 * so the '.*' matcher is safe — a guard that does not apply returns null.
 *
 * Deny precedence follows registration order (arc-guard, ledger, dag, ratify,
 * autopilot-deny); the first guard to return a reason denies the tool call. When
 * no deny fires, the WARN_RULES pass runs (secrets-guard) and emits at most one
 * advisory systemMessage — the deny output shape is untouched.
 *
 * BLOCK MECHANISM: PreToolUse stdout JSON with exit 0 (same as the former
 * per-hook guards). MUST be sync — async hooks cannot block.
 */

const { runRules } = require('../scripts/lib/hook-dispatch');
const { output } = require('../scripts/lib/utils');

const arcGuard = require('./arc-guard/main');
const ledgerGuard = require('./sdd-ledger-guard/main');
const ratifyGuard = require('./sdd-ratify-guard/main');
const dagGuard = require('./dag-guard/main');
const autopilotDeny = require('./autopilot-deny/main');
const secretsGuard = require('./secrets-guard/main');

const RULES = [
  { id: 'arc-guard', evaluate: arcGuard.evaluate },
  { id: 'sdd-ledger-guard', evaluate: ledgerGuard.evaluate },
  { id: 'dag-guard', evaluate: dagGuard.evaluate },
  { id: 'sdd-ratify-guard', evaluate: ratifyGuard.evaluate },
  { id: 'autopilot-deny', evaluate: autopilotDeny.evaluate },
];

// WARN-first rules run only when no deny fired. They return a user-visible
// warning string (systemMessage), never a permission decision — keeping the deny
// output shape untouched while adding the advisory channel secrets-guard needs.
const WARN_RULES = [{ id: 'secrets-guard', evaluate: secretsGuard.evaluate }];

function main() {
  try {
    const { input, results, disabled } = runRules(RULES);
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

    // No deny — run the warn rules and emit at most one systemMessage (the
    // single-JSON-object protocol). Each warn rule is fault-isolated and honors
    // ARCFORGE_DISABLED_HOOKS by id, reusing the disabled set runRules computed.
    const warnings = [];
    for (const rule of WARN_RULES) {
      if (disabled.has(rule.id)) continue;
      try {
        const warning = rule.evaluate(input);
        if (warning) warnings.push(warning);
      } catch {
        // Fault isolation — a warn rule must never block the tool call.
      }
    }
    if (warnings.length > 0) {
      output({ systemMessage: warnings.join('\n') });
    }
  } catch {
    // Never crash the session — on any error, allow the tool call (fail-open).
  }
}

module.exports = { RULES, WARN_RULES, main };

if (require.main === module) {
  main();
}
