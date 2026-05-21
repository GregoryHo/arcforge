/**
 * lifecycle.js — Layer 5 canonical lifecycle state machine.
 *
 * Owns the Action × Status legality matrix from PR #31 reconcile 1.5.
 * Stateless pure functions — no I/O.
 */

// ---------------------------------------------------------------------------
// Action × Status legality matrix (canonical)
//
// Rows: current status
// Cols: action
//
// promote / evolve are candidate-PRODUCING actions.  They are legal from certain
// statuses (callers use isLegalAction to gate the UI), but they do NOT transition
// the SOURCE candidate's status.  applyTransition throws for those two actions so
// callers are forced to handle them separately (creating a new candidate record).
//
//  status \ action     | dismiss | approve | materialize | activate | promote | evolve | deactivate
//  pending_review      |   ✓     |   ✓     |     ✗       |    ✗     |   ✓     |   ✓   |    ✗
//  needs_more_evidence |   ✓     |   ✗     |     ✗       |    ✗     |   ✗     |   ✗   |    ✗
//  approved            |   ✗     |   ✗     |     ✓       |    ✗     |   ✓     |   ✓   |    ✗
//  materialized        |   ✗     |   ✗     |     ✗       |    ✓     |   ✗     |   ✗   |    ✗
//  activated           |   ✗     |   ✗     |     ✗       |    ✗     |   ✗     |   ✗   |    ✓
//  deactivated         |   ✗     |   ✗     |     ✓       |    ✓     |   ✗     |   ✗   |    ✗
//  dismissed           |   ✗     |   ✗     |     ✗       |    ✗     |   ✗     |   ✗   |    ✗
//  superseded          |   ✗     |   ✗     |     ✗       |    ✗     |   ✗     |   ✗   |    ✗
// ---------------------------------------------------------------------------

// Canonical lifecycle status set (Layer 5 spec — CandidateLifecycleStatus).
// Exported so callers reference constants instead of raw string literals.
const LIFECYCLE_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  NEEDS_MORE_EVIDENCE: 'needs_more_evidence',
  APPROVED: 'approved',
  MATERIALIZED: 'materialized',
  ACTIVATED: 'activated',
  DEACTIVATED: 'deactivated',
  DISMISSED: 'dismissed',
  SUPERSEDED: 'superseded',
});

const LIFECYCLE_STATUSES = Object.freeze(Object.values(LIFECYCLE_STATUS));

// Canonical action set (Layer 5 spec — Action × Status matrix columns).
// DEACTIVATE added in Slice G (Layer 8 extension).
const LIFECYCLE_ACTION = Object.freeze({
  DISMISS: 'dismiss',
  APPROVE: 'approve',
  MATERIALIZE: 'materialize',
  ACTIVATE: 'activate',
  PROMOTE: 'promote',
  EVOLVE: 'evolve',
  DEACTIVATE: 'deactivate',
});

const ACTIONS = Object.freeze(Object.values(LIFECYCLE_ACTION));

// true  = action is legal from this status
// false = action must be rejected with policy_violation
// Index order matches ACTIONS above:
//   dismiss, approve, materialize, activate, promote, evolve, deactivate
// deactivate column added in Slice G (Layer 8 extension).
const MATRIX = {
  pending_review: [true, true, false, false, true, true, false],
  needs_more_evidence: [true, false, false, false, false, false, false],
  approved: [false, false, true, false, true, true, false],
  materialized: [false, false, false, true, false, false, false],
  activated: [false, false, false, false, false, false, true],
  deactivated: [false, false, true, true, false, false, false],
  dismissed: [false, false, false, false, false, false, false],
  superseded: [false, false, false, false, false, false, false],
};

// Status produced after a legal status-changing action
// promote and evolve are intentionally absent — they don't change source status
const NEXT_STATUS = {
  dismiss: 'dismissed',
  approve: 'approved',
  materialize: 'materialized',
  activate: 'activated',
  deactivate: 'deactivated',
};

/**
 * Return true when action is listed as ✓ for currentStatus in the matrix.
 * Returns false for unknown statuses or actions.
 *
 * @param {string} currentStatus
 * @param {string} action
 * @returns {boolean}
 */
function isLegalAction(currentStatus, action) {
  const row = MATRIX[currentStatus];
  if (!row) return false;
  const idx = ACTIONS.indexOf(action);
  if (idx === -1) return false;
  return row[idx];
}

/**
 * Compute the next lifecycle status after applying action to currentStatus.
 *
 * Throws for:
 *   - illegal transitions (isLegalAction returns false)
 *   - promote / evolve (candidate-producing; do not transition source status)
 *
 * @param {string} currentStatus
 * @param {string} action
 * @returns {string} next status
 */
function applyTransition(currentStatus, action) {
  if (action === 'promote' || action === 'evolve') {
    throw new Error(
      `"${action}" is a candidate-producing action and does not transition the source ` +
        `candidate's status. Use isLegalAction to gate the UI, then create a new candidate ` +
        `record rather than calling applyTransition.`,
    );
  }

  if (!isLegalAction(currentStatus, action)) {
    throw new Error(
      `Illegal lifecycle transition: cannot apply action "${action}" to status "${currentStatus}". ` +
        `This violates the Layer 5 Action × Status matrix.`,
    );
  }

  const next = NEXT_STATUS[action];
  if (!next) {
    throw new Error(`No next-status mapping for action "${action}" — this is a lifecycle.js bug.`);
  }
  return next;
}

module.exports = {
  isLegalAction,
  applyTransition,
  LIFECYCLE_STATUS,
  LIFECYCLE_STATUSES,
  LIFECYCLE_ACTION,
  ACTIONS,
  MATRIX,
};
