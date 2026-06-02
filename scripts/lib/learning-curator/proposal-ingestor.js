/**
 * proposal-ingestor.js — Layer 4 → Layer 5 bridge.
 *
 * Reads the LLM JSON output (CandidateProposalPayload), validates each proposal,
 * enriches it into a full CandidateQueueRecord, and hands off to Layer 5 via
 * queue-writer.js.
 *
 * Exports:
 *   ingestProposal({ batchId, responseFile, homeDir? })
 *     → { run_id, parse_status, accepted, rejected }
 *
 * Per Layer 4 spec (layer-4-llm-curator-analysis.md):
 * - CuratorRunManifest persisted for every attempted run (even failures)
 * - raw_prompt_saved: false, raw_response_saved: false (default off)
 * - parse_status (open enum of run outcomes):
 *     "parsed" | "empty" | "malformed_json" | "non_object" |
 *     "transport_error" | "source_hash_mismatch" | "source_manifest_missing"
 *
 * Idempotency: run_id is derived deterministically from (batch_id, response_hash,
 * prompt_policy_version). If the same run_id manifest already exists, the prior
 * result is returned without re-processing.
 *
 * PR #31 reconcile 1.9: sanitizer runs on body + evidence before queue append
 * (this happens inside appendCandidate in queue-writer.js; no double-sanitize here).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { appendCandidate, rejectProposal, readCurrentCandidates } = require('./queue-writer');
const {
  computeEvidenceQuality,
  VALIDATOR_VERSION,
  EVIDENCE_QUALITY_RULE_VERSION,
} = require('./schema');
const { isLegalInsertionStatus, LIFECYCLE_STATUS } = require('./lifecycle');
const { SANITIZER_POLICY_VERSION } = require('../sanitize-observation');
const { atomicWriteFile, sha256Truncated } = require('../utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMPT_POLICY_VERSION = 'v1';
const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getArcforgeDir(homeDir) {
  return path.join(homeDir, '.arcforge');
}

function getBatchesDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'learning', 'curator-batches');
}

function getRunsDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'learning', 'curator-runs');
}

// ---------------------------------------------------------------------------
// Compact UTC timestamp for IDs
// ---------------------------------------------------------------------------

function compactUtc(dt) {
  return dt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

// ---------------------------------------------------------------------------
// Load batch manifest
// ---------------------------------------------------------------------------

function loadBatchManifest(batchId, homeDir) {
  const manifestPath = path.join(getBatchesDir(homeDir), `${batchId}.manifest.json`);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persist CuratorRunManifest
// ---------------------------------------------------------------------------

function persistRunManifest(runManifest, homeDir) {
  const runsDir = getRunsDir(homeDir);
  fs.mkdirSync(runsDir, { recursive: true });
  const runManifestPath = path.join(runsDir, `${runManifest.run_id}.manifest.json`);
  // Atomic: write to sibling tmp, then rename. Prevents truncated manifest on crash.
  atomicWriteFile(runManifestPath, JSON.stringify(runManifest, null, 2));
  return runManifestPath;
}

// ---------------------------------------------------------------------------
// Build CandidateQueueRecord from a proposal draft
// ---------------------------------------------------------------------------

function buildCandidateRecord(proposal, batchManifest, now) {
  const nowIso = now.toISOString();
  const ts = compactUtc(now);

  // Generate deterministic candidate_id from artifact_type + name + scope + batch
  const candidateHashInput = `${proposal.artifact_type}|${proposal.name}|${JSON.stringify(proposal.proposed_scope)}|${batchManifest.batch_id}|${proposal.proposal_index}`;
  const candidateHash = sha256Truncated(candidateHashInput, 12);
  const candidateId = `cand_${proposal.artifact_type}_${ts}_${candidateHash}`;

  // Derive project info from scope + batch manifest
  const scope = {
    kind: 'project',
    project: batchManifest.scope.project,
    project_id: proposal.proposed_scope.project_id || batchManifest.scope.project_id,
  };

  // Map evidence_refs to full evidence entries with summary field
  // Layer 5 schema requires evidence[i].summary — derive from batch manifest evidence_ids
  // For first slice, we look up matching evidence items from the batch manifest if available,
  // or use the relevance field as a fallback summary.
  const evidence = (proposal.evidence_refs || []).map((ref) => ({
    evidence_id: ref.evidence_id,
    evidence_type: ref.evidence_type,
    relevance: ref.relevance || '',
    summary: ref.relevance || `Evidence from batch ${batchManifest.batch_id}`,
  }));

  // Compute evidence_quality using v1 formula (project_obs_count only)
  const projectObsCount = batchManifest.quality_inputs
    ? batchManifest.quality_inputs.project_observation_count || 0
    : 0;
  const evidenceQuality = computeEvidenceQuality(projectObsCount);

  const record = {
    schema_version: SCHEMA_VERSION,
    candidate_id: candidateId,
    created_at: nowIso,
    updated_at: nowIso,
    artifact_type: proposal.artifact_type,
    scope,
    source: {
      source_type: 'layer4_llm_curator',
      batch_id: batchManifest.batch_id,
      batch_hash: batchManifest.batch_hash,
      run_id: `curator_run_${ts}_${sha256Truncated(batchManifest.batch_id + batchManifest.batch_hash, 12)}`,
      prompt_policy_version: PROMPT_POLICY_VERSION,
    },
    name: proposal.name || '',
    summary: proposal.summary || '',
    rationale: proposal.rationale || '',
    domain: proposal.domain || 'workflow',
    body: proposal.body || '',
    body_source: proposal.body_source || 'llm_curator',
    trigger: proposal.trigger,
    evidence,
    evidence_quality: evidenceQuality,
    evidence_quality_metadata: {
      rule_version: EVIDENCE_QUALITY_RULE_VERSION,
      basis: {
        project_obs_count: projectObsCount,
      },
    },
    lifecycle: {
      status: 'pending_review',
      status_changed_at: nowIso,
    },
    safety: {
      validator_version: VALIDATOR_VERSION,
      sanitizer_policy_version: SANITIZER_POLICY_VERSION,
      sanitizer_module: 'scripts/lib/sanitize-observation.js',
      raw_prompt_included: false,
      raw_response_included: false,
      raw_hook_payloads_included: false,
      raw_transcripts_included: false,
      edit_bodies_included: false,
      skill_args_included: false,
      secret_scan: { status: 'passed', rule_version: SANITIZER_POLICY_VERSION },
      activation_claim_scan: { status: 'passed' },
      file_write_claim_scan: { status: 'passed' },
    },
  };

  // Compute canonical dedupe_basis per Layer 5 spec (layer-5-candidate-queue-lifecycle.md)
  const normalizedName = (proposal.name || '').toLowerCase().replace(/\s+/g, '-');
  const normalizedTrigger =
    typeof proposal.trigger === 'string' ? proposal.trigger.toLowerCase().trim() : undefined;
  const normalizedBodyHash = sha256Truncated(proposal.body || '', 12);

  const dedupeBasis = {
    scope_kind: scope.kind,
    artifact_type: proposal.artifact_type,
    normalized_name: normalizedName,
    normalized_body_hash: normalizedBodyHash,
  };
  if (scope.kind === 'project' && scope.project_id) {
    dedupeBasis.project_id = scope.project_id;
  }
  if (normalizedTrigger !== undefined) {
    dedupeBasis.normalized_trigger = normalizedTrigger;
  }

  const dedupeKey = sha256Truncated(JSON.stringify(dedupeBasis), 12);

  record.dedupe = {
    dedupe_key: dedupeKey,
    dedupe_basis: dedupeBasis,
  };

  return record;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ingest a Layer 4 LLM response into Layer 5 candidate queue.
 *
 * @param {object} options
 * @param {string} options.batchId — batch_id used for this run
 * @param {string} options.responseFile — path to the LLM JSON response file
 * @param {string} [options.homeDir] — override home directory (tests)
 * @param {number} [options.durationMs] — elapsed time for run manifest
 * @returns {{ run_id, parse_status, accepted, rejected }}
 */
function ingestProposal({ batchId, responseFile, homeDir: homeOverride, durationMs } = {}) {
  if (typeof batchId !== 'string' || !batchId.trim()) {
    throw new Error('ingestProposal: batchId must be a non-empty string');
  }
  if (typeof responseFile !== 'string' || !responseFile.trim()) {
    throw new Error('ingestProposal: responseFile must be a non-empty string');
  }
  if (!fs.existsSync(responseFile)) {
    throw new Error(`ingestProposal: responseFile does not exist: ${responseFile}`);
  }

  const homeDir = homeOverride || os.homedir();
  const now = new Date();
  const createdAt = now.toISOString();
  const ts = compactUtc(now);

  // Load response file
  let rawResponse;
  try {
    rawResponse = fs.readFileSync(responseFile, 'utf8');
  } catch (err) {
    throw new Error(`ingestProposal: failed to read responseFile: ${err.message}`);
  }

  const responseHash = sha256Truncated(rawResponse, 12);

  // Compute run_id deterministically: (batch_id, response_hash, prompt_policy_version)
  const runIdHash = sha256Truncated(`${batchId}|${responseHash}|${PROMPT_POLICY_VERSION}`, 12);
  const runId = `curator_run_${ts}_${runIdHash}`;

  // Idempotency check: if manifest already exists, return prior result.
  // Uses persisted accepted_count / rejected_count so the count is audit-stable
  // (a re-submitted response yields the same (accepted, rejected) tuple — not
  // proposal_count, which would over-report on retries that originally had
  // rejections).
  const runsDir = getRunsDir(homeDir);
  const existingManifestPath = path.join(runsDir, `${runId}.manifest.json`);
  if (fs.existsSync(existingManifestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingManifestPath, 'utf8'));
      return {
        run_id: existing.run_id,
        parse_status: existing.parse_status,
        accepted: existing.accepted_count ?? 0,
        rejected: existing.rejected_count ?? 0,
      };
    } catch {
      // fallthrough — re-process (corrupt manifest)
    }
  }

  // Load batch manifest (needed for evidence_id validation and project context).
  // Per Layer 5 spec L244, a missing manifest is a rejection (not a hard throw):
  // the run_id is derivable from the response hash, so we can still write an audit record.
  const batchManifest = loadBatchManifest(batchId, homeDir);
  if (!batchManifest) {
    const detail = `batch manifest not found for batch_id "${batchId}" — run assemble-batch first`;
    const source = { source_type: 'layer4_llm_curator', batch_id: batchId };
    rejectProposal([{ code: 'source_manifest_missing', detail }], source);
    return { run_id: null, parse_status: 'source_manifest_missing', accepted: 0, rejected: 1 };
  }
  const validEvidenceIds = new Set(
    Array.isArray(batchManifest.evidence_ids) ? batchManifest.evidence_ids : [],
  );
  const evidenceStatusById = batchManifest.evidence_status_by_id || {};
  const evidenceTypeById = batchManifest.evidence_type_by_id || {};

  // Base run manifest fields
  const runManifest = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    created_at: createdAt,
    source_batch_id: batchId,
    source_batch_hash: batchManifest.batch_hash,
    prompt_policy_version: PROMPT_POLICY_VERSION,
    output_schema_version: 1,
    model: null,
    provider: null,
    invocation: {
      tool_access: false,
      duration_ms: durationMs || null,
      transport_status: 'completed',
    },
    parse_status: 'parsed',
    proposal_count: 0,
    accepted_count: 0,
    rejected_count: 0,
    handed_to_layer5: false,
    prompt_hash: null,
    response_hash: responseHash,
    raw_prompt_saved: false,
    raw_response_saved: false,
  };

  // Parse response. Daemon uses `claude --output-format json --json-schema ...`
  // so rawResponse is a CLI envelope; the actual CandidateProposalPayload lives
  // under .structured_output. (Pre-Slice-E.2b ingestors expected the raw payload
  // at the top level — that path is removed since the daemon never emits it now.)
  let envelope;
  try {
    envelope = JSON.parse(rawResponse);
  } catch {
    runManifest.parse_status = 'malformed_json';
    runManifest.detail = 'envelope JSON parse failed';
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'malformed_json', accepted: 0, rejected: 0 };
  }

  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    runManifest.parse_status = 'non_object';
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'non_object', accepted: 0, rejected: 0 };
  }

  // CLI envelope error signal — model timeout, API error, schema-validation reject.
  if (envelope.is_error === true || envelope.subtype === 'error') {
    runManifest.parse_status = 'transport_error';
    runManifest.detail = envelope.api_error_status || envelope.subtype || 'cli reported error';
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'transport_error', accepted: 0, rejected: 0 };
  }

  const payload = envelope.structured_output;
  if (payload === undefined || payload === null) {
    runManifest.parse_status = 'malformed_json';
    runManifest.detail = 'envelope missing structured_output field';
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'malformed_json', accepted: 0, rejected: 0 };
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    runManifest.parse_status = 'non_object';
    runManifest.detail = 'structured_output is not an object';
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'non_object', accepted: 0, rejected: 0 };
  }

  // Check proposals array
  const proposals = payload.proposals;
  if (!Array.isArray(proposals) || proposals.length === 0) {
    runManifest.parse_status = 'empty';
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'empty', accepted: 0, rejected: 0 };
  }

  // Verify batch_hash in payload matches loaded manifest — detects stale or misrouted responses.
  // Ordered after the empty-proposals guard because an empty payload is inert (no record reaches
  // the queue) regardless of hash; the hash check is only material when there's something to admit.
  const payloadBatchHash = payload.source?.batch_hash;
  if (payloadBatchHash !== undefined && payloadBatchHash !== batchManifest.batch_hash) {
    const source = { source_type: 'layer4_llm_curator', batch_id: batchId };
    rejectProposal(
      [
        {
          code: 'source_hash_mismatch',
          detail: `expected batch_hash "${batchManifest.batch_hash}", got "${payloadBatchHash}"`,
        },
      ],
      source,
    );
    runManifest.parse_status = 'source_hash_mismatch';
    runManifest.rejected_count = 1;
    persistRunManifest(runManifest, homeDir);
    return { run_id: runId, parse_status: 'source_hash_mismatch', accepted: 0, rejected: 1 };
  }

  runManifest.proposal_count = proposals.length;
  runManifest.handed_to_layer5 = true;

  // Persist a pending manifest BEFORE processing so a mid-loop crash still
  // leaves an audit trail. Final counts are written below after the loop.
  persistRunManifest(runManifest, homeDir);

  // Count queue size ONCE before the loop. Each appendCandidate either appends
  // (accepted) or writes to rejections.jsonl (rejected via validateCandidateV1).
  // We compute total accepted = (queue size after loop) - (queue size before).
  // Avoids the O(N × queue size) full-replay cost of reading the queue per proposal.
  const queuePath = path.join(homeDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl');
  const countQueueLines = () => {
    if (!fs.existsSync(queuePath)) return 0;
    return fs
      .readFileSync(queuePath, 'utf8')
      .split('\n')
      .filter((l) => l.trim()).length;
  };
  const linesBefore = countQueueLines();

  // Build a body-hash → candidate_id index from existing non-terminal candidates
  // for superseded dedupe detection. Read once before the loop.
  const existingByBodyHash = {};
  const NON_TERMINAL_STATUSES = ['pending_review', 'needs_more_evidence'];
  try {
    const existingCandidates = readCurrentCandidates();
    for (const [cid, c] of Object.entries(existingCandidates)) {
      const status = c.lifecycle?.status;
      if (!NON_TERMINAL_STATUSES.includes(status)) continue;
      const bodyHash = c.dedupe?.dedupe_basis?.normalized_body_hash;
      if (bodyHash) {
        existingByBodyHash[bodyHash] = cid;
      }
    }
  } catch {
    // If queue is unreadable, skip dedup check — do not block ingestion
  }

  // Process each proposal. Rejection paths (missing evidence refs, record-build
  // failure) write to rejections.jsonl; appendCandidate writes to queue.jsonl on
  // pass or rejections.jsonl on schema/safety fail. Counts computed from the
  // queue-size diff below — no per-proposal queue read.
  for (const proposal of proposals) {
    const missingRefs = Array.isArray(proposal.evidence_refs)
      ? proposal.evidence_refs.filter(
          (ref) => ref.evidence_id && !validEvidenceIds.has(ref.evidence_id),
        )
      : [];

    if (missingRefs.length > 0) {
      const source = { source_type: 'layer4_llm_curator', batch_id: batchId };
      rejectProposal(
        missingRefs.map((ref) => ({
          code: 'evidence_ref_missing',
          field_path: 'evidence_refs',
          detail: `evidence_id "${ref.evidence_id}" is not present in batch ${batchId}`,
        })),
        source,
      );
      continue;
    }

    // Check for references to evidence that exists in batch but was omitted upstream
    const omittedRefs = Array.isArray(proposal.evidence_refs)
      ? proposal.evidence_refs.filter((ref) => {
          const status = evidenceStatusById[ref.evidence_id];
          return status !== undefined && status !== 'present';
        })
      : [];

    if (omittedRefs.length > 0) {
      const source = { source_type: 'layer4_llm_curator', batch_id: batchId };
      rejectProposal(
        omittedRefs.map((ref) => ({
          code: 'evidence_ref_omitted_upstream',
          field_path: 'evidence_refs',
          detail: `evidence_id "${ref.evidence_id}" was omitted upstream with status "${evidenceStatusById[ref.evidence_id]}"`,
        })),
        source,
      );
      continue;
    }

    // Check for evidence_type mismatches: proposal's claimed type must match batch's actual type
    const typeMismatchReasons = [];
    if (Array.isArray(proposal.evidence_refs)) {
      for (let i = 0; i < proposal.evidence_refs.length; i++) {
        const ref = proposal.evidence_refs[i];
        const actualType = evidenceTypeById[ref.evidence_id];
        if (actualType !== undefined && ref.evidence_type !== actualType) {
          typeMismatchReasons.push({
            code: 'evidence_type_mismatch',
            field_path: `evidence_refs[${i}]`,
            detail: `evidence_id "${ref.evidence_id}" has type "${actualType}" in batch but proposal claims "${ref.evidence_type}"`,
          });
        }
      }
    }
    if (typeMismatchReasons.length > 0) {
      const source = { source_type: 'layer4_llm_curator', batch_id: batchId };
      rejectProposal(typeMismatchReasons, source);
      continue;
    }

    let record;
    try {
      record = buildCandidateRecord(proposal, batchManifest, now);
    } catch (err) {
      const source = { source_type: 'layer4_llm_curator', batch_id: batchId };
      rejectProposal(
        [{ code: 'schema_invalid', detail: `Failed to build candidate record: ${err.message}` }],
        source,
      );
      continue;
    }

    // Semantic dedupe via normalized_body_hash. Per Layer 5 spec line 583, when a
    // duplicate is detected the NEW candidate is created with `superseded` status —
    // this is an insertion-time status assignment, not an action transition through
    // lifecycle.applyTransition. INSERTION_STATUSES gates this contract; any other
    // status reached at insertion time is a bug.
    const bodyHash = record.dedupe?.dedupe_basis?.normalized_body_hash;
    const existingCandidateId = bodyHash ? existingByBodyHash[bodyHash] : undefined;
    if (existingCandidateId) {
      const supersededStatus = LIFECYCLE_STATUS.SUPERSEDED;
      if (!isLegalInsertionStatus(supersededStatus)) {
        throw new Error(`proposal-ingestor: "${supersededStatus}" is not a legal insertion status`);
      }
      record.lifecycle = {
        status: supersededStatus,
        status_changed_at: now.toISOString(),
      };
      record.dedupe = {
        ...record.dedupe,
        duplicate_of: existingCandidateId,
      };
    } else if (bodyHash) {
      existingByBodyHash[bodyHash] = record.candidate_id;
    }

    appendCandidate(record);
  }

  const linesAfter = countQueueLines();
  const accepted = Math.max(0, linesAfter - linesBefore);
  const rejected = proposals.length - accepted;

  runManifest.accepted_count = accepted;
  runManifest.rejected_count = rejected;

  persistRunManifest(runManifest, homeDir);

  return { run_id: runId, parse_status: 'parsed', accepted, rejected };
}

// ---------------------------------------------------------------------------
// recordRunFailure — Layer 4 spec §10: manifest for every attempted run,
// including daemon transport failures (no response file available).
// ---------------------------------------------------------------------------

/**
 * Write a minimal CuratorRunManifest for a daemon-side failure where no
 * response file exists (claude CLI exited non-zero, watchdog killed it, or
 * the CLI binary was missing entirely).
 *
 * Per Layer 4 spec, parse_status for these paths is exactly one of
 * `'transport_error'` or `'timeout'`. "CLI not found" maps to transport_error
 * with the reason carried in `detail`.
 *
 * @param {object} options
 * @param {string} options.batchId
 * @param {string} options.parseStatus — 'transport_error' | 'timeout'
 * @param {string} [options.detail]    — free-text reason
 * @param {string} [options.homeDir]   — override home directory (tests)
 * @returns {{ run_id, parse_status, accepted, rejected }}
 */
function recordRunFailure({ batchId, parseStatus, detail, homeDir: homeOverride } = {}) {
  if (typeof batchId !== 'string' || !batchId.trim()) {
    throw new Error('recordRunFailure: batchId must be a non-empty string');
  }
  if (typeof parseStatus !== 'string' || !parseStatus.trim()) {
    throw new Error('recordRunFailure: parseStatus must be a non-empty string');
  }

  const homeDir = homeOverride || os.homedir();
  const now = new Date();
  const createdAt = now.toISOString();
  const ts = compactUtc(now);

  // Deterministic run_id: sha256 of (batchId + parseStatus), same shape as ingestProposal
  const runIdHash = sha256Truncated(batchId + parseStatus, 12);
  const runId = `curator_run_${ts}_${runIdHash}`;

  const runManifest = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    created_at: createdAt,
    source_batch_id: batchId,
    parse_status: parseStatus,
    detail: detail || null,
    accepted_count: 0,
    rejected_count: 0,
    proposal_count: 0,
    handed_to_layer5: false,
    prompt_hash: null,
    response_hash: null,
    raw_prompt_saved: false,
    raw_response_saved: false,
  };

  persistRunManifest(runManifest, homeDir);

  return { run_id: runId, parse_status: parseStatus, accepted: 0, rejected: 0 };
}

module.exports = { ingestProposal, recordRunFailure };
