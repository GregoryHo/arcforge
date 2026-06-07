/**
 * sdd-d6-rules.test.js — Tests for D6 P1 new schema rule constants.
 *
 * T1: VISION_RULES + DECISION_LEDGER_RULES in sdd-rules.js,
 *     re-exported through sdd-utils.js facade.
 */

const { VISION_RULES, DECISION_LEDGER_RULES } = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// T1 — VISION_RULES
// ---------------------------------------------------------------------------

describe('VISION_RULES (T1)', () => {
  it('is exported from sdd-utils', () => {
    expect(VISION_RULES).toBeDefined();
    expect(typeof VISION_RULES).toBe('object');
    expect(VISION_RULES).not.toBeNull();
  });

  it('is deep-frozen at the root', () => {
    expect(Object.isFrozen(VISION_RULES)).toBe(true);
  });

  it('has a product canonical path', () => {
    expect(typeof VISION_RULES.product_canonical_path).toBe('string');
    expect(VISION_RULES.product_canonical_path.length).toBeGreaterThan(0);
  });

  it('has a spec canonical path', () => {
    expect(typeof VISION_RULES.spec_canonical_path).toBe('string');
    expect(VISION_RULES.spec_canonical_path.length).toBeGreaterThan(0);
  });

  it('product path does not match DESIGN_DOC_RULES.path_regex', () => {
    const { DESIGN_DOC_RULES } = require('../../scripts/lib/sdd-utils');
    expect(DESIGN_DOC_RULES.path_regex.test(VISION_RULES.product_canonical_path)).toBe(false);
  });

  it('spec path does not match DESIGN_DOC_RULES.path_regex', () => {
    const { DESIGN_DOC_RULES } = require('../../scripts/lib/sdd-utils');
    expect(DESIGN_DOC_RULES.path_regex.test(VISION_RULES.spec_canonical_path)).toBe(false);
  });

  it('is deeply frozen (Object.isFrozen verifies each nested layer)', () => {
    expect(Object.isFrozen(VISION_RULES)).toBe(true);
    // principle_id_re is a RegExp (not a plain object) — frozen check applies to the
    // outer object only; RegExp instances are not Object.freeze()-able in the same way.
  });
});

// ---------------------------------------------------------------------------
// T1 — DECISION_LEDGER_RULES
// ---------------------------------------------------------------------------

describe('DECISION_LEDGER_RULES (T1)', () => {
  it('is exported from sdd-utils', () => {
    expect(DECISION_LEDGER_RULES).toBeDefined();
    expect(typeof DECISION_LEDGER_RULES).toBe('object');
    expect(DECISION_LEDGER_RULES).not.toBeNull();
  });

  it('is deep-frozen at the root', () => {
    expect(Object.isFrozen(DECISION_LEDGER_RULES)).toBe(true);
  });

  it('has a canonical_path', () => {
    expect(typeof DECISION_LEDGER_RULES.canonical_path).toBe('string');
    expect(DECISION_LEDGER_RULES.canonical_path.length).toBeGreaterThan(0);
  });

  it('has required_fields array (mirrors DECISION_LOG_RULES shape)', () => {
    expect(Array.isArray(DECISION_LEDGER_RULES.required_fields)).toBe(true);
    expect(DECISION_LEDGER_RULES.required_fields.length).toBeGreaterThan(0);
  });

  it('required_fields array is frozen', () => {
    expect(Object.isFrozen(DECISION_LEDGER_RULES.required_fields)).toBe(true);
  });

  it('every required_fields entry is frozen', () => {
    for (const f of DECISION_LEDGER_RULES.required_fields) {
      expect(Object.isFrozen(f)).toBe(true);
    }
  });

  it('every required_fields entry has non-empty key and type', () => {
    for (const f of DECISION_LEDGER_RULES.required_fields) {
      expect(typeof f.key).toBe('string');
      expect(f.key.length).toBeGreaterThan(0);
      expect(typeof f.type).toBe('string');
      expect(f.type.length).toBeGreaterThan(0);
    }
  });

  it('every required_fields entry has a description', () => {
    for (const f of DECISION_LEDGER_RULES.required_fields) {
      expect(typeof f.description).toBe('string');
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it('contains expected ledger fields', () => {
    const keys = DECISION_LEDGER_RULES.required_fields.map((f) => f.key);
    for (const expected of [
      'D-id',
      'date',
      'spec_version',
      'status',
      'decision',
      'why',
      'authorized_values',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('required_fields entries are each frozen (Object.isFrozen)', () => {
    for (const f of DECISION_LEDGER_RULES.required_fields) {
      expect(Object.isFrozen(f)).toBe(true);
    }
  });
});
