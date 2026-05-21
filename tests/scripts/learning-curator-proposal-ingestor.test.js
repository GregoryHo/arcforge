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

function makeResponseFile(payload) {
  const responseDir = path.join(tmpDir, '.arcforge', 'learning', 'responses');
  fs.mkdirSync(responseDir, { recursive: true });
  const responsePath = path.join(responseDir, `response-${Date.now()}.json`);
  fs.writeFileSync(responsePath, JSON.stringify(payload, null, 2), 'utf8');
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
    const responseDir = path.join(tmpDir, '.arcforge', 'learning', 'responses');
    fs.mkdirSync(responseDir, { recursive: true });
    const responsePath = path.join(responseDir, 'garbage.json');
    fs.writeFileSync(responsePath, 'this is not json {{{', 'utf8');

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
