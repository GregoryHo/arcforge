/**
 * sdd-contracts.test.js — Cross-cutting contract resolution tests for fr-cc-if-007
 * and fr-cc-if-008.
 *
 * These tests assert that the _pending-conflict.md handoff schema (fr-cc-if-007)
 * and the decision-log schema (fr-cc-if-008) exported from sdd-rules.js satisfy
 * the four acceptance criteria of each requirement. They are intentionally separate
 * from sdd-utils.test.js: the latter tests implementation correctness; this file
 * tests that the implementation satisfies the cross-cutting contracts. Audience:
 * anyone verifying that epic-sdd-schemas' deliverables fulfil the interface
 * contracts between refiner and brainstorming.
 *
 * Drift-check (fr-cc-if-007): before committing, a temporary typo was introduced
 * in PENDING_CONFLICT_RULES.canonical_path ('specs/<spec-id>/_pending-conflicts.md'
 * with a spurious trailing 's') to confirm the ac1 test failed. The typo was
 * reverted and all tests now pass green.
 *
 * Drift-check (fr-cc-if-008): before committing, 'skip' was temporarily removed
 * from DECISION_LOG_RULES.deferral_signal_canonical_phrases to confirm the ac4
 * test (deferral_signal_canonical_phrases contains required phrases) failed with:
 * "Expected the array to contain 'skip'". The mutation was reverted; all tests
 * now pass green.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  parseSpecHeader,
} = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// fr-cc-if-007-ac1 — Location contract
// ---------------------------------------------------------------------------

describe('fr-cc-if-007-ac1: _pending-conflict.md location contract', () => {
  it('canonical_path matches specs/<spec-id>/_pending-conflict.md template', () => {
    expect(PENDING_CONFLICT_RULES.canonical_path).toBe('specs/<spec-id>/_pending-conflict.md');
  });

  it('canonical_path does NOT contain "details/" substring', () => {
    expect(PENDING_CONFLICT_RULES.canonical_path).not.toContain('details/');
  });

  it('canonical_path begins with "specs/" prefix', () => {
    expect(PENDING_CONFLICT_RULES.canonical_path).toMatch(/^specs\//);
  });

  it('canonical_path filename starts with underscore (ephemeral marker)', () => {
    const filename = PENDING_CONFLICT_RULES.canonical_path.split('/').pop();
    expect(filename).toMatch(/^_/);
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-007-ac2 — Required fields contract
// ---------------------------------------------------------------------------

describe('fr-cc-if-007-ac2: required fields enumerate exactly the four contract fields', () => {
  const CONTRACT_FIELDS = new Set([
    'axis_fired',
    'conflict_description',
    'candidate_resolutions',
    'user_action_prompt',
  ]);

  it('required_fields is an array', () => {
    expect(Array.isArray(PENDING_CONFLICT_RULES.required_fields)).toBe(true);
  });

  it('required_fields has exactly 4 entries', () => {
    expect(PENDING_CONFLICT_RULES.required_fields).toHaveLength(4);
  });

  it('required_fields carries exactly the four contract field keys', () => {
    const actualKeys = new Set(PENDING_CONFLICT_RULES.required_fields.map((f) => f.key));
    expect(actualKeys).toEqual(CONTRACT_FIELDS);
  });

  it('axis_fired field has type enum with allowed values [1, 2, 3]', () => {
    const axisRule = PENDING_CONFLICT_RULES.required_fields.find((f) => f.key === 'axis_fired');
    expect(axisRule).toBeDefined();
    expect(axisRule.type).toBe('enum');
    expect(axisRule.allowed).toEqual(expect.arrayContaining(['1', '2', '3']));
    expect(axisRule.allowed).toHaveLength(3);
  });

  it('candidate_resolutions field enforces min_length >= 1', () => {
    const resRule = PENDING_CONFLICT_RULES.required_fields.find(
      (f) => f.key === 'candidate_resolutions',
    );
    expect(resRule).toBeDefined();
    expect(resRule.min_length).toBeGreaterThanOrEqual(1);
  });

  it('candidate_resolutions field enforces max_length <= 3', () => {
    const resRule = PENDING_CONFLICT_RULES.required_fields.find(
      (f) => f.key === 'candidate_resolutions',
    );
    expect(resRule).toBeDefined();
    expect(resRule.max_length).toBeLessThanOrEqual(3);
  });

  it('each required field entry has a key and description', () => {
    for (const rule of PENDING_CONFLICT_RULES.required_fields) {
      expect(typeof rule.key).toBe('string');
      expect(rule.key.length).toBeGreaterThan(0);
      expect(typeof rule.description).toBe('string');
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-007-ac3 — Lifecycle / ephemeral semantics contract
// ---------------------------------------------------------------------------

describe('fr-cc-if-007-ac3: lifecycle encodes ephemeral semantics', () => {
  it('lifecycle object exists', () => {
    expect(PENDING_CONFLICT_RULES.lifecycle).toBeDefined();
    expect(typeof PENDING_CONFLICT_RULES.lifecycle).toBe('object');
  });

  it('deleted_by indicates brainstorming deletes on new-design write', () => {
    // AC3: "brainstorming deletes it on successful new-design write"
    const deletedBy = PENDING_CONFLICT_RULES.lifecycle.deleted_by;
    expect(typeof deletedBy).toBe('string');
    expect(deletedBy.toLowerCase()).toContain('brainstorming');
    expect(deletedBy.toLowerCase()).toMatch(/new.design/);
  });

  it('persist_across_completed_cycle encodes ERROR semantics (fr-sd-012-ac2)', () => {
    // AC3: "MUST NOT persist across a completed conflict cycle"
    // fr-sd-012-ac2 maps this to persist_across_completed_cycle === 'ERROR'
    expect(PENDING_CONFLICT_RULES.lifecycle.persist_across_completed_cycle).toBe('ERROR');
  });

  it('written_by identifies the refiner as producer', () => {
    const writtenBy = PENDING_CONFLICT_RULES.lifecycle.written_by;
    expect(typeof writtenBy).toBe('string');
    expect(writtenBy.toLowerCase()).toContain('refiner');
  });

  it('read_by identifies brainstorming Phase 0 as consumer', () => {
    const readBy = PENDING_CONFLICT_RULES.lifecycle.read_by;
    expect(typeof readBy).toBe('string');
    expect(readBy.toLowerCase()).toContain('brainstorming');
    expect(readBy.toLowerCase()).toContain('phase 0');
  });

  it('state is ephemeral', () => {
    expect(PENDING_CONFLICT_RULES.lifecycle.state).toBe('ephemeral');
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-007-ac4 — Machine-parseability contract
// ---------------------------------------------------------------------------

describe('fr-cc-if-007-ac4: parseConflictMarker operationalizes machine-parseability', () => {
  it('parseConflictMarker is a callable function', () => {
    expect(typeof parseConflictMarker).toBe('function');
  });

  it('parseConflictMarker accepts a single filePath argument (arity >= 1)', () => {
    // Verifies the parser has at least one parameter (a path to parse from).
    expect(parseConflictMarker.length).toBeGreaterThanOrEqual(1);
  });

  it('parseConflictMarker returns null for a non-existent file (safe boundary)', () => {
    // A safe live call that confirms the function behaves according to contract
    // (returns null, does not throw) when the file is absent.
    const result = parseConflictMarker('/non/existent/_pending-conflict.md');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration sanity — fr-cc-if-007 appears in spec.xml delta
// ---------------------------------------------------------------------------

describe('integration: fr-cc-if-007 is referenced in spec-driven-refine spec.xml delta', () => {
  const specXmlPath = path.resolve(__dirname, '../../specs/spec-driven-refine/spec.xml');

  it('spec.xml exists', () => {
    expect(fs.existsSync(specXmlPath)).toBe(true);
  });

  it('parseSpecHeader can parse spec.xml without error', () => {
    const content = fs.readFileSync(specXmlPath, 'utf8');
    const parsed = parseSpecHeader(content);
    expect(parsed).not.toBeNull();
    expect(parsed.spec_id).toBe('spec-driven-refine');
  });

  it('fr-cc-if-007 appears as an added ref in a delta', () => {
    const content = fs.readFileSync(specXmlPath, 'utf8');
    const parsed = parseSpecHeader(content);
    // Flatten all added refs across all deltas.
    const allAddedRefs = parsed.deltas.flatMap((d) => (d.added || []).map((a) => a.ref));
    expect(allAddedRefs).toContain('fr-cc-if-007');
  });

  it('fr-cc-if-007 raw text in spec.xml contains <added ref="fr-cc-if-007" />', () => {
    // Belt-and-suspenders: grep approach from epic note.
    const content = fs.readFileSync(specXmlPath, 'utf8');
    expect(content).toContain('<added ref="fr-cc-if-007" />');
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-008-ac1 — Four required fields per row
// ---------------------------------------------------------------------------

describe('fr-cc-if-008-ac1: each Q&A row carries exactly the four contract fields', () => {
  // Contract enumeration (fr-cc-if-008-ac1): q_id, question,
  // user_answer_verbatim, deferral_signal.
  const CONTRACT_FIELD_NAMES = new Set([
    'q_id',
    'question',
    'user_answer_verbatim',
    'deferral_signal',
  ]);

  it('required_fields_per_row is an array', () => {
    expect(Array.isArray(DECISION_LOG_RULES.required_fields_per_row)).toBe(true);
  });

  it('required_fields_per_row has exactly 4 entries', () => {
    expect(DECISION_LOG_RULES.required_fields_per_row).toHaveLength(4);
  });

  it('required_fields_per_row keys match the contract enumeration exactly', () => {
    // Iterate the constant — do not hardcode; assert the SET matches.
    const actualKeys = new Set(DECISION_LOG_RULES.required_fields_per_row.map((f) => f.key));
    expect(actualKeys).toEqual(CONTRACT_FIELD_NAMES);
  });

  const fieldKeys = () => DECISION_LOG_RULES.required_fields_per_row.map((f) => f.key);

  it('required_fields_per_row contains q_id', () => {
    expect(fieldKeys()).toContain('q_id');
  });

  it('required_fields_per_row contains question', () => {
    expect(fieldKeys()).toContain('question');
  });

  it('required_fields_per_row contains user_answer_verbatim', () => {
    expect(fieldKeys()).toContain('user_answer_verbatim');
  });

  it('required_fields_per_row contains deferral_signal', () => {
    expect(fieldKeys()).toContain('deferral_signal');
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-008-ac2 — Machine-parseable; parser/validator pair exists
// ---------------------------------------------------------------------------

describe('fr-cc-if-008-ac2: parseDecisionLog and validateDecisionLog operationalize machine-parseability', () => {
  it('parseDecisionLog is a callable function', () => {
    expect(typeof parseDecisionLog).toBe('function');
  });

  it('parseDecisionLog accepts at least one argument (filePath)', () => {
    expect(parseDecisionLog.length).toBeGreaterThanOrEqual(1);
  });

  it('parseDecisionLog returns null for a non-existent file (safe boundary)', () => {
    // Confirms the parser behaves per contract (returns null, does not throw)
    // when the file is absent — safe live call.
    const result = parseDecisionLog('/non/existent/decision-log.yaml');
    expect(result).toBeNull();
  });

  it('validateDecisionLog is a callable function', () => {
    expect(typeof validateDecisionLog).toBe('function');
  });

  it('validateDecisionLog accepts at least one argument (parsed array)', () => {
    expect(validateDecisionLog.length).toBeGreaterThanOrEqual(1);
  });

  it('validateDecisionLog returns {valid, issues} for null input (safe boundary)', () => {
    // Confirms the validator returns a structured result for null — does not throw.
    const result = validateDecisionLog(null);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-008-ac3 — q_id addressability
// ---------------------------------------------------------------------------

describe('fr-cc-if-008-ac3: DECISION_LOG_RULES encodes deterministic q_id lookup', () => {
  it('DECISION_LOG_RULES has an addressable_by field', () => {
    expect(DECISION_LOG_RULES).toHaveProperty('addressable_by');
  });

  it('addressable_by is the string "q_id"', () => {
    // fr-sd-013-ac2 / fr-cc-if-008-ac3: rows addressable by q_id for deterministic lookup.
    expect(DECISION_LOG_RULES.addressable_by).toBe('q_id');
  });
});

// ---------------------------------------------------------------------------
// fr-cc-if-008-ac4 — deferral_signal canonical phrases
// ---------------------------------------------------------------------------

describe('fr-cc-if-008-ac4: deferral_signal canonical phrases are frozen and complete', () => {
  it('deferral_signal_canonical_phrases is defined on DECISION_LOG_RULES', () => {
    expect(DECISION_LOG_RULES.deferral_signal_canonical_phrases).toBeDefined();
  });

  it('deferral_signal_canonical_phrases is an array', () => {
    expect(Array.isArray(DECISION_LOG_RULES.deferral_signal_canonical_phrases)).toBe(true);
  });

  it('deferral_signal_canonical_phrases is Object.isFrozen', () => {
    // Deep-frozen: the canonical phrases MUST NOT be mutated at runtime.
    expect(Object.isFrozen(DECISION_LOG_RULES.deferral_signal_canonical_phrases)).toBe(true);
  });

  it('deferral_signal_canonical_phrases contains "use defaults"', () => {
    expect(DECISION_LOG_RULES.deferral_signal_canonical_phrases).toContain('use defaults');
  });

  it('deferral_signal_canonical_phrases contains "covered."', () => {
    expect(DECISION_LOG_RULES.deferral_signal_canonical_phrases).toContain('covered.');
  });

  it('deferral_signal_canonical_phrases contains "skip"', () => {
    expect(DECISION_LOG_RULES.deferral_signal_canonical_phrases).toContain('skip');
  });

  it('deferral_signal_canonical_phrases contains "you decide"', () => {
    expect(DECISION_LOG_RULES.deferral_signal_canonical_phrases).toContain('you decide');
  });

  it('deferral_signal_canonical_phrases has at least 4 entries (spec says "at minimum")', () => {
    expect(DECISION_LOG_RULES.deferral_signal_canonical_phrases.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Integration sanity — fr-cc-if-008 appears in spec.xml delta
// ---------------------------------------------------------------------------

describe('integration: fr-cc-if-008 is referenced in spec-driven-refine spec.xml delta', () => {
  const specXmlPath = path.resolve(__dirname, '../../specs/spec-driven-refine/spec.xml');

  it('spec.xml exists', () => {
    expect(fs.existsSync(specXmlPath)).toBe(true);
  });

  it('fr-cc-if-008 appears as an added ref in a delta', () => {
    const content = fs.readFileSync(specXmlPath, 'utf8');
    const parsed = parseSpecHeader(content);
    // Flatten all added refs across all deltas.
    const allAddedRefs = parsed.deltas.flatMap((d) => (d.added || []).map((a) => a.ref));
    expect(allAddedRefs).toContain('fr-cc-if-008');
  });

  it('fr-cc-if-008 raw text in spec.xml contains <added ref="fr-cc-if-008" />', () => {
    // Belt-and-suspenders: grep approach parallel to fr-cc-if-007 integration test.
    const content = fs.readFileSync(specXmlPath, 'utf8');
    expect(content).toContain('<added ref="fr-cc-if-008" />');
  });
});
