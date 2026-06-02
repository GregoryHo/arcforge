// tests/scripts/learning-curator-lifecycle.test.js

const {
  isLegalAction,
  applyTransition,
  LIFECYCLE_STATUS,
  LIFECYCLE_STATUSES,
  LIFECYCLE_ACTION,
  ACTIONS,
} = require('../../scripts/lib/learning-curator/lifecycle');

// ---------------------------------------------------------------------------
// Matrix self-test — guards against silent drift from the Layer 5 spec
// (docs/plans/references/learning-curator-schema/layer-5-candidate-queue-lifecycle.md
// section "Action × Status legality matrix (canonical)").
// ---------------------------------------------------------------------------

describe('Action × Status matrix — canonical spec', () => {
  // Expected matrix, transcribed from the spec — one ✓/✗ per cell.
  const EXPECTED = {
    pending_review: {
      dismiss: true,
      approve: true,
      materialize: false,
      activate: false,
      promote: true,
      evolve: true,
      deactivate: false,
    },
    needs_more_evidence: {
      dismiss: true,
      approve: false,
      materialize: false,
      activate: false,
      promote: false,
      evolve: false,
      deactivate: false,
    },
    approved: {
      dismiss: false,
      approve: false,
      materialize: true,
      activate: false,
      promote: true,
      evolve: true,
      deactivate: false,
    },
    materialized: {
      dismiss: false,
      approve: false,
      materialize: false,
      activate: true,
      promote: false,
      evolve: false,
      deactivate: false,
    },
    activated: {
      dismiss: false,
      approve: false,
      materialize: false,
      activate: false,
      promote: false,
      evolve: false,
      deactivate: true,
    },
    deactivated: {
      dismiss: false,
      approve: false,
      materialize: true,
      activate: true,
      promote: false,
      evolve: false,
      deactivate: false,
    },
    dismissed: {
      dismiss: false,
      approve: false,
      materialize: false,
      activate: false,
      promote: false,
      evolve: false,
      deactivate: false,
    },
    superseded: {
      dismiss: false,
      approve: false,
      materialize: false,
      activate: false,
      promote: false,
      evolve: false,
      deactivate: false,
    },
  };

  it('LIFECYCLE_STATUSES covers all 8 spec statuses', () => {
    expect([...LIFECYCLE_STATUSES].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('ACTIONS covers all 7 spec actions (6 original + deactivate)', () => {
    expect([...ACTIONS].sort()).toEqual(
      ['dismiss', 'approve', 'materialize', 'activate', 'promote', 'evolve', 'deactivate'].sort(),
    );
  });

  it('every (status × action) cell matches the spec', () => {
    for (const status of Object.keys(EXPECTED)) {
      for (const action of Object.keys(EXPECTED[status])) {
        expect({ status, action, legal: isLegalAction(status, action) }).toEqual({
          status,
          action,
          legal: EXPECTED[status][action],
        });
      }
    }
  });
});

describe('LIFECYCLE_STATUS / LIFECYCLE_ACTION constants are frozen', () => {
  it('LIFECYCLE_STATUS is frozen and matches spec values', () => {
    expect(Object.isFrozen(LIFECYCLE_STATUS)).toBe(true);
    expect(LIFECYCLE_STATUS.PENDING_REVIEW).toBe('pending_review');
    expect(LIFECYCLE_STATUS.SUPERSEDED).toBe('superseded');
  });

  it('LIFECYCLE_ACTION is frozen and matches spec values', () => {
    expect(Object.isFrozen(LIFECYCLE_ACTION)).toBe(true);
    expect(LIFECYCLE_ACTION.APPROVE).toBe('approve');
    expect(LIFECYCLE_ACTION.EVOLVE).toBe('evolve');
  });
});

// ---------------------------------------------------------------------------
// Legal transitions — isLegalAction returns true
// ---------------------------------------------------------------------------

describe('isLegalAction — legal cells (✓)', () => {
  it('pending_review → dismiss is legal', () => {
    expect(isLegalAction('pending_review', 'dismiss')).toBe(true);
  });

  it('pending_review → approve is legal', () => {
    expect(isLegalAction('pending_review', 'approve')).toBe(true);
  });

  it('pending_review → promote is legal', () => {
    expect(isLegalAction('pending_review', 'promote')).toBe(true);
  });

  it('pending_review → evolve is legal', () => {
    expect(isLegalAction('pending_review', 'evolve')).toBe(true);
  });

  it('needs_more_evidence → dismiss is legal', () => {
    expect(isLegalAction('needs_more_evidence', 'dismiss')).toBe(true);
  });

  it('approved → materialize is legal', () => {
    expect(isLegalAction('approved', 'materialize')).toBe(true);
  });

  it('approved → promote is legal', () => {
    expect(isLegalAction('approved', 'promote')).toBe(true);
  });

  it('approved → evolve is legal', () => {
    expect(isLegalAction('approved', 'evolve')).toBe(true);
  });

  it('materialized → activate is legal', () => {
    expect(isLegalAction('materialized', 'activate')).toBe(true);
  });

  it('deactivated → materialize is legal', () => {
    expect(isLegalAction('deactivated', 'materialize')).toBe(true);
  });

  it('deactivated → activate is legal', () => {
    expect(isLegalAction('deactivated', 'activate')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Illegal transitions — isLegalAction returns false
// ---------------------------------------------------------------------------

describe('isLegalAction — illegal cells (✗)', () => {
  it('pending_review → materialize is illegal', () => {
    expect(isLegalAction('pending_review', 'materialize')).toBe(false);
  });

  it('pending_review → activate is illegal', () => {
    expect(isLegalAction('pending_review', 'activate')).toBe(false);
  });

  it('needs_more_evidence → approve is illegal', () => {
    expect(isLegalAction('needs_more_evidence', 'approve')).toBe(false);
  });

  it('needs_more_evidence → materialize is illegal', () => {
    expect(isLegalAction('needs_more_evidence', 'materialize')).toBe(false);
  });

  it('needs_more_evidence → activate is illegal', () => {
    expect(isLegalAction('needs_more_evidence', 'activate')).toBe(false);
  });

  it('needs_more_evidence → promote is illegal', () => {
    expect(isLegalAction('needs_more_evidence', 'promote')).toBe(false);
  });

  it('needs_more_evidence → evolve is illegal', () => {
    expect(isLegalAction('needs_more_evidence', 'evolve')).toBe(false);
  });

  it('approved → dismiss is illegal', () => {
    expect(isLegalAction('approved', 'dismiss')).toBe(false);
  });

  it('approved → approve is illegal', () => {
    expect(isLegalAction('approved', 'approve')).toBe(false);
  });

  it('approved → activate is illegal', () => {
    expect(isLegalAction('approved', 'activate')).toBe(false);
  });

  it('materialized → dismiss is illegal', () => {
    expect(isLegalAction('materialized', 'dismiss')).toBe(false);
  });

  it('materialized → approve is illegal', () => {
    expect(isLegalAction('materialized', 'approve')).toBe(false);
  });

  it('activated → dismiss is illegal', () => {
    expect(isLegalAction('activated', 'dismiss')).toBe(false);
  });

  it('activated → approve is illegal', () => {
    expect(isLegalAction('activated', 'approve')).toBe(false);
  });

  it('activated → activate is illegal', () => {
    expect(isLegalAction('activated', 'activate')).toBe(false);
  });

  it('dismissed → dismiss is illegal (terminal)', () => {
    expect(isLegalAction('dismissed', 'dismiss')).toBe(false);
  });

  it('dismissed → approve is illegal (terminal)', () => {
    expect(isLegalAction('dismissed', 'approve')).toBe(false);
  });

  it('superseded → approve is illegal (terminal)', () => {
    expect(isLegalAction('superseded', 'approve')).toBe(false);
  });

  it('superseded → materialize is illegal (terminal)', () => {
    expect(isLegalAction('superseded', 'materialize')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyTransition — status-changing actions
// ---------------------------------------------------------------------------

describe('applyTransition — successful transitions', () => {
  it('pending_review + dismiss → dismissed', () => {
    expect(applyTransition('pending_review', 'dismiss')).toBe('dismissed');
  });

  it('pending_review + approve → approved', () => {
    expect(applyTransition('pending_review', 'approve')).toBe('approved');
  });

  it('needs_more_evidence + dismiss → dismissed', () => {
    expect(applyTransition('needs_more_evidence', 'dismiss')).toBe('dismissed');
  });

  it('approved + materialize → materialized', () => {
    expect(applyTransition('approved', 'materialize')).toBe('materialized');
  });

  it('materialized + activate → activated', () => {
    expect(applyTransition('materialized', 'activate')).toBe('activated');
  });

  it('deactivated + materialize → materialized', () => {
    expect(applyTransition('deactivated', 'materialize')).toBe('materialized');
  });

  it('deactivated + activate → activated', () => {
    expect(applyTransition('deactivated', 'activate')).toBe('activated');
  });
});

// ---------------------------------------------------------------------------
// applyTransition — promote/evolve throw (candidate-producing, not transitions)
// ---------------------------------------------------------------------------

describe('applyTransition — promote and evolve throw (not source transitions)', () => {
  it('pending_review + promote throws even though isLegalAction returns true', () => {
    expect(isLegalAction('pending_review', 'promote')).toBe(true);
    expect(() => applyTransition('pending_review', 'promote')).toThrow();
  });

  it('pending_review + evolve throws even though isLegalAction returns true', () => {
    expect(isLegalAction('pending_review', 'evolve')).toBe(true);
    expect(() => applyTransition('pending_review', 'evolve')).toThrow();
  });

  it('approved + promote throws even though isLegalAction returns true', () => {
    expect(isLegalAction('approved', 'promote')).toBe(true);
    expect(() => applyTransition('approved', 'promote')).toThrow();
  });

  it('approved + evolve throws with descriptive message', () => {
    const err = (() => {
      try {
        applyTransition('approved', 'evolve');
      } catch (e) {
        return e;
      }
    })();
    expect(err.message).toMatch(/evolve|candidate-producing/i);
  });
});

// ---------------------------------------------------------------------------
// applyTransition — illegal transitions throw with descriptive error
// ---------------------------------------------------------------------------

describe('applyTransition — throws for illegal transitions', () => {
  it('needs_more_evidence + approve throws with descriptive error', () => {
    expect(() => applyTransition('needs_more_evidence', 'approve')).toThrow(
      /illegal.*transition|cannot.*approve|action.*not.*allowed/i,
    );
  });

  it('approved + dismiss throws', () => {
    expect(() => applyTransition('approved', 'dismiss')).toThrow();
  });

  it('materialized + dismiss throws', () => {
    expect(() => applyTransition('materialized', 'dismiss')).toThrow();
  });

  it('activated + activate throws', () => {
    expect(() => applyTransition('activated', 'activate')).toThrow();
  });

  it('dismissed + dismiss throws (terminal)', () => {
    expect(() => applyTransition('dismissed', 'dismiss')).toThrow();
  });

  it('superseded + materialize throws (terminal)', () => {
    expect(() => applyTransition('superseded', 'materialize')).toThrow();
  });

  it('throw message includes current status and action', () => {
    let msg = '';
    try {
      applyTransition('activated', 'dismiss');
    } catch (e) {
      msg = e.message;
    }
    expect(msg).toMatch(/activated/);
    expect(msg).toMatch(/dismiss/);
  });
});

// ---------------------------------------------------------------------------
// LC-1..LC-6 — deactivate matrix extension (Slice G)
// ---------------------------------------------------------------------------

describe('LC-1: LIFECYCLE_ACTION.DEACTIVATE constant', () => {
  it('LIFECYCLE_ACTION.DEACTIVATE equals "deactivate"', () => {
    expect(LIFECYCLE_ACTION.DEACTIVATE).toBe('deactivate');
  });
});

describe('LC-2 / LC-3 / LC-4: deactivate legal only from activated', () => {
  it('LC-2: isLegalAction("activated", "deactivate") === true', () => {
    expect(isLegalAction('activated', 'deactivate')).toBe(true);
  });

  it('LC-3: isLegalAction("deactivated", "deactivate") === false', () => {
    expect(isLegalAction('deactivated', 'deactivate')).toBe(false);
  });

  it('LC-4: applyTransition("activated", "deactivate") === "deactivated"', () => {
    expect(applyTransition('activated', 'deactivate')).toBe('deactivated');
  });
});

describe('LC-5: all other rows reject deactivate', () => {
  const NON_ACTIVATED_STATUSES = [
    'pending_review',
    'needs_more_evidence',
    'approved',
    'materialized',
    'deactivated',
    'dismissed',
    'superseded',
  ];

  for (const status of NON_ACTIVATED_STATUSES) {
    it(`deactivate from "${status}" is illegal`, () => {
      expect(isLegalAction(status, 'deactivate')).toBe(false);
    });
  }
});

describe('LC-6: existing transitions still pass after deactivate extension', () => {
  it('approved + materialize → materialized still valid', () => {
    expect(applyTransition('approved', 'materialize')).toBe('materialized');
  });

  it('materialized + activate → activated still valid', () => {
    expect(applyTransition('materialized', 'activate')).toBe('activated');
  });

  it('pending_review + approve → approved still valid', () => {
    expect(applyTransition('pending_review', 'approve')).toBe('approved');
  });

  it('activated → dismiss is still illegal', () => {
    expect(isLegalAction('activated', 'dismiss')).toBe(false);
  });
});
