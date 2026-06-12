/**
 * sdd-utils.js — Spec-Driven Development utility facade.
 *
 * Provides deterministic validation helpers for design docs, spec headers,
 * visions, and decision ledgers. The schema rules live in code as exported
 * constants — there is exactly one source of truth and it is the code, not
 * hand-authored markdown. See fr-sd-010 / fr-sd-011.
 *
 * Implementations live in sibling modules:
 *   - sdd-design-doc.js       design-doc + vision parsing/validation, DAG gate
 *   - sdd-spec-header.js      spec.xml identity-header schema + parser + validator
 *   - sdd-decision-ledger.js  decisions.yml parsing, append-only validation,
 *                             graph audit, loop sentinel
 *   - sdd-rules.js            shared rule constants (avoids circular deps)
 *   - sdd-validators.js       conflict-marker + decision-log validators
 *
 * This module re-exports the full SDD surface so existing importers (hooks,
 * ratify-command, print-schema, tests, skill snippets) keep resolving every
 * name from here. It never imports those callers back.
 */

const {
  DESIGN_DOC_RULES,
  parseDesignDoc,
  validateDesignDoc,
  parseVision,
  validateVision,
  checkDagStatus,
} = require('./sdd-design-doc');
const { SPEC_HEADER_RULES, parseSpecHeader, validateSpecHeader } = require('./sdd-spec-header');
const {
  getHeadLedgerContent,
  parseDecisionLedgerContent,
  parseDecisionLedger,
  validateDecisionLedger,
  checkSpecDecisionGraph,
  LOOP_SENTINEL,
  LOOP_HEARTBEAT_STALE_MS,
  loopSentinelPresent,
} = require('./sdd-decision-ledger');
const {
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
  VISION_RULES,
  DECISION_LEDGER_RULES,
} = require('./sdd-rules');
const {
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
  writeConflictMarker,
} = require('./sdd-validators');

module.exports = {
  // Schema rule constants — SoT for downstream schema consumers (print-schema.js,
  // tests). Exported so drift between code and docs is impossible by construction.
  DESIGN_DOC_RULES,
  SPEC_HEADER_RULES,
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
  // D6 P1 new constants — re-exported from sdd-rules.js (canonical source).
  // print-schema.js, invariants tests, and validators import from here (facade).
  VISION_RULES,
  DECISION_LEDGER_RULES,
  // D6 P1 new parsers/validators — vision and decision ledger.
  parseVision,
  validateVision,
  parseDecisionLedgerContent,
  parseDecisionLedger,
  validateDecisionLedger,
  getHeadLedgerContent,
  // Parsers / validators.
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
  checkDagStatus,
  // fr-sd-014: conflict/decision-log parsers + mechanical auth check.
  // Implemented in sdd-validators.js; re-exported here for a unified API surface.
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
  // fr-rf-015: conflict marker writer — called by refiner on R3 axis-1/2/3 block.
  writeConflictMarker,
  // D6 P2: spec↔decision↔anchor graph audit (S10 shared lib helper).
  checkSpecDecisionGraph,
  // D6 P3: B1 loop sentinel — canonical export for ratify-command + hook.
  LOOP_SENTINEL,
  LOOP_HEARTBEAT_STALE_MS,
  loopSentinelPresent,
};
