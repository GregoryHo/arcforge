#!/usr/bin/env node
/**
 * dispatch-post.js — the single sync PostToolUse dispatcher (v5).
 *
 * Runs the PostToolUse sub-hooks in one process instead of one registration
 * each:
 *   - quality-check: accumulates the edited path for the Stop-time batch
 *     (emits nothing here).
 *   - arc-remind: deterministic reminder nudges (autopilot-aware).
 *   - compact-suggester: increments the shared diary tool-count on EVERY event
 *     and emits the phase-aware compaction suggestion at the threshold.
 *
 * Each sub-hook self-gates, so the '.*' matcher is safe. Output is merged into
 * EXACTLY ONE stdout JSON object per event (the single-JSON-object hook
 * protocol): all model-visible reasons (additionalContext) and all user-visible
 * systemMessages from the firing sub-hooks are combined. When only one sub-hook
 * fires, the emitted object is byte-identical to its former standalone output.
 */

const { runRules } = require('../scripts/lib/hook-dispatch');
const { output, outputPostToolUseFeedback } = require('../scripts/lib/utils');

const quality = require('./quality-check/main');
const arcRemind = require('./arc-remind/main');
const compact = require('./compact-suggester/main');

const RULES = [
  { id: 'quality-check', evaluate: quality.accumulate },
  { id: 'arc-remind', evaluate: arcRemind.evaluate },
  { id: 'compact-suggester', evaluate: compact.evaluate },
];

function main() {
  try {
    const { results } = runRules(RULES);
    const modelReasons = [];
    const systemMessages = [];
    for (const { value } of results) {
      if (!value) continue;
      if (value.modelReason) modelReasons.push(value.modelReason);
      if (value.systemMessage) systemMessages.push(value.systemMessage);
    }

    const modelReason = modelReasons.length > 0 ? modelReasons.join('\n') : null;
    const systemMessage = systemMessages.length > 0 ? systemMessages.join('\n') : null;

    // The model channel throws on an empty reason, so route the systemMessage-only
    // case through plain output().
    if (modelReason) {
      outputPostToolUseFeedback(modelReason, systemMessage ? { systemMessage } : undefined);
    } else if (systemMessage) {
      output({ systemMessage });
    }
  } catch {
    // Non-blocking — never crash the session.
  }
}

module.exports = { RULES, main };

if (require.main === module) {
  main();
}
