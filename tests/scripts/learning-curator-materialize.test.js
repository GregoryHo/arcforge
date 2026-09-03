// tests/scripts/learning-curator-materialize.test.js
//
// Layer 7 materialization — TDD for Slice G.
// Acceptance criteria: L7-1 through L7-14, plus round-trip RT-1 (partial).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { sha256Truncated } = require('../../scripts/lib/utils');

// ---------------------------------------------------------------------------
// Helpers — build a valid approved instinct candidate
// ---------------------------------------------------------------------------

function makeCandidateRecord(overrides = {}) {
  const candidateId =
    overrides.candidate_id || `cand_test_${crypto.randomBytes(4).toString('hex')}`;
  const base = {
    schema_version: 1,
    candidate_id: candidateId,
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'test-project', project_id: 'proj-abc123' },
    source: { source_type: 'layer4_llm_curator' },
    name: 'use-edit-bash-workflow',
    summary: 'Prefer Edit before Bash in the same turn.',
    rationale: 'Observed in 3 sessions. Edit before Bash reduces round-trips.',
    body: 'When editing files, prefer Edit then Bash over Bash-only workflows.',
    body_source: 'llm_curator',
    domain: 'workflow',
    evidence: [
      {
        evidence_id: 'ev-001',
        evidence_type: 'observation',
        relevance: 'Direct observation of Edit → Bash pattern.',
        summary: 'Edit then Bash seen in session A.',
      },
    ],
    evidence_quality: 'low',
    evidence_quality_metadata: {
      rule_version: 'v1',
      basis: { project_obs_count: 5 },
    },
    lifecycle: {
      status: 'approved',
      status_changed_at: '2026-05-21T00:00:00Z',
    },
    safety: {
      raw_prompt_included: false,
      raw_response_included: false,
      raw_hook_payloads_included: false,
      raw_transcripts_included: false,
      edit_bodies_included: false,
      skill_args_included: false,
    },
    dedupe: {
      dedupe_key: 'use-edit-bash-workflow-v1',
      dedupe_basis: { name_hash: 'abc' },
    },
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    ...overrides,
  };
  if (overrides.scope) base.scope = overrides.scope;
  if (overrides.lifecycle) base.lifecycle = overrides.lifecycle;
  return base;
}

// ---------------------------------------------------------------------------
// Module isolation — fresh require + redirected HOME per test
// ---------------------------------------------------------------------------

let tmpDir;
let homedirSpy;
let materialize;
let buildDraftContent;
let getDraftRoot;
let defaultRenderPolicy;
let staleDraftArtifacts;
let isMaterializableName;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-mat-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);

  ({
    materialize,
    buildDraftContent,
    getDraftRoot,
    defaultRenderPolicy,
    staleDraftArtifacts,
    isMaterializableName,
  } = require('../../scripts/lib/learning-curator/materialize'));
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: get the draft root for a given candidate/materialization
function draftRoot(candidateId, materializationId) {
  return path.join(tmpDir, '.arcforge', 'learning', 'drafts', candidateId, materializationId);
}

// Helper: call materialize with sensible defaults
function callMaterialize(candidateOverrides = {}, opts = {}) {
  const candidate = makeCandidateRecord(candidateOverrides);
  return materialize({
    candidate,
    sourceActionId: opts.sourceActionId || 'act_test_001',
    requestedArtifactType: opts.requestedArtifactType || 'instinct',
    reviewerNote: opts.reviewerNote || undefined,
    renderPolicy: opts.renderPolicy || defaultRenderPolicy(),
    arcforgeRoot: opts.arcforgeRoot || path.join(tmpDir, '.arcforge'),
  });
}

// Helper: the materialization directories written for a candidate
function materializationDirs(arcforgeRoot, candidateId) {
  const base = path.join(arcforgeRoot, 'learning', 'drafts', candidateId);
  return fs
    .readdirSync(base)
    .filter((entry) => fs.existsSync(path.join(base, entry, 'materialization.json')));
}

// Helper: the `materialize → materialized` transitions recorded for a candidate
function materializeTransitions(arcforgeRoot, candidateId) {
  const queuePath = path.join(arcforgeRoot, 'learning', 'candidates', 'queue.jsonl');
  if (!fs.existsSync(queuePath)) return [];
  return fs
    .readFileSync(queuePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter(
      (event) =>
        event.event_type === 'candidate.transitioned' &&
        event.candidate_id === candidateId &&
        event.action === 'materialize' &&
        event.next_status === 'materialized',
    );
}

// Manifests are ordered by `created_at`, which has millisecond resolution, so two
// materializations inside one millisecond would tie. Step the clock between them
// to keep "the latest manifest" unambiguous in the assertions below.
function waitForNextMillisecond() {
  const start = Date.now();
  while (Date.now() === start) {
    /* busy-wait */
  }
}

// ---------------------------------------------------------------------------
// L7-1: Reject non-approved candidates
// ---------------------------------------------------------------------------

describe('L7-1: reject non-approved candidates', () => {
  it('rejects pending_review candidate', () => {
    const result = callMaterialize({
      lifecycle: { status: 'pending_review', status_changed_at: 'x' },
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('invalid_lifecycle_status');
  });

  it('rejects materialized candidate', () => {
    const result = callMaterialize({
      lifecycle: { status: 'materialized', status_changed_at: 'x' },
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('invalid_lifecycle_status');
  });

  it('rejects dismissed candidate', () => {
    const result = callMaterialize({ lifecycle: { status: 'dismissed', status_changed_at: 'x' } });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('invalid_lifecycle_status');
  });

  it('does NOT reject approved candidate (baseline)', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
  });

  it('does NOT reject deactivated candidate (re-materialization path)', () => {
    const result = callMaterialize({
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-21T01:00:00Z' },
    });
    expect(result.ok).toBe(true);
    expect(result.record.source_candidate.lifecycle_status_at_materialization).toBe('deactivated');
  });
});

// ---------------------------------------------------------------------------
// L7-2: Reject artifact_type !== 'instinct' in first slice
// ---------------------------------------------------------------------------

describe('L7-2: reject non-instinct artifact types in first slice', () => {
  it('rejects skill artifact type', () => {
    const result = callMaterialize({ artifact_type: 'skill' });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('artifact_type_mismatch');
  });

  it('rejects command artifact type', () => {
    const result = callMaterialize({ artifact_type: 'command' });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('artifact_type_mismatch');
  });

  it('rejects agent artifact type', () => {
    const result = callMaterialize({ artifact_type: 'agent' });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('artifact_type_mismatch');
  });

  it('rejects claude_md_addition in first slice', () => {
    const result = callMaterialize({ artifact_type: 'claude_md_addition' });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('artifact_type_mismatch');
  });
});

// ---------------------------------------------------------------------------
// L7-3: Reject unsafe content (secret scan fails)
// ---------------------------------------------------------------------------

describe('L7-3: reject unsafe content (secret scan)', () => {
  it('rejects candidate with API key in body', () => {
    const result = callMaterialize({
      body: 'Use this token: api_key=sk-realsecret1234567890 for API calls.',
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('unsafe_content');
  });

  it('writes no draft file when unsafe content detected', () => {
    const candidateId = `cand_unsafe_${crypto.randomBytes(4).toString('hex')}`;
    callMaterialize({
      candidate_id: candidateId,
      body: 'password=mysecretpassword123',
    });
    const draftsDir = path.join(tmpDir, '.arcforge', 'learning', 'drafts', candidateId);
    expect(fs.existsSync(draftsDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L7-4: Successful materialization writes draft file at correct path
// ---------------------------------------------------------------------------

describe('L7-4: successful materialization writes draft file', () => {
  it('writes a draft file under <candidate_id>/<materialization_id>/instincts/<name>.md', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);

    const candidateId = result.record.candidate_id;
    const materializationId = result.record.materialization_id;
    const draftDir = draftRoot(candidateId, materializationId);

    const instinctsDir = path.join(draftDir, 'instincts');
    expect(fs.existsSync(instinctsDir)).toBe(true);

    const files = fs.readdirSync(instinctsDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/\.md$/);
  });

  it('draft file path is reported in draftPaths', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    expect(result.draftPaths).toBeDefined();
    expect(result.draftPaths.length).toBeGreaterThan(0);
    expect(result.draftPaths[0]).toMatch(/instincts\/.*\.md$/);
    expect(fs.existsSync(result.draftPaths[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L7-5: Draft file frontmatter includes all DraftArtifactMetadata fields
// ---------------------------------------------------------------------------

describe('L7-5: draft frontmatter includes all required metadata fields', () => {
  it('frontmatter contains required DraftArtifactMetadata fields', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);

    const draftContent = fs.readFileSync(result.draftPaths[0], 'utf8');
    expect(draftContent).toMatch(/schema_version/);
    expect(draftContent).toMatch(/candidate_id/);
    expect(draftContent).toMatch(/materialization_id/);
    expect(draftContent).toMatch(/artifact_type/);
    expect(draftContent).toMatch(/name/);
    expect(draftContent).toMatch(/summary/);
    expect(draftContent).toMatch(/body_source/);
    expect(draftContent).toMatch(/scope/);
    expect(draftContent).toMatch(/evidence_quality/);
    expect(draftContent).toMatch(/generated_at/);
    expect(draftContent).toMatch(/render_policy_version/);
    expect(draftContent).toMatch(/inactive_draft/);
  });

  it('inactive_draft is set to true in frontmatter', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    const draftContent = fs.readFileSync(result.draftPaths[0], 'utf8');
    expect(draftContent).toMatch(/inactive_draft.*true/);
  });
});

// ---------------------------------------------------------------------------
// L7-6: Draft body contains candidate body + inactive warning, excludes raw data
// ---------------------------------------------------------------------------

describe('L7-6: draft body content and exclusions', () => {
  it('draft contains the candidate body text', () => {
    const result = callMaterialize({
      body: 'When editing files, prefer Edit then Bash.',
    });
    expect(result.ok).toBe(true);
    const draftContent = fs.readFileSync(result.draftPaths[0], 'utf8');
    expect(draftContent).toMatch(/When editing files, prefer Edit then Bash/);
  });

  it('draft contains an inactive-draft warning', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    const draftContent = fs.readFileSync(result.draftPaths[0], 'utf8');
    expect(draftContent).toMatch(/INACTIVE.*DRAFT|inactive.*draft|DRAFT.*inactive/i);
  });
});

// ---------------------------------------------------------------------------
// L7-7: materialization.json persisted at correct path
// ---------------------------------------------------------------------------

describe('L7-7: materialization.json persisted after successful write', () => {
  it('writes materialization.json in the materialization root', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);

    const manifestPath = path.join(
      draftRoot(result.record.candidate_id, result.record.materialization_id),
      'materialization.json',
    );
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('materialization.json is valid JSON containing the MaterializationRecord', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);

    const manifestPath = path.join(
      draftRoot(result.record.candidate_id, result.record.materialization_id),
      'materialization.json',
    );
    const record = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(record.materialization_id).toBe(result.record.materialization_id);
    expect(record.candidate_id).toBe(result.record.candidate_id);
    expect(record.schema_version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// L7-8: appendTransitionEvent called after both files are durable
// ---------------------------------------------------------------------------

describe('L7-8: lifecycle event only after durable write', () => {
  it('successful materialize emits a transition event to the queue', () => {
    const candidateId = `cand_evt_${crypto.randomBytes(4).toString('hex')}`;
    // Write a candidate to queue so readCurrentCandidates can verify
    const queueDir = path.join(tmpDir, '.arcforge', 'learning', 'candidates');
    fs.mkdirSync(queueDir, { recursive: true });
    const candidate = makeCandidateRecord({ candidate_id: candidateId });
    fs.writeFileSync(
      path.join(queueDir, 'queue.jsonl'),
      `${JSON.stringify({
        schema_version: 1,
        event_id: 'evt_seed',
        ts: new Date().toISOString(),
        candidate_id: candidateId,
        event_type: 'candidate.created',
        actor: { layer: 5 },
        record: candidate,
      })}\n`,
      'utf8',
    );

    const result = callMaterialize({ candidate_id: candidateId });
    expect(result.ok).toBe(true);

    // Queue should contain a transition event
    const lines = fs
      .readFileSync(path.join(queueDir, 'queue.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const transitionEvent = lines.find(
      (e) => e.event_type === 'candidate.transitioned' && e.candidate_id === candidateId,
    );
    expect(transitionEvent).toBeDefined();
    expect(transitionEvent.next_status).toBe('materialized');
    expect(transitionEvent.action).toBe('materialize');
  });

  it('no lifecycle event emitted when manifest write fails (write guard)', () => {
    // Simulate write failure by making the draft root a file (not a dir)
    const candidateId = `cand_fail_${crypto.randomBytes(4).toString('hex')}`;
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const draftsBase = path.join(arcforgeRoot, 'learning', 'drafts', candidateId);
    fs.mkdirSync(path.dirname(draftsBase), { recursive: true });
    // Block dir creation: make candidateId path a file
    fs.writeFileSync(draftsBase, 'not a dir');

    const candidate = makeCandidateRecord({ candidate_id: candidateId });
    const result = materialize({
      candidate,
      sourceActionId: 'act_fail',
      requestedArtifactType: 'instinct',
      renderPolicy: defaultRenderPolicy(),
      arcforgeRoot,
    });

    expect(result.ok).toBe(false);

    // No transition event should exist
    const queuePath = path.join(arcforgeRoot, 'learning', 'candidates', 'queue.jsonl');
    if (fs.existsSync(queuePath)) {
      const lines = fs
        .readFileSync(queuePath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const transitionEvent = lines.find(
        (e) => e.event_type === 'candidate.transitioned' && e.candidate_id === candidateId,
      );
      expect(transitionEvent).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// L7-9: MaterializationRecord.safety fields
// ---------------------------------------------------------------------------

describe('L7-9: MaterializationRecord.safety fields', () => {
  it('safety.active_paths_written is false', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    expect(result.record.safety.active_paths_written).toBe(false);
  });

  it('safety.draft_only is true', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    expect(result.record.safety.draft_only).toBe(true);
  });

  it('safety raw_* flags are all false', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    const s = result.record.safety;
    expect(s.raw_evidence_included).toBe(false);
    expect(s.raw_prompt_included).toBe(false);
    expect(s.raw_response_included).toBe(false);
    expect(s.raw_transcript_included).toBe(false);
    expect(s.skill_args_included).toBe(false);
  });

  it('safety.secret_scan.status is "passed" for clean content', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    expect(result.record.safety.secret_scan.status).toBe('passed');
  });

  it('safety.secret_scan.rule_version matches SANITIZER_POLICY_VERSION', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    const { SANITIZER_POLICY_VERSION } = require('../../scripts/lib/sanitize-observation');
    expect(result.record.safety.secret_scan.rule_version).toBe(SANITIZER_POLICY_VERSION);
  });

  it('safety.path_policy.active_roots_forbidden is true', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    expect(result.record.safety.path_policy.active_roots_forbidden).toBe(true);
  });

  it('safety.path_policy.status is "passed"', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);
    expect(result.record.safety.path_policy.status).toBe('passed');
  });
});

// ---------------------------------------------------------------------------
// L7-10: content_hash in DraftArtifactRecord matches on-disk content
// ---------------------------------------------------------------------------

describe('L7-10: content_hash matches on-disk draft content', () => {
  it('draft_artifacts[0].content_hash matches sha256 of actual file content', () => {
    const result = callMaterialize({});
    expect(result.ok).toBe(true);

    const draftArtifact = result.record.draft_artifacts[0];
    expect(draftArtifact).toBeDefined();

    const onDiskContent = fs.readFileSync(draftArtifact.draft_path, 'utf8');
    const { sha256Truncated } = require('../../scripts/lib/utils');
    const expectedHash = sha256Truncated(onDiskContent, 64);

    expect(draftArtifact.content_hash).toBe(expectedHash);
  });
});

// ---------------------------------------------------------------------------
// L7-11: Duplicate materialization idempotence
// ---------------------------------------------------------------------------

describe('L7-11: duplicate materialization handling', () => {
  it('returns same materialization_id for identical candidate_record_hash + policy_version', () => {
    const candidate = makeCandidateRecord({});
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const policy = defaultRenderPolicy();

    const result1 = materialize({
      candidate,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(result1.ok).toBe(true);

    const result2 = materialize({
      candidate,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(result2.ok).toBe(true);
    expect(result2.record.materialization_id).toBe(result1.record.materialization_id);
  });

  // What this pins: the idempotence branch owes Layer 5 the same report the fresh
  // path makes — AC-10 attaches that report to the manifest being durable, and on
  // this branch it already is. A re-materialized candidate reaches it because
  // replaying `candidate.transitioned` rewrites only `lifecycle`, so its record
  // hash is the one recorded at the first materialization.
  //
  // It is deliberately NOT the guard for the `deactivated → materialized` scenario
  // the review reported: `materialize()` reads `lifecycle.status` only to gate entry
  // (approved | deactivated) and to record it, so this case passes identically with
  // an `approved` second call — as the L7-11 case above, which now emits two
  // transitions as well, already shows. That scenario's guard is end-to-end, in
  // tests/scripts/learning.test.js ('accepts a deactivated candidate, which the
  // matrix allows to materialize'): it asserts the CLI hands back `materialized`
  // and that `learn drafts --project` then lists the candidate.
  it('reports the transition to Layer 5 on the idempotence branch, at any entry status', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const policy = defaultRenderPolicy();
    const approved = makeCandidateRecord({});

    const first = materialize({
      candidate: approved,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(first.ok).toBe(true);

    const deactivated = {
      ...approved,
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-23T00:00:00Z' },
    };
    const second = materialize({
      candidate: deactivated,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });

    expect(second.ok).toBe(true);
    expect(second.record.materialization_id).toBe(first.record.materialization_id);

    const queuePath = path.join(arcforgeRoot, 'learning', 'candidates', 'queue.jsonl');
    const transitions = fs
      .readFileSync(queuePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(
        (event) =>
          event.event_type === 'candidate.transitioned' &&
          event.candidate_id === approved.candidate_id &&
          event.action === 'materialize' &&
          event.next_status === 'materialized',
      );

    expect(transitions).toHaveLength(2);
  });

  it('creates a new materialization_id when candidate_record_hash changes', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const policy = defaultRenderPolicy();

    const candidate1 = makeCandidateRecord({ body: 'Version one of the body text here.' });
    const result1 = materialize({
      candidate: candidate1,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(result1.ok).toBe(true);

    const candidate2 = makeCandidateRecord({
      candidate_id: candidate1.candidate_id,
      body: 'Completely different body text here.',
      updated_at: '2026-05-22T00:00:00Z',
    });
    const result2 = materialize({
      candidate: candidate2,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(result2.ok).toBe(true);
    expect(result2.record.materialization_id).not.toBe(result1.record.materialization_id);
  });

  // What the next three pin: the reuse branch returns "the latest existing draft"
  // (layer-7-materialization.md, First-slice defaults #3) — an existing *draft*,
  // not merely an existing manifest. Reusing a manifest whose draft was deleted or
  // hand-edited would advance the lifecycle to `materialized` and let `learn drafts`
  // print a path that is not there, while the activation that follows refuses on the
  // very same content hash (activate.js, L8-3).
  it('re-materializes when the recorded draft file was deleted', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const policy = defaultRenderPolicy();
    const approved = makeCandidateRecord({});

    const first = materialize({
      candidate: approved,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(first.ok).toBe(true);
    fs.rmSync(first.draftPaths[0]);
    waitForNextMillisecond();

    const deactivated = {
      ...approved,
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-23T00:00:00Z' },
    };
    const second = materialize({
      candidate: deactivated,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });

    expect(second.ok).toBe(true);
    expect(second.record.materialization_id).not.toBe(first.record.materialization_id);
    expect(fs.existsSync(second.draftPaths[0])).toBe(true);
    expect(materializeTransitions(arcforgeRoot, approved.candidate_id)).toHaveLength(2);

    // The manifest `learn drafts` reads is the fresh one, and its paths are real.
    const { findUsableMaterialization } = require('../../scripts/lib/learning-curator/activate');
    const latest = findUsableMaterialization(arcforgeRoot, approved.candidate_id);
    expect(latest.materialization_id).toBe(second.record.materialization_id);
    for (const artifact of latest.draft_artifacts) {
      expect(fs.existsSync(artifact.draft_path)).toBe(true);
      expect(sha256Truncated(fs.readFileSync(artifact.draft_path, 'utf8'), 64)).toBe(
        artifact.content_hash,
      );
    }
  });

  it('re-materializes when the recorded draft no longer matches its content hash', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const policy = defaultRenderPolicy();
    const approved = makeCandidateRecord({});

    const first = materialize({
      candidate: approved,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(first.ok).toBe(true);
    const tampered = 'hand-edited draft body\n';
    fs.writeFileSync(first.draftPaths[0], tampered, 'utf8');
    waitForNextMillisecond();

    const deactivated = {
      ...approved,
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-23T00:00:00Z' },
    };
    const second = materialize({
      candidate: deactivated,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });

    expect(second.ok).toBe(true);
    expect(second.record.materialization_id).not.toBe(first.record.materialization_id);
    expect(second.draftPaths[0]).not.toBe(first.draftPaths[0]);
    // The fresh materialization gets its own directory, so the edited draft is left
    // where the reviewer left it — the render policy's overwrite_existing_draft:
    // false holds without anything having to overwrite-guard.
    expect(fs.readFileSync(first.draftPaths[0], 'utf8')).toBe(tampered);

    const { findUsableMaterialization } = require('../../scripts/lib/learning-curator/activate');
    const latest = findUsableMaterialization(arcforgeRoot, approved.candidate_id);
    expect(latest.materialization_id).toBe(second.record.materialization_id);
    const artifact = latest.draft_artifacts[0];
    expect(sha256Truncated(fs.readFileSync(artifact.draft_path, 'utf8'), 64)).toBe(
      artifact.content_hash,
    );
  });

  it('reuses the materialization when the recorded draft is intact', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const policy = defaultRenderPolicy();
    const approved = makeCandidateRecord({});

    const first = materialize({
      candidate: approved,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(first.ok).toBe(true);

    const deactivated = {
      ...approved,
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-23T00:00:00Z' },
    };
    const second = materialize({
      candidate: deactivated,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });

    expect(second.ok).toBe(true);
    expect(second.record.materialization_id).toBe(first.record.materialization_id);
    expect(second.draftPaths).toEqual(first.draftPaths);
    expect(materializationDirs(arcforgeRoot, approved.candidate_id)).toHaveLength(1);
    expect(materializeTransitions(arcforgeRoot, approved.candidate_id)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// findUsableMaterialization — the manifest the draft surfaces resolve to
// ---------------------------------------------------------------------------

// The other end of the reuse branch above. Once Layer 7 began skipping a stale
// manifest, a candidate could hold an older intact manifest beside a newer stale
// one — a state that did not exist while reuse ignored the files — and the
// newest-first lookup activation used then resolved to the manifest reuse had
// just refused. Activation refuses on that record's missing draft, and it
// refuses from `materialized`, the one status the matrix allows neither another
// materialize nor a dismiss from: the candidate is stranded with an intact draft
// beside it. Both selections have to land on one manifest.
describe('findUsableMaterialization', () => {
  function findUsable(arcforgeRoot, candidateId) {
    const { findUsableMaterialization } = require('../../scripts/lib/learning-curator/activate');
    return findUsableMaterialization(arcforgeRoot, candidateId);
  }

  /**
   * Two manifests for one candidate: an older A whose draft is intact, and a
   * newer B. Reuse skips A while its draft is gone, which is what writes B; the
   * caller decides what happens to each draft afterwards.
   */
  function twoManifests(arcforgeRoot) {
    const policy = defaultRenderPolicy();
    const approved = makeCandidateRecord({});
    const first = materialize({
      candidate: approved,
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(first.ok).toBe(true);
    const bodyA = fs.readFileSync(first.draftPaths[0], 'utf8');
    fs.rmSync(first.draftPaths[0]);
    waitForNextMillisecond();

    const deactivated = {
      ...approved,
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-23T00:00:00Z' },
    };
    const second = materialize({
      candidate: deactivated,
      sourceActionId: 'act_002',
      requestedArtifactType: 'instinct',
      renderPolicy: policy,
      arcforgeRoot,
    });
    expect(second.ok).toBe(true);
    expect(second.record.materialization_id).not.toBe(first.record.materialization_id);
    // A comes back byte-for-byte — a restored file, or one that was unreadable
    // when the second materialization ran.
    fs.writeFileSync(first.draftPaths[0], bodyA, 'utf8');
    return { candidate: deactivated, first, second };
  }

  it('resolves the intact manifest, not the newer one whose draft is gone', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const { candidate, first, second } = twoManifests(arcforgeRoot);
    fs.rmSync(second.draftPaths[0]);

    // The manifest Layer 7 reuses, and the one every draft surface resolves to,
    // are now the same record.
    const reused = materialize({
      candidate,
      sourceActionId: 'act_003',
      requestedArtifactType: 'instinct',
      renderPolicy: defaultRenderPolicy(),
      arcforgeRoot,
    });
    expect(reused.record.materialization_id).toBe(first.record.materialization_id);
    expect(findUsable(arcforgeRoot, candidate.candidate_id).materialization_id).toBe(
      first.record.materialization_id,
    );
  });

  it('resolves the newest manifest while its draft is intact', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const { candidate, second } = twoManifests(arcforgeRoot);

    expect(findUsable(arcforgeRoot, candidate.candidate_id).materialization_id).toBe(
      second.record.materialization_id,
    );
  });

  // The fall-back is what keeps a candidate with nothing left to review refusing
  // the way it always has: its newest manifest still names the file that is
  // gone, so `learn drafts` reports it and activation refuses on that record
  // rather than on an absent one.
  it('falls back to the newest manifest when no draft is intact', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const { candidate, first, second } = twoManifests(arcforgeRoot);
    fs.rmSync(first.draftPaths[0]);
    fs.rmSync(second.draftPaths[0]);

    expect(findUsable(arcforgeRoot, candidate.candidate_id).materialization_id).toBe(
      second.record.materialization_id,
    );
  });

  it('returns null when the candidate has no manifest at all', () => {
    expect(findUsable(path.join(tmpDir, '.arcforge'), 'cand_never_materialized')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// staleDraftArtifacts — the draft-integrity predicate, as cross-module API
// ---------------------------------------------------------------------------

// The reuse branch above screens manifests with this, and the `learn` candidate
// commands ask it before printing a manifest's draft paths. One owner for the
// comparison, so the CLI never re-implements the hashing.
describe('staleDraftArtifacts', () => {
  function materializedRecord() {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const result = materialize({
      candidate: makeCandidateRecord({}),
      sourceActionId: 'act_001',
      requestedArtifactType: 'instinct',
      renderPolicy: defaultRenderPolicy(),
      arcforgeRoot,
    });
    expect(result.ok).toBe(true);
    return result.record;
  }

  it('reports nothing for a draft still on disk and still matching its hash', () => {
    expect(staleDraftArtifacts(materializedRecord())).toEqual([]);
  });

  it('reports a deleted draft as missing', () => {
    const record = materializedRecord();
    const draftPath = record.draft_artifacts[0].draft_path;
    fs.rmSync(draftPath);

    expect(staleDraftArtifacts(record)).toEqual([{ draft_path: draftPath, reason: 'missing' }]);
  });

  it('reports an edited draft as a hash mismatch', () => {
    const record = materializedRecord();
    const draftPath = record.draft_artifacts[0].draft_path;
    fs.writeFileSync(draftPath, 'hand-edited draft body\n', 'utf8');

    expect(staleDraftArtifacts(record)).toEqual([
      { draft_path: draftPath, reason: 'hash_mismatch' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// L7-12: Path traversal rejection
// ---------------------------------------------------------------------------

describe('L7-12: path policy — reject path traversal in name', () => {
  it('rejects candidate with name containing path traversal', () => {
    const result = callMaterialize({ name: '../../../etc/passwd' });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('path_policy_rejected');
  });

  it('rejects candidate name with directory separator', () => {
    const result = callMaterialize({ name: 'some/path/traversal' });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('path_policy_rejected');
  });

  // `isMaterializableName` is exported so a front end that must refuse before it
  // dispatches — the CLI's `accept` — asks Layer 7 instead of keeping a second
  // copy of this rule. That front end never reaches the branch below, so a drift
  // between the predicate and the branch would stay invisible until a candidate
  // stranded. This is the assertion that keeps them together.
  it('the exported predicate agrees with the branch that enforces the policy', () => {
    const names = [
      'use-edit-bash-workflow',
      'a name with spaces',
      'some/path/traversal',
      'back\\slash',
      '../../../etc/passwd',
      '',
      '   ',
      'null\u0000byte',
    ];

    for (const name of names) {
      const rejected = callMaterialize({ name }).failure?.reason === 'path_policy_rejected';
      expect({ name, allowed: isMaterializableName(name) }).toEqual({ name, allowed: !rejected });
    }
  });
});

// ---------------------------------------------------------------------------
// L7-13: Failed materialization logged to failures.jsonl
// ---------------------------------------------------------------------------

describe('L7-13: failure logged to failures.jsonl', () => {
  it('appends failure record to drafts/failures.jsonl on rejection', () => {
    callMaterialize({ lifecycle: { status: 'pending_review', status_changed_at: 'x' } });

    const failurePath = path.join(tmpDir, '.arcforge', 'learning', 'drafts', 'failures.jsonl');
    expect(fs.existsSync(failurePath)).toBe(true);
    const lines = fs.readFileSync(failurePath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const failure = JSON.parse(lines[0]);
    expect(failure.reason).toBe('invalid_lifecycle_status');
  });
});

// ---------------------------------------------------------------------------
// L7-14: materialize.js NEVER writes to instincts/, skills/, commands/, etc.
// ---------------------------------------------------------------------------

describe('L7-14: never writes to active runtime paths', () => {
  it('no files written to instincts/ or active skills/commands/agents paths', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    callMaterialize({});

    const forbiddenRoots = [
      path.join(arcforgeRoot, 'instincts'),
      path.join(tmpDir, 'skills'),
      path.join(tmpDir, 'commands'),
      path.join(tmpDir, 'agents'),
    ];

    for (const forbiddenRoot of forbiddenRoots) {
      expect(fs.existsSync(forbiddenRoot)).toBe(false);
    }
  });

  it('CLAUDE.md is never touched', () => {
    callMaterialize({});
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    expect(fs.existsSync(claudeMdPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defaultRenderPolicy / getDraftRoot / buildDraftContent exports
// ---------------------------------------------------------------------------

describe('module API exports', () => {
  it('defaultRenderPolicy returns a policy with allowed_artifact_types containing instinct', () => {
    const policy = defaultRenderPolicy();
    expect(policy.allowed_artifact_types).toContain('instinct');
  });

  it('defaultRenderPolicy has active_roots_forbidden: true', () => {
    const policy = defaultRenderPolicy();
    expect(policy.active_roots_forbidden).toBe(true);
  });

  it('getDraftRoot returns correct path', () => {
    const arcforgeRoot = '/tmp/arcforge';
    const draftRootPath = getDraftRoot(arcforgeRoot, 'cand_abc', 'mat_xyz');
    expect(draftRootPath).toBe('/tmp/arcforge/learning/drafts/cand_abc/mat_xyz');
  });

  it('buildDraftContent returns a string containing candidate body', () => {
    const candidate = makeCandidateRecord({ body: 'My special body text' });
    const content = buildDraftContent({
      candidate,
      materializationId: 'mat_test',
      renderPolicy: defaultRenderPolicy(),
    });
    expect(typeof content).toBe('string');
    expect(content).toMatch(/My special body text/);
  });
});
