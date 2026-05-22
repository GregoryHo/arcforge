// tests/scripts/learning-curator-schema.test.js

const {
  validateCandidateV1,
  REJECTION_CODES,
  VALIDATOR_VERSION,
  MIN_EVIDENCE_REFS,
  MAX_EVIDENCE_REFS,
} = require('../../scripts/lib/learning-curator/schema');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvidence(overrides = {}) {
  return {
    evidence_id: 'ev_abc123',
    evidence_type: 'observation',
    relevance: 'User repeatedly used grep before editing files',
    summary: 'Observed grep-first pattern 5 times across 3 sessions',
    ...overrides,
  };
}

function makeRecord(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'cand_instinct_20260521T010000Z_a1b2c3d4e5f6',
    created_at: '2026-05-21T01:00:00.000Z',
    updated_at: '2026-05-21T01:00:00.000Z',
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'arcforge', project_id: 'proj_abc' },
    source: { source_type: 'layer4_llm_curator' },
    name: 'grep before editing',
    summary: 'Always grep for existing patterns before making edits',
    rationale: 'Prevents duplicate code and missed context',
    domain: 'workflow',
    body: 'When editing files, first grep for existing patterns to avoid duplication',
    body_source: 'llm_curator',
    evidence: [makeEvidence(), makeEvidence({ evidence_id: 'ev_def456' })],
    evidence_quality: 'medium',
    evidence_quality_metadata: {
      rule_version: 'v1',
      basis: {
        project_obs_count: 500,
        cited_evidence_count: 1,
        cited_evidence_by_type: {
          observation: 1,
          diary: 0,
          reflect: 0,
          recall: 0,
          session_summary: 0,
        },
        has_user_correction: false,
        has_manual_recall: false,
        has_reflect_pattern: false,
        has_error_repair_sequence: false,
      },
    },
    lifecycle: {
      status: 'pending_review',
      status_changed_at: '2026-05-21T01:00:00.000Z',
    },
    safety: {
      validator_version: 'v1',
      sanitizer_policy_version: 'v1',
      sanitizer_module: 'scripts/lib/sanitize-observation.js',
      raw_prompt_included: false,
      raw_response_included: false,
      raw_hook_payloads_included: false,
      raw_transcripts_included: false,
      edit_bodies_included: false,
      skill_args_included: false,
      secret_scan: { status: 'passed', rule_version: 'v1' },
      activation_claim_scan: { status: 'passed' },
      file_write_claim_scan: { status: 'passed' },
    },
    dedupe: {
      dedupe_key: 'project:proj_abc:instinct:grep-before-editing',
      dedupe_basis: {
        scope_kind: 'project',
        project_id: 'proj_abc',
        artifact_type: 'instinct',
        normalized_name: 'grep-before-editing',
        normalized_body_hash: 'abc123def456',
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Positive tests — valid records pass
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — valid records (positive)', () => {
  it('accepts a minimal valid instinct record', () => {
    const result = validateCandidateV1(makeRecord());
    expect(result.ok).toBe(true);
  });

  it('accepts artifact_type skill', () => {
    const r = makeRecord({ artifact_type: 'skill' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts artifact_type command', () => {
    const r = makeRecord({ artifact_type: 'command' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts artifact_type agent', () => {
    const r = makeRecord({ artifact_type: 'agent' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts artifact_type claude_md_addition', () => {
    const r = makeRecord({ artifact_type: 'claude_md_addition' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts scope.kind global (no project fields)', () => {
    const r = makeRecord({ scope: { kind: 'global' } });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts scope.kind project with project + project_id', () => {
    const r = makeRecord({ scope: { kind: 'project', project: 'myproj', project_id: 'p_123' } });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts body_source manual_recall', () => {
    const r = makeRecord({ body_source: 'manual_recall' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts body_source reflect', () => {
    const r = makeRecord({ body_source: 'reflect' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts body_source dashboard_evolve', () => {
    const r = makeRecord({ body_source: 'dashboard_evolve' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts optional trigger field', () => {
    const r = makeRecord({ trigger: 'when editing files' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts optional relationships field', () => {
    const r = makeRecord({ relationships: { promoted_from_candidate_id: 'cand_instinct_abc' } });
    expect(validateCandidateV1(r).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Evidence quality boundary tests
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — evidence_quality boundaries', () => {
  function makeWithObsCount(count, quality) {
    const m = makeRecord({
      evidence_quality: quality,
      evidence_quality_metadata: {
        rule_version: 'v1',
        basis: {
          project_obs_count: count,
          cited_evidence_count: 1,
          cited_evidence_by_type: {
            observation: 1,
            diary: 0,
            reflect: 0,
            recall: 0,
            session_summary: 0,
          },
          has_user_correction: false,
          has_manual_recall: false,
          has_reflect_pattern: false,
          has_error_repair_sequence: false,
        },
      },
    });
    return m;
  }

  it('project_obs_count >= 1000 → evidence_quality must be high', () => {
    expect(validateCandidateV1(makeWithObsCount(1000, 'high')).ok).toBe(true);
  });

  it('project_obs_count = 999 → evidence_quality must be medium', () => {
    expect(validateCandidateV1(makeWithObsCount(999, 'medium')).ok).toBe(true);
  });

  it('project_obs_count = 100 → evidence_quality must be medium', () => {
    expect(validateCandidateV1(makeWithObsCount(100, 'medium')).ok).toBe(true);
  });

  it('project_obs_count = 99 → evidence_quality must be low', () => {
    expect(validateCandidateV1(makeWithObsCount(99, 'low')).ok).toBe(true);
  });

  it('project_obs_count = 0 → evidence_quality must be low', () => {
    expect(validateCandidateV1(makeWithObsCount(0, 'low')).ok).toBe(true);
  });

  it('project_obs_count = 1000 with wrong quality "medium" → fails', () => {
    const r = makeWithObsCount(1000, 'medium');
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.field_path?.includes('evidence_quality'))).toBe(true);
  });

  it('project_obs_count = 50 with wrong quality "high" → fails', () => {
    const r = makeWithObsCount(50, 'high');
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
  });

  it('project_obs_count = 500 with wrong quality "high" → fails', () => {
    const r = makeWithObsCount(500, 'high');
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Negative — required field missing
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — required field missing', () => {
  const requiredFields = [
    'schema_version',
    'candidate_id',
    'created_at',
    'updated_at',
    'artifact_type',
    'scope',
    'source',
    'name',
    'summary',
    'rationale',
    'domain',
    'body',
    'body_source',
    'evidence',
    'evidence_quality',
    'evidence_quality_metadata',
    'lifecycle',
    'safety',
    'dedupe',
  ];

  for (const field of requiredFields) {
    it(`fails when "${field}" is missing`, () => {
      const r = makeRecord();
      delete r[field];
      const res = validateCandidateV1(r);
      expect(res.ok).toBe(false);
      expect(res.reasons.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Negative — enum violations
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — enum violations', () => {
  it('rejects unknown artifact_type', () => {
    const r = makeRecord({ artifact_type: 'bot' });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'artifact_type_not_allowed')).toBe(true);
  });

  it('rejects unknown body_source', () => {
    const r = makeRecord({ body_source: 'llm_draft' });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
  });

  it('rejects unknown domain', () => {
    const r = makeRecord({ domain: 'unknown_domain_xyz' });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
  });

  it('rejects unknown lifecycle status', () => {
    const r = makeRecord({
      lifecycle: { status: 'in_review', status_changed_at: '2026-05-21T00:00:00.000Z' },
    });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
  });

  it('rejects unknown scope.kind', () => {
    const r = makeRecord({ scope: { kind: 'team' } });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'scope_not_allowed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion #1 — artifact_type_not_allowed (PR-E Drift #2a)
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — artifact_type_not_allowed', () => {
  it('accepts valid artifact_type "instinct"', () => {
    const r = makeRecord({ artifact_type: 'instinct' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts valid artifact_type "skill"', () => {
    const r = makeRecord({ artifact_type: 'skill' });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects bad artifact_type with code artifact_type_not_allowed, NOT schema_invalid', () => {
    const r = makeRecord({ artifact_type: 'fake_type' });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    const codes = res.reasons.map((r) => r.code);
    expect(codes).toContain('artifact_type_not_allowed');
    expect(codes).not.toContain('schema_invalid');
  });
});

// ---------------------------------------------------------------------------
// Criterion #2 — scope_not_allowed (PR-E Drift #2b)
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — scope_not_allowed', () => {
  it('accepts scope.kind "project"', () => {
    const r = makeRecord({ scope: { kind: 'project', project: 'myproj', project_id: 'p_123' } });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts scope.kind "global"', () => {
    const r = makeRecord({ scope: { kind: 'global' } });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects bad scope.kind with code scope_not_allowed, NOT schema_invalid', () => {
    const r = makeRecord({ scope: { kind: 'invalid' } });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    const codes = res.reasons.map((r) => r.code);
    expect(codes).toContain('scope_not_allowed');
    expect(codes).not.toContain('schema_invalid');
  });
});

// ---------------------------------------------------------------------------
// Criterion #3 — too_few_evidence_refs + too_many_evidence_refs (PR-E Drift #2d/e)
// ---------------------------------------------------------------------------

describe('MIN_EVIDENCE_REFS / MAX_EVIDENCE_REFS constants', () => {
  it('MIN_EVIDENCE_REFS is exported and equals 2', () => {
    expect(MIN_EVIDENCE_REFS).toBe(2);
  });

  it('MAX_EVIDENCE_REFS is exported and equals 5', () => {
    expect(MAX_EVIDENCE_REFS).toBe(5);
  });
});

describe('validateCandidateV1 — evidence count enforcement', () => {
  function makeEvidenceArray(n) {
    return Array.from({ length: n }, (_, i) => makeEvidence({ evidence_id: `ev_test_${i}` }));
  }

  it('accepts exactly 2 evidence refs (MIN)', () => {
    const r = makeRecord({ evidence: makeEvidenceArray(2) });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('accepts exactly 5 evidence refs (MAX)', () => {
    const r = makeRecord({ evidence: makeEvidenceArray(5) });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects 1 evidence ref with code too_few_evidence_refs', () => {
    const r = makeRecord({ evidence: makeEvidenceArray(1) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    const codes = res.reasons.map((r) => r.code);
    expect(codes).toContain('too_few_evidence_refs');
    const reason = res.reasons.find((r) => r.code === 'too_few_evidence_refs');
    expect(reason.field_path).toBe('evidence');
  });

  it('rejects 6 evidence refs with code too_many_evidence_refs', () => {
    const r = makeRecord({ evidence: makeEvidenceArray(6) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    const codes = res.reasons.map((r) => r.code);
    expect(codes).toContain('too_many_evidence_refs');
    const reason = res.reasons.find((r) => r.code === 'too_many_evidence_refs');
    expect(reason.field_path).toBe('evidence');
  });
});

// ---------------------------------------------------------------------------
// Negative — field length limits
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — field length limits', () => {
  it('rejects name > 120 chars', () => {
    const r = makeRecord({ name: 'x'.repeat(121) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'field_too_long')).toBe(true);
  });

  it('accepts name = 120 chars', () => {
    const r = makeRecord({ name: 'x'.repeat(120) });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects summary > 600 chars', () => {
    const r = makeRecord({ summary: 'x'.repeat(601) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'field_too_long')).toBe(true);
  });

  it('accepts summary = 600 chars', () => {
    const r = makeRecord({ summary: 'x'.repeat(600) });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects rationale > 2000 chars', () => {
    const r = makeRecord({ rationale: 'x'.repeat(2001) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'field_too_long')).toBe(true);
  });

  it('accepts rationale = 2000 chars', () => {
    const r = makeRecord({ rationale: 'x'.repeat(2000) });
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects trigger > 600 chars', () => {
    const r = makeRecord({ trigger: 'x'.repeat(601) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'field_too_long')).toBe(true);
  });

  it('rejects body > 6000 chars', () => {
    const r = makeRecord({ body: 'x'.repeat(6001) });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'field_too_long')).toBe(true);
  });

  it('accepts body = 6000 chars', () => {
    const r = makeRecord({ body: 'x'.repeat(6000) });
    expect(validateCandidateV1(r).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative — safety rule violations
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — safety rule violations', () => {
  it('rejects when raw_prompt_included is true', () => {
    const r = makeRecord();
    r.safety.raw_prompt_included = true;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'unsafe_content')).toBe(true);
  });

  it('rejects when raw_response_included is true', () => {
    const r = makeRecord();
    r.safety.raw_response_included = true;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'unsafe_content')).toBe(true);
  });

  it('rejects when secret_scan status is rejected', () => {
    const r = makeRecord();
    r.safety.secret_scan = { status: 'rejected', rule_version: 'v1' };
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'secret_reconstruction')).toBe(true);
  });

  it('rejects when activation_claim_scan status is rejected', () => {
    const r = makeRecord();
    r.safety.activation_claim_scan = { status: 'rejected' };
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'activation_claim')).toBe(true);
  });

  it('rejects when file_write_claim_scan status is rejected', () => {
    const r = makeRecord();
    r.safety.file_write_claim_scan = { status: 'rejected' };
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'file_write_claim')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative — promoted_from_* must NOT appear on scope (PR #31 reconcile 1.3)
// ---------------------------------------------------------------------------

describe('validateCandidateV1 — scope must not contain promoted_from fields', () => {
  it('rejects scope with promoted_from_candidate_id on scope object', () => {
    const r = makeRecord({
      scope: {
        kind: 'global',
        promoted_from_candidate_id: 'cand_instinct_abc',
      },
    });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'schema_invalid')).toBe(true);
  });

  it('rejects scope with promoted_from_project_id on scope object', () => {
    const r = makeRecord({
      scope: {
        kind: 'global',
        promoted_from_project_id: 'proj_xyz',
      },
    });
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rejection codes coverage
// ---------------------------------------------------------------------------

describe('REJECTION_CODES — canonical code union', () => {
  it('includes evidence_ref_omitted_upstream (PR #31 reconcile 1.4)', () => {
    expect(REJECTION_CODES).toContain('evidence_ref_omitted_upstream');
  });

  it('includes the canonical Layer 5 spec union', () => {
    // From docs/plans/references/learning-curator-schema/layer-5-candidate-queue-lifecycle.md
    // CandidateRejectionReason.code
    const canonicalUnion = [
      'schema_invalid',
      'artifact_type_not_allowed',
      'scope_not_allowed',
      'missing_required_field',
      'field_too_long',
      'evidence_ref_missing',
      'evidence_ref_omitted_upstream',
      'evidence_type_mismatch',
      'too_few_evidence_refs',
      'too_many_evidence_refs',
      'unsafe_content',
      'secret_reconstruction',
      'activation_claim',
      'file_write_claim',
      'duplicate_candidate',
      'source_manifest_missing',
      'source_hash_mismatch',
      'policy_violation',
    ];
    for (const code of canonicalUnion) {
      expect(REJECTION_CODES).toContain(code);
    }
  });
});

describe('validateCandidateV1 — rejection reason codes', () => {
  it('emits missing_required_field when name is missing', () => {
    const r = makeRecord();
    delete r.name;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === 'missing_required_field')).toBe(true);
  });

  it('emits field_too_long when name exceeds limit', () => {
    const r = makeRecord({ name: 'x'.repeat(200) });
    const res = validateCandidateV1(r);
    expect(res.reasons.some((r) => r.code === 'field_too_long')).toBe(true);
  });

  it('emits artifact_type_not_allowed for unknown artifact_type', () => {
    const r = makeRecord({ artifact_type: 'unknown' });
    const res = validateCandidateV1(r);
    expect(res.reasons.some((r) => r.code === 'artifact_type_not_allowed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion #1 — Full safety metadata required (PR-B Layer 5 Blocker #1)
// ---------------------------------------------------------------------------

describe('VALIDATOR_VERSION export', () => {
  it('VALIDATOR_VERSION is exported as a non-empty string', () => {
    expect(typeof VALIDATOR_VERSION).toBe('string');
    expect(VALIDATOR_VERSION.length).toBeGreaterThan(0);
  });

  it('VALIDATOR_VERSION equals "v1"', () => {
    expect(VALIDATOR_VERSION).toBe('v1');
  });
});

describe('validateCandidateV1 — full safety metadata required', () => {
  it('accepts a record with all required safety fields present', () => {
    const r = makeRecord();
    expect(validateCandidateV1(r).ok).toBe(true);
  });

  it('rejects when safety.validator_version is missing', () => {
    const r = makeRecord();
    delete r.safety.validator_version;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.field_path === 'safety.validator_version')).toBe(true);
  });

  it('rejects when safety.sanitizer_policy_version is missing', () => {
    const r = makeRecord();
    delete r.safety.sanitizer_policy_version;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.field_path === 'safety.sanitizer_policy_version')).toBe(true);
  });

  it('rejects when safety.sanitizer_module is missing', () => {
    const r = makeRecord();
    delete r.safety.sanitizer_module;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.field_path === 'safety.sanitizer_module')).toBe(true);
  });

  it('rejects when safety.secret_scan is missing', () => {
    const r = makeRecord();
    delete r.safety.secret_scan;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.field_path === 'safety.secret_scan')).toBe(true);
  });

  it('rejects when safety.activation_claim_scan is missing', () => {
    const r = makeRecord();
    delete r.safety.activation_claim_scan;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.field_path === 'safety.activation_claim_scan')).toBe(true);
  });

  it('rejects when safety.file_write_claim_scan is missing', () => {
    const r = makeRecord();
    delete r.safety.file_write_claim_scan;
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.field_path === 'safety.file_write_claim_scan')).toBe(true);
  });

  it('rejects when safety.secret_scan.status is not "passed"', () => {
    const r = makeRecord();
    r.safety.secret_scan = { status: 'rejected', rule_version: 'v1' };
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.code === 'secret_reconstruction')).toBe(true);
  });

  it('rejects when safety.activation_claim_scan.status is not "passed"', () => {
    const r = makeRecord();
    r.safety.activation_claim_scan = { status: 'rejected' };
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.code === 'activation_claim')).toBe(true);
  });

  it('rejects when safety.file_write_claim_scan.status is not "passed"', () => {
    const r = makeRecord();
    r.safety.file_write_claim_scan = { status: 'rejected' };
    const res = validateCandidateV1(r);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((x) => x.code === 'file_write_claim')).toBe(true);
  });
});
