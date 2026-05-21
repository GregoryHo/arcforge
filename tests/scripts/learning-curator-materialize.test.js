// tests/scripts/learning-curator-materialize.test.js
//
// Layer 7 materialization — TDD for Slice G.
// Acceptance criteria: L7-1 through L7-14, plus round-trip RT-1 (partial).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

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

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-mat-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);

  ({
    materialize,
    buildDraftContent,
    getDraftRoot,
    defaultRenderPolicy,
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
