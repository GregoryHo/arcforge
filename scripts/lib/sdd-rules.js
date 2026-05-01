/**
 * sdd-rules.js — Schema rule constants for _pending-conflict.md and decision-log.
 *
 * Extracted from sdd-utils.js to avoid a circular dependency between
 * sdd-utils.js and sdd-validators.js. Both modules import from here.
 * sdd-utils.js re-exports these constants so the public API is unchanged.
 *
 * These are fr-sd-012 (PENDING_CONFLICT_RULES) and fr-sd-013 (DECISION_LOG_RULES)
 * schema constants — single source of truth for downstream validators and tests.
 *
 * =============================================================================
 *  SCHEMA-RULE CONSTANT SHAPE CONTRACT (read this before adding a new constant)
 * =============================================================================
 *
 *  Every SDD schema-rule constant in this codebase — both here and the original
 *  SPEC_HEADER_RULES in sdd-utils.js — MUST follow the shape contract below for
 *  any property that lists "required fields" (whether named `required_fields`,
 *  `required_fields_per_row`, or another suffix). The contract enables uniform
 *  cross-rules tooling: print-schema rendering, generic validators, and
 *  cross-rules lints can iterate ANY rule constant without per-shape branches.
 *
 *  CORE CONTRACT (universal — every entry MUST satisfy):
 *    - `key`         non-empty string. The canonical logical identifier.
 *                    Tooling reads `key` for cross-rules iteration. This is the
 *                    primary identifier; do NOT introduce alternative names
 *                    (e.g. `name`, `field_name`) as the primary key.
 *    - `type`        non-empty string. Logical type tag (e.g. 'string', 'enum',
 *                    'boolean', 'positive integer', 'list').
 *
 *  OPTIONAL EXTENSIONS (when present, MUST be well-formed):
 *    - `description` non-empty string. Human/LLM-facing explanation of intent.
 *                    Recommended for any field whose `type` does not fully
 *                    convey semantics. Required for PENDING_CONFLICT_RULES and
 *                    DECISION_LOG_RULES; spec-header fields are simple enough
 *                    that `type` alone carries the meaning.
 *    - `field`       non-empty string. Wire-format path for nested formats
 *                    (e.g. SPEC_HEADER_RULES uses `source/design_path` in XML).
 *                    Renderers default to `key` when `field` is absent (flat
 *                    formats like the YAML in pending-conflict / decision-log).
 *    - `allowed`     non-empty array of strings. Used when `type === 'enum'`.
 *    - `min_length`, `max_length`  positive integers. Used when `type === 'list'`.
 *
 *  ENFORCEMENT:
 *    - tests/scripts/sdd-rules-invariants.test.js iterates every registered
 *      rule constant and asserts core + extension shape. If you add a new
 *      schema-rule constant, register it in that test's RULE_REGISTRY array;
 *      otherwise the cross-rules invariants do not cover it.
 *
 *  WHEN YOU MUST CHANGE THIS CONTRACT:
 *    Update this comment block, update sdd-rules-invariants.test.js, and
 *    audit print-schema.js for the new shape. A drift between any of these
 *    three is the failure mode this contract exists to prevent.
 *
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// PENDING_CONFLICT_RULES — single source of truth for _pending-conflict.md schema.
// -----------------------------------------------------------------------------
// Refiner writes specs/<spec-id>/_pending-conflict.md on R3 axis-1/2/3 block
// (fr-rf-015). Brainstorming reads it as Change Intent seed in Phase 0 (fr-bs-008)
// and deletes it on successful new-design write. Per A.1's narrowed Iron Law, this
// is the explicit ephemeral exception to "no authoritative state on block".
//
// Validators (fr-sd-014) and brainstorming Phase 0 detection (fr-bs-008) read from
// this object — there is exactly one source of truth and it is the code.
//
// Deep-frozen: nested arrays and objects are also frozen so mutation at any depth
// is rejected. Nested objects are frozen inline using Object.freeze() at each level.
const PENDING_CONFLICT_RULES = Object.freeze({
  canonical_path: 'specs/<spec-id>/_pending-conflict.md',
  // The underscore prefix marks the file as ephemeral hand-off, not versioned spec
  // content. The file MUST NOT live under details/ or any path parsed as a spec detail.
  required_fields: Object.freeze([
    Object.freeze({
      key: 'axis_fired',
      type: 'enum',
      // Which R3 axis triggered the block: 1 (design.md internal), 2 (design.md <-> Q&A),
      // or 3 (spec-draft coverage -- criterion cannot be traced to a design phrase or Q&A row).
      allowed: Object.freeze(['1', '2', '3']),
      description: 'Which contradiction axis fired (1, 2, or 3 per fr-rf-015 / A.2).',
    }),
    Object.freeze({
      key: 'conflict_description',
      type: 'string',
      description:
        'Specific design line ranges and Q&A row q_ids involved in the contradiction. ' +
        'Must cite exact sources so brainstorming Phase 0 can mechanically address them.',
    }),
    Object.freeze({
      key: 'candidate_resolutions',
      type: 'list',
      min_length: 1,
      max_length: 3,
      description:
        '1-3 candidate resolutions, each phrased as a concrete action the user can pick. ' +
        'Zero resolutions is an ERROR: "_pending-conflict.md MUST contain at least one candidate resolution".',
    }),
    Object.freeze({
      key: 'user_action_prompt',
      type: 'string',
      description:
        'Directs the user to run /arc-brainstorming iterate <spec-id> to resolve the conflict. ' +
        'Must be present so the user knows how to proceed after reading the conflict file.',
    }),
  ]),
  lifecycle: Object.freeze({
    state: 'ephemeral',
    written_by: 'refiner on R3 axis-1/2/3 block (fr-rf-015)',
    read_by: 'brainstorming Phase 0 iterate-branch auto-entry (fr-bs-008)',
    deleted_by: 'brainstorming on successful new-design write',
    // Per A.1's narrowed Iron Law: non-versioned, non-authoritative.
    // Validators (fr-sd-014) MUST treat persistence across a completed conflict cycle as
    // ERROR ("a prior conflict cycle did not complete cleanly").
    persist_across_completed_cycle: 'ERROR',
  }),
});

// -----------------------------------------------------------------------------
// DECISION_LOG_RULES — single source of truth for structured decision-log schema.
// -----------------------------------------------------------------------------
// Brainstorming produces Q&A rows during Phase 2 elicitation (fr-bs-009).
// Refiner consumes rows for Phase 4 axis 2 contradiction check and Phase 6
// mechanical authorization check (fr-rf-010-ac5). This constant is the interface
// contract between those two stages per fr-cc-if-008.
//
// Validators (fr-sd-014) and refiner Phase 6 read from this object -- there is
// exactly one source of truth and it is the code.
//
// Deep-frozen: nested arrays and objects are also frozen so mutation at any depth
// is rejected. Nested objects are frozen inline using Object.freeze() at each level.
const DECISION_LOG_RULES = Object.freeze({
  // Path is relative to brainstorming's output directory (the date-stamped folder
  // under docs/plans/<spec-id>/). Wire format (YAML, strict markdown table, etc.)
  // is a swappable implementation detail -- the contract is the field shape.
  canonical_path: '<brainstorming-output-dir>/decision-log.<ext>',
  // The four required fields every Q&A row MUST carry (fr-cc-if-008-ac1).
  // Missing any field is ERROR. Order here matches the wire order convention.
  // Shape mirrors PENDING_CONFLICT_RULES.required_fields and
  // SPEC_HEADER_RULES.required_fields: array of {key, type, description}
  // so generic schema tooling (print-schema, cross-rules lints) can iterate
  // both constants uniformly.
  required_fields_per_row: Object.freeze([
    Object.freeze({
      key: 'q_id',
      type: 'string',
      description:
        'Stable identifier, unique within a single brainstorming session. ' +
        'Refiner Phase 6 looks up rows by q_id for deterministic citation without LLM re-interpretation.',
    }),
    Object.freeze({
      key: 'question',
      type: 'string',
      description:
        'The question text the brainstormer asked the user. Used for context when refiner cites a row.',
    }),
    Object.freeze({
      key: 'user_answer_verbatim',
      type: 'string',
      description:
        'Verbatim user answer (no paraphrasing). Refiner Phase 6 cites this content directly; ' +
        'paraphrasing would introduce LLM judgment into what is meant to be a mechanical lookup.',
    }),
    Object.freeze({
      key: 'deferral_signal',
      type: 'boolean',
      description:
        'True iff user_answer_verbatim matches a canonical deferral phrase (case-insensitive, trimmed). ' +
        'Refiner MUST NOT treat a deferred axis as authorization for a concrete MUST (fr-rf-013).',
    }),
  ]),
  // q_id is a stable identifier, unique within a single brainstorming session.
  // Duplicate q_id within one session is ERROR -- it breaks deterministic lookup.
  q_id_uniqueness: 'unique per brainstorming session; duplicate q_id within a session is ERROR',
  // Rows MUST be addressable by q_id so refiner Phase 6 can look up cited content
  // without LLM re-interpretation (fr-sd-013-ac2, fr-cc-if-008-ac3).
  addressable_by: 'q_id',
  // Canonical deferral phrases. When user_answer_verbatim matches any of these
  // (case-insensitive, trimmed), deferral_signal MUST be set to true (fr-cc-if-008-ac4).
  // Refiner MUST NOT treat a deferred axis as authorization for a concrete MUST
  // (fr-rf-013). Additional phrases MAY be included by implementations.
  deferral_signal_canonical_phrases: Object.freeze([
    'use defaults',
    'covered.',
    'skip',
    'you decide',
  ]),
});

module.exports = {
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
};
