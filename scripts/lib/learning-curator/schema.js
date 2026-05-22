/**
 * schema.js — Layer 5 CandidateQueueRecord validator.
 *
 * Exports: validateCandidateV1(record) → { ok: true } | { ok: false, reasons: CandidateRejectionReason[] }
 *
 * Covers every field defined in the Layer 5 spec (layer-5-candidate-queue-lifecycle.md).
 * PR #31 reconcile patches applied:
 *   - 1.2: body_source enum uses "llm_curator" (not "llm_draft")
 *   - 1.3: promoted_from_* must NOT appear on CandidateScope
 *   - 1.4: evidence_ref_omitted_upstream rejection code
 *   - 1.11: evidence_quality formula pins to project_obs_count only
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALIDATOR_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Allowed enum values
// ---------------------------------------------------------------------------

const ARTIFACT_TYPES = ['instinct', 'skill', 'command', 'agent', 'claude_md_addition'];

const BODY_SOURCES = ['llm_curator', 'manual_recall', 'reflect', 'dashboard_evolve'];

const DOMAINS = [
  'workflow',
  'tool-preference',
  'error-handling',
  'code-style',
  'verification',
  'privacy-safety',
  'other',
];

const LIFECYCLE_STATUSES = [
  'pending_review',
  'needs_more_evidence',
  'dismissed',
  'approved',
  'materialized',
  'activated',
  'deactivated',
  'superseded',
];

const EVIDENCE_TYPES = ['observation', 'session_summary', 'diary', 'reflect', 'recall'];

const SOURCE_TYPES = [
  'layer4_llm_curator',
  'manual_recall',
  'reflect',
  'dashboard_promote',
  'dashboard_evolve',
  'future_import_or_repair',
];

// ---------------------------------------------------------------------------
// First-slice field length limits (layer-5 spec lines ~1136-1141)
// ---------------------------------------------------------------------------

const FIELD_LIMITS = {
  name: 120,
  summary: 600,
  rationale: 2000,
  trigger: 600,
  body: 6000,
};

// ---------------------------------------------------------------------------
// Evidence quality formula (v1) — project_obs_count only
// ---------------------------------------------------------------------------

/**
 * Compute expected evidence_quality from project_obs_count.
 * @param {number} projectObsCount
 * @returns {'high'|'medium'|'low'}
 */
function computeEvidenceQuality(projectObsCount) {
  if (typeof projectObsCount !== 'number' || !Number.isFinite(projectObsCount)) {
    throw new Error(
      `computeEvidenceQuality requires a finite number; got ${typeof projectObsCount}: ${projectObsCount}`,
    );
  }
  if (projectObsCount < 0) {
    throw new Error(`computeEvidenceQuality requires a non-negative count; got ${projectObsCount}`);
  }
  if (projectObsCount >= 1000) return 'high';
  if (projectObsCount >= 100) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Reason builder
// ---------------------------------------------------------------------------

/**
 * @param {string} code
 * @param {string} [fieldPath]
 * @param {string} [detail]
 * @returns {object}
 */
function reason(code, fieldPath, detail) {
  const r = { code };
  if (fieldPath !== undefined) r.field_path = fieldPath;
  if (detail !== undefined) r.detail = String(detail).slice(0, 500);
  return r;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isString(v) {
  return typeof v === 'string';
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isArray(v) {
  return Array.isArray(v);
}

// ---------------------------------------------------------------------------
// validateCandidateV1
// ---------------------------------------------------------------------------

/**
 * Validate a CandidateQueueRecord against the Layer 5 v1 schema.
 *
 * @param {object} record
 * @returns {{ ok: true } | { ok: false, reasons: object[] }}
 */
function validateCandidateV1(record) {
  const reasons = [];

  function add(code, fieldPath, detail) {
    reasons.push(reason(code, fieldPath, detail));
  }

  function requireField(field, parent = null) {
    const obj = parent ? record[parent] : record;
    const path = parent ? `${parent}.${field}` : field;
    if (obj == null || !(field in obj)) {
      add('missing_required_field', path, `Required field "${path}" is missing`);
      return false;
    }
    return true;
  }

  if (!isObject(record)) {
    add('schema_invalid', undefined, 'Record must be a non-null object');
    return { ok: false, reasons };
  }

  // schema_version
  if (!requireField('schema_version')) {
    // continue — collect all errors
  } else if (record.schema_version !== 1) {
    add(
      'schema_invalid',
      'schema_version',
      `Expected schema_version 1, got ${record.schema_version}`,
    );
  }

  // candidate_id
  if (!requireField('candidate_id')) {
    // missing
  } else if (!isNonEmptyString(record.candidate_id)) {
    add('missing_required_field', 'candidate_id', 'candidate_id must be a non-empty string');
  }

  // created_at / updated_at
  for (const f of ['created_at', 'updated_at']) {
    if (!requireField(f)) {
      // missing
    } else if (!isNonEmptyString(record[f])) {
      add('missing_required_field', f, `${f} must be a non-empty string`);
    }
  }

  // artifact_type
  if (!requireField('artifact_type')) {
    // missing
  } else if (!ARTIFACT_TYPES.includes(record.artifact_type)) {
    add(
      'schema_invalid',
      'artifact_type',
      `artifact_type "${record.artifact_type}" is not allowed`,
    );
  }

  // scope
  if (!requireField('scope')) {
    // missing
  } else {
    const scope = record.scope;
    if (!isObject(scope)) {
      add('schema_invalid', 'scope', 'scope must be an object');
    } else {
      if (!['project', 'global'].includes(scope.kind)) {
        add(
          'schema_invalid',
          'scope.kind',
          `scope.kind "${scope.kind}" must be "project" or "global"`,
        );
      }
      // Per PR #31 reconcile 1.3: promoted_from_* must NOT appear on scope
      if ('promoted_from_candidate_id' in scope) {
        add(
          'schema_invalid',
          'scope.promoted_from_candidate_id',
          'promoted_from_candidate_id must live on relationships, not scope (PR #31 reconcile 1.3)',
        );
      }
      if ('promoted_from_project_id' in scope) {
        add(
          'schema_invalid',
          'scope.promoted_from_project_id',
          'promoted_from_project_id must live on relationships, not scope (PR #31 reconcile 1.3)',
        );
      }
      if (scope.kind === 'project') {
        if (!isNonEmptyString(scope.project)) {
          add('missing_required_field', 'scope.project', 'project scope requires scope.project');
        }
        if (!isNonEmptyString(scope.project_id)) {
          add(
            'missing_required_field',
            'scope.project_id',
            'project scope requires scope.project_id',
          );
        }
      }
    }
  }

  // source
  if (!requireField('source')) {
    // missing
  } else {
    const src = record.source;
    if (!isObject(src)) {
      add('schema_invalid', 'source', 'source must be an object');
    } else if (!isNonEmptyString(src.source_type) || !SOURCE_TYPES.includes(src.source_type)) {
      add(
        'schema_invalid',
        'source.source_type',
        `source.source_type "${src.source_type}" is not allowed`,
      );
    }
  }

  // String fields with length limits
  const stringFields = ['name', 'summary', 'rationale', 'body'];
  for (const f of stringFields) {
    if (!requireField(f)) {
      // missing
    } else if (!isString(record[f])) {
      add('missing_required_field', f, `${f} must be a string`);
    } else if (FIELD_LIMITS[f] && record[f].length > FIELD_LIMITS[f]) {
      add(
        'field_too_long',
        f,
        `${f} exceeds ${FIELD_LIMITS[f]} characters (got ${record[f].length})`,
      );
    }
  }

  // trigger (optional, but length-limited if present)
  if ('trigger' in record && record.trigger !== undefined && record.trigger !== null) {
    if (!isString(record.trigger)) {
      add('schema_invalid', 'trigger', 'trigger must be a string');
    } else if (record.trigger.length > FIELD_LIMITS.trigger) {
      add('field_too_long', 'trigger', `trigger exceeds ${FIELD_LIMITS.trigger} characters`);
    }
  }

  // body_source
  if (!requireField('body_source')) {
    // missing
  } else if (!BODY_SOURCES.includes(record.body_source)) {
    add('schema_invalid', 'body_source', `body_source "${record.body_source}" is not allowed`);
  }

  // domain
  if (!requireField('domain')) {
    // missing
  } else if (!DOMAINS.includes(record.domain)) {
    add('schema_invalid', 'domain', `domain "${record.domain}" is not allowed`);
  }

  // evidence
  if (!requireField('evidence')) {
    // missing
  } else if (!isArray(record.evidence)) {
    add('schema_invalid', 'evidence', 'evidence must be an array');
  } else {
    for (let i = 0; i < record.evidence.length; i++) {
      const ev = record.evidence[i];
      if (!isObject(ev)) {
        add('schema_invalid', `evidence[${i}]`, 'Each evidence entry must be an object');
        continue;
      }
      if (!isNonEmptyString(ev.evidence_id)) {
        add('missing_required_field', `evidence[${i}].evidence_id`, 'evidence_id is required');
      }
      if (!isString(ev.evidence_type) || !EVIDENCE_TYPES.includes(ev.evidence_type)) {
        add(
          'schema_invalid',
          `evidence[${i}].evidence_type`,
          `evidence_type "${ev.evidence_type}" is not allowed`,
        );
      }
      if (!isNonEmptyString(ev.relevance)) {
        add('missing_required_field', `evidence[${i}].relevance`, 'relevance is required');
      }
      if (!isNonEmptyString(ev.summary)) {
        add('missing_required_field', `evidence[${i}].summary`, 'summary is required');
      }
    }
  }

  // evidence_quality
  if (!requireField('evidence_quality')) {
    // missing
  } else if (!['high', 'medium', 'low'].includes(record.evidence_quality)) {
    add(
      'schema_invalid',
      'evidence_quality',
      `evidence_quality "${record.evidence_quality}" is not allowed`,
    );
  }

  // evidence_quality_metadata — validate and verify formula consistency
  if (!requireField('evidence_quality_metadata')) {
    // missing
  } else {
    const eqm = record.evidence_quality_metadata;
    if (!isObject(eqm)) {
      add('schema_invalid', 'evidence_quality_metadata', 'must be an object');
    } else {
      if (!isNonEmptyString(eqm.rule_version)) {
        add(
          'missing_required_field',
          'evidence_quality_metadata.rule_version',
          'rule_version required',
        );
      }
      if (!isObject(eqm.basis)) {
        add('missing_required_field', 'evidence_quality_metadata.basis', 'basis required');
      } else {
        if (!isNumber(eqm.basis.project_obs_count)) {
          add(
            'missing_required_field',
            'evidence_quality_metadata.basis.project_obs_count',
            'project_obs_count must be a number',
          );
        } else {
          // Verify formula: evidence_quality must match project_obs_count
          const expectedQuality = computeEvidenceQuality(eqm.basis.project_obs_count);
          if (record.evidence_quality && record.evidence_quality !== expectedQuality) {
            add(
              'schema_invalid',
              'evidence_quality',
              `evidence_quality "${record.evidence_quality}" does not match computed value ` +
                `"${expectedQuality}" for project_obs_count=${eqm.basis.project_obs_count} (v1 formula)`,
            );
          }
        }
      }
    }
  }

  // lifecycle
  if (!requireField('lifecycle')) {
    // missing
  } else {
    const lc = record.lifecycle;
    if (!isObject(lc)) {
      add('schema_invalid', 'lifecycle', 'lifecycle must be an object');
    } else {
      if (!isString(lc.status) || !LIFECYCLE_STATUSES.includes(lc.status)) {
        add(
          'schema_invalid',
          'lifecycle.status',
          `lifecycle.status "${lc.status}" is not a valid status`,
        );
      }
      if (!isNonEmptyString(lc.status_changed_at)) {
        add(
          'missing_required_field',
          'lifecycle.status_changed_at',
          'status_changed_at is required',
        );
      }
    }
  }

  // safety
  if (!requireField('safety')) {
    // missing
  } else {
    const s = record.safety;
    if (!isObject(s)) {
      add('schema_invalid', 'safety', 'safety must be an object');
    } else {
      // Required provenance fields
      if (!isNonEmptyString(s.validator_version)) {
        add('missing_required_field', 'safety.validator_version', 'validator_version is required');
      }
      if (!isNonEmptyString(s.sanitizer_policy_version)) {
        add(
          'missing_required_field',
          'safety.sanitizer_policy_version',
          'sanitizer_policy_version is required',
        );
      }
      if (!isNonEmptyString(s.sanitizer_module)) {
        add('missing_required_field', 'safety.sanitizer_module', 'sanitizer_module is required');
      }
      // Check all raw_*_included must be false
      const rawFlags = [
        'raw_prompt_included',
        'raw_response_included',
        'raw_hook_payloads_included',
        'raw_transcripts_included',
        'edit_bodies_included',
        'skill_args_included',
      ];
      for (const flag of rawFlags) {
        if (flag in s && s[flag] !== false) {
          add('unsafe_content', `safety.${flag}`, `${flag} must be false`);
        }
      }
      // secret_scan — required, status must not be "rejected"
      if (!isObject(s.secret_scan)) {
        add('missing_required_field', 'safety.secret_scan', 'secret_scan is required');
      } else if (s.secret_scan.status === 'rejected') {
        add('secret_reconstruction', 'safety.secret_scan', 'secret_scan.status is "rejected"');
      }
      // activation_claim_scan — required, status must not be "rejected"
      if (!isObject(s.activation_claim_scan)) {
        add(
          'missing_required_field',
          'safety.activation_claim_scan',
          'activation_claim_scan is required',
        );
      } else if (s.activation_claim_scan.status === 'rejected') {
        add(
          'activation_claim',
          'safety.activation_claim_scan',
          'activation_claim_scan.status is "rejected"',
        );
      }
      // file_write_claim_scan — required, status must not be "rejected"
      if (!isObject(s.file_write_claim_scan)) {
        add(
          'missing_required_field',
          'safety.file_write_claim_scan',
          'file_write_claim_scan is required',
        );
      } else if (s.file_write_claim_scan.status === 'rejected') {
        add(
          'file_write_claim',
          'safety.file_write_claim_scan',
          'file_write_claim_scan.status is "rejected"',
        );
      }
    }
  }

  // dedupe
  if (!requireField('dedupe')) {
    // missing
  } else {
    const d = record.dedupe;
    if (!isObject(d)) {
      add('schema_invalid', 'dedupe', 'dedupe must be an object');
    } else {
      if (!isNonEmptyString(d.dedupe_key)) {
        add('missing_required_field', 'dedupe.dedupe_key', 'dedupe_key is required');
      }
      if (!isObject(d.dedupe_basis)) {
        add('missing_required_field', 'dedupe.dedupe_basis', 'dedupe_basis is required');
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Canonical CandidateRejectionReason code union (spec lines 227-245)
// PR #31 reconcile 1.4: evidence_ref_omitted_upstream is part of this union
// ---------------------------------------------------------------------------

// Canonical Layer 5 spec union (layer-5-candidate-queue-lifecycle.md, CandidateRejectionReason.code).
const REJECTION_CODES = Object.freeze([
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
]);

module.exports = {
  validateCandidateV1,
  computeEvidenceQuality,
  REJECTION_CODES,
  VALIDATOR_VERSION,
};
