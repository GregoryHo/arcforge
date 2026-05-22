// tests/scripts/learning-curator-proposal-ingestor.test.js
//
// Slice E.2 — Layer 4→5 ingest-proposal bridge tests.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// HOME isolation (same pattern as learning-curator-queue-writer.test.js)
// ---------------------------------------------------------------------------

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-ingest-test-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});

// ---------------------------------------------------------------------------
// Fresh module getters (called after jest.resetModules())
// ---------------------------------------------------------------------------

function getIngestor() {
  return require('../../scripts/lib/learning-curator/proposal-ingestor');
}

function getQueueWriter() {
  return require('../../scripts/lib/learning-curator/queue-writer');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBatchManifest(overrides = {}) {
  const batchId = `batch_20260521T010000Z_a1b2c3d4e5f6`;
  const manifestDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-batches');
  fs.mkdirSync(manifestDir, { recursive: true });

  const manifest = {
    schema_version: 1,
    batch_id: batchId,
    created_at: '2026-05-21T01:00:00.000Z',
    batch_hash: 'a1b2c3d4e5f6',
    scope: { kind: 'project', project: 'test-project', project_id: 'proj_abc123456789ab' },
    selection_policy: {
      policy_version: 'v1',
      max_observations: 200,
      max_diaries: 5,
      max_reflections: 0,
      max_recalls: 0,
      max_transcript_summaries: 0,
      ordering: 'chronological',
      selection_rules: ['recent'],
      deterministic: true,
    },
    source_windows: {
      observations: {
        store: 'observations.jsonl',
        records_scanned: 5,
        records_selected: 5,
        records_omitted: 0,
      },
    },
    quality_inputs: {
      project_observation_count: 5,
      selected_evidence_count: 5,
      selected_by_type: { observation: 5, diary: 0, reflect: 0, recall: 0, session_summary: 0 },
      session_span: { session_count: 1 },
      signal_mix: {
        has_user_correction: false,
        has_manual_recall: false,
        has_reflect_pattern: false,
        has_error_repair_sequence: false,
        has_repeated_observation_sequence: false,
      },
    },
    limits: {
      max_items: 200,
      max_chars_total: 100000,
      max_chars_per_item: 1000,
      truncation_applied: false,
    },
    omissions: [],
    safety: {
      llm_visible: true,
      raw_hook_payloads_included: false,
      raw_transcripts_included: false,
      raw_response_bodies_included: false,
      edit_bodies_included: false,
      skill_args_included: false,
      quarantine_sources_included: false,
      sanitizer_policy_version: 'v1',
    },
    handed_to_layer4: false,
    snapshot_saved: false,
    evidence_ids: ['ev_001', 'ev_002', 'ev_003'],
    ...overrides,
  };

  const manifestPath = path.join(manifestDir, `${batchId}.manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { manifest, manifestPath, batchId };
}

function makeValidProposalPayload(batchId, batchHash) {
  return {
    schema_version: 1,
    source: {
      layer: 4,
      curator: 'llm',
      run_id: `curator_run_20260521T010000Z_f9e8d7c6b5a4`,
      created_at: '2026-05-21T01:00:00.000Z',
      batch_id: batchId,
      batch_hash: batchHash,
      prompt_policy_version: 'v1',
      output_schema_version: 1,
    },
    proposals: [
      {
        proposal_index: 0,
        artifact_type: 'instinct',
        proposed_scope: { kind: 'project', project_id: 'proj_abc123456789ab' },
        name: 'grep-before-edit',
        summary: 'Always use grep to confirm patterns before making edits.',
        rationale: 'Observed 5 times across 3 sessions where grep prevented bad edits.',
        domain: 'workflow',
        body: 'When asked to modify code, first use Grep to find all occurrences of the pattern, then proceed with targeted edits.',
        body_source: 'llm_curator',
        evidence_refs: [
          {
            evidence_id: 'ev_001',
            evidence_type: 'observation',
            relevance: 'grep usage pattern observed',
          },
          {
            evidence_id: 'ev_002',
            evidence_type: 'observation',
            relevance: 'edit followed grep pattern',
          },
        ],
        llm_confidence: 'medium',
        risk_notes: [],
        uncertainty_notes: [],
        recommended_review_action: 'review',
      },
    ],
  };
}

// Wrap a CandidateProposalPayload in the claude --output-format json envelope
// the daemon writes to the response file. Slice E.2b switched to structured
// output; the model can no longer wrap in markdown because the CLI enforces
// the schema via --json-schema and exposes the result under structured_output.
function makeCliEnvelope(payload, overrides = {}) {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    api_error_status: null,
    duration_ms: 32000,
    result: 'analysis complete',
    structured_output: payload,
    ...overrides,
  };
}

function makeResponseFile(payload, envelopeOverrides) {
  const responseDir = path.join(tmpDir, '.arcforge', 'learning', 'responses');
  fs.mkdirSync(responseDir, { recursive: true });
  const responsePath = path.join(responseDir, `response-${Date.now()}.json`);
  const envelope = makeCliEnvelope(payload, envelopeOverrides);
  fs.writeFileSync(responsePath, JSON.stringify(envelope, null, 2), 'utf8');
  return responsePath;
}

function writeRawResponseFile(rawContents) {
  const responseDir = path.join(tmpDir, '.arcforge', 'learning', 'responses');
  fs.mkdirSync(responseDir, { recursive: true });
  const responsePath = path.join(responseDir, `response-${Date.now()}.json`);
  fs.writeFileSync(responsePath, rawContents, 'utf8');
  return responsePath;
}

function readCurrentCandidates() {
  return getQueueWriter().readCurrentCandidates();
}

function readRejections() {
  const rejectionsPath = path.join(
    tmpDir,
    '.arcforge',
    'learning',
    'candidates',
    'rejections.jsonl',
  );
  if (!fs.existsSync(rejectionsPath)) return [];
  return fs
    .readFileSync(rejectionsPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Test: valid path — candidate appears in queue
// ---------------------------------------------------------------------------

describe('ingestProposal — valid path', () => {
  test('valid proposal payload produces candidate in queue.jsonl', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();
    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    const responsePath = makeResponseFile(payload);

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('parsed');
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.run_id).toMatch(/^curator_run_/);

    // Candidate must appear in queue
    const candidates = readCurrentCandidates();
    const vals = Object.values(candidates);
    expect(vals.length).toBe(1);
    expect(vals[0].artifact_type).toBe('instinct');
    expect(vals[0].name).toBe('grep-before-edit');
    expect(vals[0].lifecycle.status).toBe('pending_review');
    expect(vals[0].candidate_id).toMatch(/^cand_instinct_/);
  });

  test('CuratorRunManifest is persisted for valid run', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();
    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    const responsePath = makeResponseFile(payload);

    const result = ingestProposal({ batchId, responseFile: responsePath });

    const runsDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-runs');
    const runManifestPath = path.join(runsDir, `${result.run_id}.manifest.json`);
    expect(fs.existsSync(runManifestPath)).toBe(true);

    const runManifest = JSON.parse(fs.readFileSync(runManifestPath, 'utf8'));
    expect(runManifest.schema_version).toBe(1);
    expect(runManifest.run_id).toBe(result.run_id);
    expect(runManifest.source_batch_id).toBe(batchId);
    expect(runManifest.parse_status).toBe('parsed');
    expect(runManifest.handed_to_layer5).toBe(true);
    expect(runManifest.raw_prompt_saved).toBe(false);
    expect(runManifest.raw_response_saved).toBe(false);
    expect(runManifest.invocation.tool_access).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test: malformed JSON
// ---------------------------------------------------------------------------

describe('ingestProposal — malformed JSON', () => {
  test('garbage response text produces parse_status malformed_json, no queue change', () => {
    const { ingestProposal } = getIngestor();
    const { batchId } = makeBatchManifest();
    const responsePath = writeRawResponseFile('this is not json {{{');

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('malformed_json');
    expect(result.accepted).toBe(0);

    // No candidate in queue
    const candidates = readCurrentCandidates();
    expect(Object.keys(candidates).length).toBe(0);

    // Run manifest must still be persisted
    const runsDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-runs');
    const runManifestPath = path.join(runsDir, `${result.run_id}.manifest.json`);
    expect(fs.existsSync(runManifestPath)).toBe(true);
    const runManifest = JSON.parse(fs.readFileSync(runManifestPath, 'utf8'));
    expect(runManifest.parse_status).toBe('malformed_json');
    expect(runManifest.handed_to_layer5).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Slice E.2b — CLI envelope (--output-format json --json-schema)
// ---------------------------------------------------------------------------

describe('ingestProposal — CLI envelope (--output-format json)', () => {
  test('envelope with is_error:true produces transport_error', () => {
    const { ingestProposal } = getIngestor();
    const { batchId } = makeBatchManifest();
    const responsePath = writeRawResponseFile(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: true,
        api_error_status: { code: 'rate_limit_exceeded' },
      }),
    );

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('transport_error');
    expect(result.accepted).toBe(0);

    const runsDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-runs');
    const runManifestPath = path.join(runsDir, `${result.run_id}.manifest.json`);
    const runManifest = JSON.parse(fs.readFileSync(runManifestPath, 'utf8'));
    expect(runManifest.parse_status).toBe('transport_error');
  });

  test('envelope missing structured_output produces malformed_json with detail', () => {
    const { ingestProposal } = getIngestor();
    const { batchId } = makeBatchManifest();
    const responsePath = writeRawResponseFile(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'analysis complete but no structured output emitted',
        // no structured_output field at all
      }),
    );

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('malformed_json');

    const runsDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-runs');
    const runManifestPath = path.join(runsDir, `${result.run_id}.manifest.json`);
    const runManifest = JSON.parse(fs.readFileSync(runManifestPath, 'utf8'));
    expect(runManifest.detail).toMatch(/structured_output/i);
  });

  test('envelope with structured_output:null produces malformed_json', () => {
    const { ingestProposal } = getIngestor();
    const { batchId } = makeBatchManifest();
    const responsePath = writeRawResponseFile(
      JSON.stringify({ type: 'result', is_error: false, structured_output: null }),
    );

    const result = ingestProposal({ batchId, responseFile: responsePath });
    expect(result.parse_status).toBe('malformed_json');
  });

  test('envelope with subtype:error produces transport_error', () => {
    const { ingestProposal } = getIngestor();
    const { batchId } = makeBatchManifest();
    const responsePath = writeRawResponseFile(
      JSON.stringify({ type: 'result', subtype: 'error', is_error: false }),
    );

    const result = ingestProposal({ batchId, responseFile: responsePath });
    expect(result.parse_status).toBe('transport_error');
  });
});

// ---------------------------------------------------------------------------
// Test: missing evidence_id in batch
// ---------------------------------------------------------------------------

describe('ingestProposal — evidence_ref_missing', () => {
  test('proposal citing evidence_id not in batch is rejected with evidence_ref_missing', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();
    // batch has ev_001, ev_002, ev_003 — cite a non-existent one
    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    payload.proposals[0].evidence_refs = [
      { evidence_id: 'ev_NONEXISTENT', evidence_type: 'observation', relevance: 'does not exist' },
    ];
    const responsePath = makeResponseFile(payload);

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('parsed');
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);

    // Rejection record must exist
    const rejections = readRejections();
    expect(rejections.length).toBe(1);
    const rejReasons = rejections[0].reasons || [];
    const hasEvidenceRefMissing = rejReasons.some((r) => r.code === 'evidence_ref_missing');
    expect(hasEvidenceRefMissing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: empty proposals array
// ---------------------------------------------------------------------------

describe('ingestProposal — empty proposals', () => {
  test('proposals:[] produces parse_status empty, no queue change', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();
    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    payload.proposals = [];
    const responsePath = makeResponseFile(payload);

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('empty');
    expect(result.accepted).toBe(0);

    const candidates = readCurrentCandidates();
    expect(Object.keys(candidates).length).toBe(0);

    // Run manifest persisted
    const runsDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-runs');
    const runManifestPath = path.join(runsDir, `${result.run_id}.manifest.json`);
    expect(fs.existsSync(runManifestPath)).toBe(true);
    const runManifest = JSON.parse(fs.readFileSync(runManifestPath, 'utf8'));
    expect(runManifest.parse_status).toBe('empty');
  });
});

// ---------------------------------------------------------------------------
// Test: non_object parse_status
// ---------------------------------------------------------------------------

describe('ingestProposal — non_object', () => {
  test('array response produces parse_status non_object, no queue change', () => {
    const { ingestProposal } = getIngestor();
    const { batchId } = makeBatchManifest();
    const responsePath = makeResponseFile([1, 2, 3]);

    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.parse_status).toBe('non_object');
    expect(result.accepted).toBe(0);

    const candidates = readCurrentCandidates();
    expect(Object.keys(candidates).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test: missing batch manifest is a hard error
// ---------------------------------------------------------------------------

describe('ingestProposal — missing batch manifest', () => {
  test('throws when batch manifest does not exist for given batch_id', () => {
    const { ingestProposal } = getIngestor();
    // Do NOT call makeBatchManifest — no manifest on disk
    const responsePath = makeResponseFile({ proposals: [] });

    expect(() =>
      ingestProposal({ batchId: 'batch_nonexistent_000000000000', responseFile: responsePath }),
    ).toThrow(/batch manifest not found/i);
  });
});

// Criterion #2 — evidence_ref_omitted_upstream (PR-B Layer 5 Blocker #2)
// ---------------------------------------------------------------------------

describe('ingestProposal — evidence_ref_omitted_upstream', () => {
  test('rejects proposal when evidence_id is in batch but has evidence_status != present', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest({
      evidence_ids: ['ev_001', 'ev_002', 'ev_omitted'],
      evidence_status_by_id: {
        ev_001: 'present',
        ev_002: 'present',
        ev_omitted: 'omitted_sanitizer_policy',
      },
    });

    const payload = {
      schema_version: 1,
      source: {
        layer: 4,
        curator: 'llm',
        run_id: 'curator_run_20260521T010000Z_testomit01',
        created_at: '2026-05-21T01:00:00.000Z',
        batch_id: batchId,
        batch_hash: manifest.batch_hash,
        prompt_policy_version: 'v1',
        output_schema_version: 1,
      },
      proposals: [
        {
          proposal_index: 0,
          artifact_type: 'instinct',
          proposed_scope: { kind: 'project', project_id: 'proj_abc123456789ab' },
          name: 'grep-before-edit',
          summary: 'Always use grep before editing.',
          rationale: 'Observed pattern.',
          domain: 'workflow',
          body: 'Use grep first.',
          body_source: 'llm_curator',
          evidence_refs: [
            {
              evidence_id: 'ev_001',
              evidence_type: 'observation',
              relevance: 'direct',
            },
            {
              evidence_id: 'ev_omitted',
              evidence_type: 'observation',
              relevance: 'indirect',
            },
          ],
          llm_confidence: 'medium',
          risk_notes: [],
          uncertainty_notes: [],
          recommended_review_action: 'review',
        },
      ],
    };

    const responsePath = makeResponseFile(payload);
    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBeGreaterThanOrEqual(1);

    const rejections = readRejections();
    expect(rejections.length).toBeGreaterThanOrEqual(1);
    const rejection = rejections[0];
    expect(rejection.reasons.some((r) => r.code === 'evidence_ref_omitted_upstream')).toBe(true);
    const omitReason = rejection.reasons.find((r) => r.code === 'evidence_ref_omitted_upstream');
    expect(omitReason.detail).toMatch(/ev_omitted/);
    expect(omitReason.detail).toMatch(/omitted_sanitizer_policy/);
  });

  test('accepts proposal when all evidence_ids have evidence_status "present"', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest({
      evidence_ids: ['ev_001', 'ev_002'],
      evidence_status_by_id: {
        ev_001: 'present',
        ev_002: 'present',
      },
    });

    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    const responsePath = makeResponseFile(payload);
    const result = ingestProposal({ batchId, responseFile: responsePath });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Criterion 4: canonical dedupe_basis + superseded lifecycle
// ---------------------------------------------------------------------------

describe('ingestProposal — dedupe: second candidate with same body superseded (criterion 4)', () => {
  test('two proposals with same normalized_body_hash: second gets lifecycle_status superseded', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();

    // First proposal
    const payload1 = makeValidProposalPayload(batchId, manifest.batch_hash);
    payload1.proposals[0].name = 'grep-before-edit';
    payload1.proposals[0].body =
      'When editing files, first grep for existing patterns to avoid duplication';
    const responsePath1 = makeResponseFile(payload1);
    ingestProposal({ batchId, responseFile: responsePath1 });

    // Second proposal with SAME body (and same artifact_type + project scope)
    // Must be a different response file to avoid idempotency short-circuit
    const payload2 = makeValidProposalPayload(batchId, manifest.batch_hash);
    payload2.proposals[0].name = 'grep-before-edit-v2'; // different name
    payload2.proposals[0].body =
      'When editing files, first grep for existing patterns to avoid duplication'; // SAME body
    const responsePath2 = makeResponseFile(payload2);
    ingestProposal({ batchId, responseFile: responsePath2 });

    // Both candidates should appear in queue
    const candidates = readCurrentCandidates();
    const vals = Object.values(candidates);
    expect(vals.length).toBe(2);

    // One must be pending_review, the other superseded
    const statuses = vals.map((c) => c.lifecycle.status);
    expect(statuses).toContain('pending_review');
    expect(statuses).toContain('superseded');

    // The superseded one must have dedupe.duplicate_of pointing to the first
    const superseded = vals.find((c) => c.lifecycle.status === 'superseded');
    expect(superseded).toBeDefined();
    expect(typeof superseded.dedupe.duplicate_of).toBe('string');
    expect(superseded.dedupe.duplicate_of.length).toBeGreaterThan(0);
  });

  test('canonical dedupe_basis shape on accepted candidate', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();
    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    const responsePath = makeResponseFile(payload);

    ingestProposal({ batchId, responseFile: responsePath });

    const candidates = readCurrentCandidates();
    const candidate = Object.values(candidates)[0];
    const basis = candidate.dedupe.dedupe_basis;

    expect(basis).toBeDefined();
    expect(['project', 'global']).toContain(basis.scope_kind);
    expect(typeof basis.artifact_type).toBe('string');
    expect(typeof basis.normalized_name).toBe('string');
    expect(typeof basis.normalized_body_hash).toBe('string');
    expect(basis.normalized_body_hash.length).toBeGreaterThan(0);

    // dedupe_key must be sha256[:12] of canonical JSON of basis
    expect(candidate.dedupe.dedupe_key).toMatch(/^[a-f0-9]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5: rule_version namespace split
// evidence_quality_metadata.rule_version and safety.sanitizer_policy_version
// must be different strings on a single candidate record.
// ---------------------------------------------------------------------------

describe('ingestProposal — rule_version namespace split (criterion 5)', () => {
  test('evidence_quality_metadata.rule_version differs from safety.sanitizer_policy_version', () => {
    const { ingestProposal } = getIngestor();
    const { manifest, batchId } = makeBatchManifest();
    const payload = makeValidProposalPayload(batchId, manifest.batch_hash);
    const responsePath = makeResponseFile(payload);

    ingestProposal({ batchId, responseFile: responsePath });

    const candidates = readCurrentCandidates();
    const vals = Object.values(candidates);
    expect(vals.length).toBe(1);

    const candidate = vals[0];
    const eqmRuleVersion = candidate.evidence_quality_metadata.rule_version;
    const sanitizerVersion = candidate.safety.sanitizer_policy_version;

    // Both fields must be present
    expect(typeof eqmRuleVersion).toBe('string');
    expect(typeof sanitizerVersion).toBe('string');

    // They must be DIFFERENT (two independent namespaces)
    expect(eqmRuleVersion).not.toBe(sanitizerVersion);

    // evidence_quality_metadata.rule_version must be the formula version
    expect(eqmRuleVersion).toBe('v1-project_obs_count');
  });
});
