/**
 * sdd-rules-invariants.test.js — Cross-rules schema-shape invariants.
 *
 * This test enforces the SCHEMA-RULE CONSTANT SHAPE CONTRACT documented at the
 * top of scripts/lib/sdd-rules.js. Every registered SDD rule constant exposes
 * a "required-fields" array (named `required_fields` or `required_fields_per_row`
 * or any equivalent suffix). Each entry in those arrays MUST satisfy a uniform
 * shape so cross-rules tooling — print-schema, generic validators, lints — can
 * iterate any constant without per-shape branches.
 *
 * If you add a new SDD schema-rule constant, register it in RULE_REGISTRY below.
 * Without registration the cross-rules invariants do not cover it, and a future
 * editor can drift the shape silently.
 *
 * The contract recap (full text in scripts/lib/sdd-rules.js):
 *   CORE      — every entry MUST have a non-empty string `key` and `type`.
 *   EXTENSIONS — when present, must be well-formed:
 *     description: non-empty string
 *     field:       non-empty string (XML wire path, optional)
 *     allowed:     non-empty array of non-empty strings (for type === 'enum')
 *     min_length / max_length: positive integers (for type === 'list')
 */

const {
  SPEC_HEADER_RULES,
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
} = require('../../scripts/lib/sdd-utils');

// -----------------------------------------------------------------------------
// RULE_REGISTRY — single source of truth for which constants the invariants
// cover. Add new schema-rule constants here when introduced. Each entry tells
// the test where to find the required-fields array on the constant (for
// constants whose property is not literally named `required_fields`).
// -----------------------------------------------------------------------------
const RULE_REGISTRY = [
  {
    name: 'SPEC_HEADER_RULES',
    constant: SPEC_HEADER_RULES,
    fieldsProperty: 'required_fields',
  },
  {
    name: 'PENDING_CONFLICT_RULES',
    constant: PENDING_CONFLICT_RULES,
    fieldsProperty: 'required_fields',
  },
  {
    name: 'DECISION_LOG_RULES',
    constant: DECISION_LOG_RULES,
    fieldsProperty: 'required_fields_per_row',
  },
];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isPositiveInteger(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

describe('SDD schema-rule constant shape contract (cross-rules invariants)', () => {
  describe('registry coverage', () => {
    it('every registered constant exists and is an object', () => {
      for (const entry of RULE_REGISTRY) {
        expect(entry.constant).toBeDefined();
        expect(typeof entry.constant).toBe('object');
        expect(entry.constant).not.toBeNull();
      }
    });

    it('every registered constant exposes its declared required-fields property as a non-empty array', () => {
      for (const entry of RULE_REGISTRY) {
        const fields = entry.constant[entry.fieldsProperty];
        expect(Array.isArray(fields)).toBe(true);
        expect(fields.length).toBeGreaterThan(0);
      }
    });
  });

  describe('core contract — every entry has {key, type}', () => {
    for (const entry of RULE_REGISTRY) {
      describe(`${entry.name}.${entry.fieldsProperty}`, () => {
        const fields = entry.constant[entry.fieldsProperty];

        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          const label = `entry[${i}]${isNonEmptyString(f?.key) ? ` (key='${f.key}')` : ''}`;

          it(`${label} has non-empty string key`, () => {
            expect(typeof f).toBe('object');
            expect(f).not.toBeNull();
            expect(isNonEmptyString(f.key)).toBe(true);
          });

          it(`${label} has non-empty string type`, () => {
            expect(isNonEmptyString(f.type)).toBe(true);
          });
        }
      });
    }
  });

  describe('extension contract — when present, extensions are well-formed', () => {
    for (const entry of RULE_REGISTRY) {
      describe(`${entry.name}.${entry.fieldsProperty}`, () => {
        const fields = entry.constant[entry.fieldsProperty];

        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          const label = `entry[${i}]${isNonEmptyString(f?.key) ? ` (key='${f.key}')` : ''}`;

          it(`${label}: description (when present) is non-empty string`, () => {
            if (f.description !== undefined) {
              expect(isNonEmptyString(f.description)).toBe(true);
            }
          });

          it(`${label}: field (when present) is non-empty string`, () => {
            if (f.field !== undefined) {
              expect(isNonEmptyString(f.field)).toBe(true);
            }
          });

          it(`${label}: allowed (when present) is non-empty array of non-empty strings`, () => {
            if (f.allowed !== undefined) {
              expect(Array.isArray(f.allowed)).toBe(true);
              expect(f.allowed.length).toBeGreaterThan(0);
              for (const v of f.allowed) {
                expect(isNonEmptyString(v)).toBe(true);
              }
            }
          });

          it(`${label}: allowed pairs with type === 'enum'`, () => {
            // Soft pairing: if allowed exists, type should be 'enum'. If type is
            // 'enum', allowed should exist. Either direction failing means the
            // rule constant is internally inconsistent.
            if (f.allowed !== undefined) {
              expect(f.type).toBe('enum');
            }
            if (f.type === 'enum') {
              expect(Array.isArray(f.allowed)).toBe(true);
            }
          });

          it(`${label}: min_length (when present) is positive integer`, () => {
            if (f.min_length !== undefined) {
              expect(isPositiveInteger(f.min_length)).toBe(true);
            }
          });

          it(`${label}: max_length (when present) is positive integer`, () => {
            if (f.max_length !== undefined) {
              expect(isPositiveInteger(f.max_length)).toBe(true);
            }
          });

          it(`${label}: min_length <= max_length when both present`, () => {
            if (f.min_length !== undefined && f.max_length !== undefined) {
              expect(f.min_length).toBeLessThanOrEqual(f.max_length);
            }
          });
        }
      });
    }
  });

  describe('cross-rules: keys are unique within each constant', () => {
    for (const entry of RULE_REGISTRY) {
      it(`${entry.name}.${entry.fieldsProperty} has no duplicate keys`, () => {
        const fields = entry.constant[entry.fieldsProperty];
        const keys = fields.map((f) => f.key);
        const unique = new Set(keys);
        expect(unique.size).toBe(keys.length);
      });
    }
  });

  describe('cross-rules: deep-frozen (no entry can mutate after import)', () => {
    for (const entry of RULE_REGISTRY) {
      it(`${entry.name}.${entry.fieldsProperty} array is frozen`, () => {
        expect(Object.isFrozen(entry.constant[entry.fieldsProperty])).toBe(true);
      });

      it(`${entry.name}.${entry.fieldsProperty} entries are frozen`, () => {
        for (const f of entry.constant[entry.fieldsProperty]) {
          expect(Object.isFrozen(f)).toBe(true);
        }
      });
    }
  });
});
