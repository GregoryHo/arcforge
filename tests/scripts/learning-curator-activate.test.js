// tests/scripts/learning-curator-activate.test.js
//
// Layer 8 activation — TDD for Slice G.
// Acceptance criteria: L8-1 through L8-14 + RT-1 round-trip.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Helpers — candidate fixture
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
    summary: 'Prefer Edit before Bash.',
    rationale: 'Observed pattern.',
    body: 'When editing files, prefer Edit then Bash.',
    body_source: 'llm_curator',
    domain: 'workflow',
    evidence: [
      {
        evidence_id: 'ev-001',
        evidence_type: 'observation',
        relevance: 'Observed pattern.',
        summary: 'Edit then Bash seen.',
      },
    ],
    evidence_quality: 'low',
    evidence_quality_metadata: { rule_version: 'v1', basis: { project_obs_count: 5 } },
    lifecycle: { status: 'materialized', status_changed_at: '2026-05-21T00:00:00Z' },
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
// Module isolation
// ---------------------------------------------------------------------------

let tmpDir;
let homedirSpy;
let materializeModule;
let activate;
let deactivate;
let defaultActivationPolicy;
let buildActiveInstinctPath;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-act-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);

  materializeModule = require('../../scripts/lib/learning-curator/materialize');
  ({
    activate,
    deactivate,
    defaultActivationPolicy,
    buildActiveInstinctPath,
  } = require('../../scripts/lib/learning-curator/activate'));
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper — run a full materialization to produce a real MaterializationRecord
// ---------------------------------------------------------------------------

function runMaterialize(candidateOverrides = {}) {
  const candidate = makeCandidateRecord({
    lifecycle: { status: 'approved', status_changed_at: '2026-05-21T00:00:00Z' },
    ...candidateOverrides,
  });
  const arcforgeRoot = path.join(tmpDir, '.arcforge');
  const result = materializeModule.materialize({
    candidate,
    sourceActionId: 'act_seed',
    requestedArtifactType: 'instinct',
    renderPolicy: materializeModule.defaultRenderPolicy(),
    arcforgeRoot,
  });
  if (!result.ok) throw new Error(`Materialize failed: ${result.failure.reason}`);
  return {
    candidate: {
      ...candidate,
      lifecycle: { status: 'materialized', status_changed_at: '2026-05-21T00:00:00Z' },
    },
    materializationRecord: result.record,
    arcforgeRoot,
  };
}

// Helper: build a default ActivationRequest
function makeActivationRequest(overrides = {}) {
  return {
    schema_version: 1,
    request_id: `req_${crypto.randomBytes(4).toString('hex')}`,
    requested_at: new Date().toISOString(),
    source_action_id: 'act_test_001',
    action: 'activate',
    candidate_id: overrides.candidate_id || 'cand_test_abc',
    expected_candidate_status: 'materialized',
    target: {
      target_kind: overrides.target_kind || 'instinct',
    },
    reviewer_ack: overrides.reviewer_ack || {
      confirmed_behavior_change: true,
      saw_target_summary: true,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// L8-1: Reject invalid lifecycle status for activate/deactivate
// ---------------------------------------------------------------------------

describe('L8-1: reject invalid lifecycle status', () => {
  it('activate rejects if candidate is not materialized', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    // Override status to non-materialized
    const badCandidate = {
      ...candidate,
      lifecycle: { status: 'pending_review', status_changed_at: 'x' },
    };

    const result = activate({
      candidate: badCandidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: badCandidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('invalid_lifecycle_status');
  });

  it('deactivate rejects if candidate is not activated', () => {
    const { candidate, arcforgeRoot } = runMaterialize();
    // Try to deactivate a materialized candidate
    const deactivateRequest = {
      ...makeActivationRequest({ candidate_id: candidate.candidate_id }),
      action: 'deactivate',
      expected_candidate_status: 'activated',
    };

    const result = deactivate({
      candidate,
      activationRecord: null,
      activationRequest: deactivateRequest,
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('invalid_lifecycle_status');
  });

  it('activate accepts deactivated status (reactivation path)', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    // Simulate the deactivated state after a prior activate → deactivate cycle.
    const deactivatedCandidate = {
      ...candidate,
      lifecycle: { status: 'deactivated', status_changed_at: '2026-05-21T01:00:00Z' },
    };

    const result = activate({
      candidate: deactivatedCandidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: deactivatedCandidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(true);
    expect(result.record.action).toBe('activate');
    expect(result.activeArtifacts[0].status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// L8-2: Reject if materializationRecord candidate_id mismatch
// ---------------------------------------------------------------------------

describe('L8-2: reject candidate_id mismatch', () => {
  it('rejects when materializationRecord.candidate_id does not match candidate', () => {
    const { materializationRecord, arcforgeRoot } = runMaterialize();
    const differentCandidate = makeCandidateRecord({
      candidate_id: `cand_other_${crypto.randomBytes(4).toString('hex')}`,
      lifecycle: { status: 'materialized', status_changed_at: 'x' },
    });

    const result = activate({
      candidate: differentCandidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: differentCandidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('materialization_missing');
  });
});

// ---------------------------------------------------------------------------
// L8-3: Reject if draft file hash does not match
// ---------------------------------------------------------------------------

describe('L8-3: reject hash mismatch', () => {
  it('rejects when draft content does not match materialization record hash', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    // Tamper with draft file
    const draftPath = materializationRecord.draft_artifacts[0].draft_path;
    fs.writeFileSync(draftPath, 'TAMPERED CONTENT');

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('materialization_hash_mismatch');
  });
});

// ---------------------------------------------------------------------------
// L8-4: Reject if reviewer_ack.confirmed_behavior_change !== true
// ---------------------------------------------------------------------------

describe('L8-4: reject missing reviewer ack', () => {
  it('rejects when confirmed_behavior_change is not true', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({
        candidate_id: candidate.candidate_id,
        reviewer_ack: { confirmed_behavior_change: false, saw_target_summary: true },
      }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('missing_reviewer_ack');
  });

  it('rejects when reviewer_ack is absent', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const request = makeActivationRequest({ candidate_id: candidate.candidate_id });
    delete request.reviewer_ack;

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: request,
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('missing_reviewer_ack');
  });
});

// ---------------------------------------------------------------------------
// L8-5: Reject non-instinct target_kind in first slice
// ---------------------------------------------------------------------------

describe('L8-5: reject non-instinct target_kind in first slice', () => {
  it('rejects skill target_kind', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({
        candidate_id: candidate.candidate_id,
        target_kind: 'skill',
      }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('target_kind_mismatch');
  });

  it('rejects manual_claude_md_patch with policy_violation', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({
        candidate_id: candidate.candidate_id,
        target_kind: 'manual_claude_md_patch',
      }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    // Either target_kind_mismatch or policy_violation is acceptable for claude_md
    expect(['target_kind_mismatch', 'policy_violation']).toContain(result.failure.reason);
  });
});

// ---------------------------------------------------------------------------
// L8-6: Active path computation (project-scoped + global-scoped)
// ---------------------------------------------------------------------------

describe('L8-6: active path computation', () => {
  it('project-scoped candidate → instincts/<project>/<candidate_id>.md (name-keyed, ICL-3)', () => {
    const candidate = makeCandidateRecord({
      scope: { kind: 'project', project: 'my-project', project_id: 'proj-xyz' },
    });
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const activePath = buildActiveInstinctPath(arcforgeRoot, candidate);
    expect(activePath).toContain('instincts');
    // Keyed by the NAME slug (scope.project), which equals the injection-side
    // getInstinctsDir() key — NOT the hashed project_id the loader never reads.
    expect(activePath).toContain('my-project');
    expect(activePath).not.toContain('proj-xyz');
    expect(activePath).toContain(candidate.candidate_id);
    expect(activePath).toMatch(/\.md$/);
  });

  it('falls back to getProjectName() only when scope.project is absent (ICL-3)', () => {
    const prevDir = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = '/tmp/legacy-fallback-proj';
    try {
      jest.resetModules();
      const {
        buildActiveInstinctPath: build,
      } = require('../../scripts/lib/learning-curator/activate');
      const candidate = makeCandidateRecord({
        scope: { kind: 'project', project_id: 'proj-legacy' },
      });
      const arcforgeRoot = path.join(tmpDir, '.arcforge');
      const activePath = build(arcforgeRoot, candidate);
      expect(activePath).toContain('legacy-fallback-proj');
      expect(activePath).not.toContain('proj-legacy');
    } finally {
      if (prevDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prevDir;
    }
  });

  it('global-scoped candidate → instincts/global/<candidate_id>.md', () => {
    const candidate = makeCandidateRecord({
      scope: { kind: 'global' },
    });
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const activePath = buildActiveInstinctPath(arcforgeRoot, candidate);
    expect(activePath).toContain('instincts');
    expect(activePath).toContain('global');
    expect(activePath).toContain(candidate.candidate_id);
    expect(activePath).toMatch(/\.md$/);
  });
});

// ---------------------------------------------------------------------------
// L8-7: Active path must be inside allowed_active_roots
// ---------------------------------------------------------------------------

describe('L8-7: target path allowlist validation', () => {
  it('rejects activation if target path escapes allowed instincts_root', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const policy = defaultActivationPolicy(arcforgeRoot);
    // Override allowed roots to a different path to trigger rejection
    const restrictedPolicy = {
      ...policy,
      allowed_active_roots: {
        ...policy.allowed_active_roots,
        instincts_root: path.join(tmpDir, 'restricted-only'),
        global_instincts_root: path.join(tmpDir, 'restricted-only-global'),
      },
    };

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: restrictedPolicy,
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('target_path_rejected');
  });
});

// ---------------------------------------------------------------------------
// L8-8: Successful activation — writes active file + backup when existing
// ---------------------------------------------------------------------------

describe('L8-8: successful activation writes active file', () => {
  it('activation writes active instinct file at correct path', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });

    expect(result.ok).toBe(true);
    expect(result.activeArtifacts).toBeDefined();
    expect(result.activeArtifacts.length).toBeGreaterThan(0);

    const activePath = result.activeArtifacts[0].active_path;
    expect(activePath).toBeTruthy();
    expect(fs.existsSync(activePath)).toBe(true);
  });

  it('re-activation creates a backup of the existing active file (supersede_with_backup)', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const policy = defaultActivationPolicy(arcforgeRoot);

    // First activation
    const result1 = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: policy,
      arcforgeRoot,
    });
    expect(result1.ok).toBe(true);

    // Second activation (supersede)
    const result2 = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: policy,
      arcforgeRoot,
    });
    expect(result2.ok).toBe(true);
    expect(result2.activeArtifacts[0].previous_active_artifact_backup).toBeDefined();
    expect(result2.activeArtifacts[0].previous_active_artifact_backup.backup_path).toBeTruthy();
    expect(
      fs.existsSync(result2.activeArtifacts[0].previous_active_artifact_backup.backup_path),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L8-9: ActivationRecord persisted + lifecycle event after durable write
// ---------------------------------------------------------------------------

describe('L8-9: ActivationRecord persisted + lifecycle event', () => {
  it('activation record is written to activations/<activation_id>.json', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();

    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });

    expect(result.ok).toBe(true);
    const activationId = result.record.activation_id;
    const recordPath = path.join(arcforgeRoot, 'learning', 'activations', `${activationId}.json`);
    expect(fs.existsSync(recordPath)).toBe(true);

    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    expect(record.activation_id).toBe(activationId);
    expect(record.action).toBe('activate');
  });

  it('lifecycle event emitted with activate → activated', () => {
    const candidateId = `cand_evt_${crypto.randomBytes(4).toString('hex')}`;
    const queueDir = path.join(tmpDir, '.arcforge', 'learning', 'candidates');
    fs.mkdirSync(queueDir, { recursive: true });

    // Seed a candidate in queue.jsonl
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
        record: { ...candidate, lifecycle: { status: 'approved', status_changed_at: 'x' } },
      })}\n`,
      'utf8',
    );

    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const matResult = materializeModule.materialize({
      candidate: { ...candidate, lifecycle: { status: 'approved', status_changed_at: 'x' } },
      sourceActionId: 'act_seed',
      requestedArtifactType: 'instinct',
      renderPolicy: materializeModule.defaultRenderPolicy(),
      arcforgeRoot,
    });
    expect(matResult.ok).toBe(true);

    activate({
      candidate: { ...candidate, lifecycle: { status: 'materialized', status_changed_at: 'x' } },
      materializationRecord: matResult.record,
      activationRequest: makeActivationRequest({ candidate_id: candidateId }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });

    const lines = fs
      .readFileSync(path.join(queueDir, 'queue.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const transitionEvents = lines.filter(
      (e) => e.event_type === 'candidate.transitioned' && e.candidate_id === candidateId,
    );
    // Should have materialize transition + activate transition = 2
    const activateEvent = transitionEvents.find((e) => e.action === 'activate');
    expect(activateEvent).toBeDefined();
    expect(activateEvent.next_status).toBe('activated');
  });
});

// ---------------------------------------------------------------------------
// L8-10: ActivationRecord.safety fields
// ---------------------------------------------------------------------------

describe('L8-10: ActivationRecord.safety fields', () => {
  it('materialization_integrity_verified is true on successful activation', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(true);
    expect(result.record.safety.materialization_integrity_verified).toBe(true);
  });

  it('candidate_influence flags are false', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(true);
    const s = result.record.safety;
    expect(s.pending_candidate_influence).toBe(false);
    expect(s.approved_candidate_influence).toBe(false);
    expect(s.materialized_candidate_influence_before_activation).toBe(false);
  });

  it('claude_md_auto_apply is false', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(true);
    expect(result.record.safety.claude_md_auto_apply).toBe(false);
  });

  it('runtime_boundary fields are true', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const result = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(true);
    const rb = result.record.safety.runtime_boundary;
    expect(rb.session_start_instinct_autoload_disabled_required).toBe(true);
    expect(rb.global_auto_promote_disabled_required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L8-11: activate.js never touches CLAUDE.md
// ---------------------------------------------------------------------------

describe('L8-11: CLAUDE.md is never touched', () => {
  it('activation does not create or modify CLAUDE.md', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });

    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    expect(fs.existsSync(claudeMdPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L8-12: deactivate moves file to .disabled/ archive
// ---------------------------------------------------------------------------

describe('L8-12: deactivate moves file to .disabled archive', () => {
  it('moves active file to .disabled/<candidate_id>-<timestamp>.md and removes original', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const policy = defaultActivationPolicy(arcforgeRoot);

    // First activate
    const actResult = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: policy,
      arcforgeRoot,
    });
    expect(actResult.ok).toBe(true);
    const activePath = actResult.activeArtifacts[0].active_path;
    expect(fs.existsSync(activePath)).toBe(true);

    // Now deactivate
    const deactivateRequest = {
      ...makeActivationRequest({ candidate_id: candidate.candidate_id }),
      action: 'deactivate',
      expected_candidate_status: 'activated',
    };
    const activatedCandidate = {
      ...candidate,
      lifecycle: { status: 'activated', status_changed_at: 'x' },
    };

    const deactResult = deactivate({
      candidate: activatedCandidate,
      activationRecord: actResult.record,
      activationRequest: deactivateRequest,
      activationPolicy: policy,
      arcforgeRoot,
    });

    expect(deactResult.ok).toBe(true);

    // Original file should be gone
    expect(fs.existsSync(activePath)).toBe(false);

    // Archive file should exist in .disabled/
    const archiveArtifact = deactResult.activeArtifacts[0];
    expect(archiveArtifact.active_path).toBeTruthy();
    expect(archiveArtifact.active_path).toContain('.disabled');
    expect(fs.existsSync(archiveArtifact.active_path)).toBe(true);
  });

  it('deactivate emits lifecycle event transitioning to deactivated', () => {
    const candidateId = `cand_deact_${crypto.randomBytes(4).toString('hex')}`;
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
        record: { ...candidate, lifecycle: { status: 'approved', status_changed_at: 'x' } },
      })}\n`,
      'utf8',
    );

    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const matResult = materializeModule.materialize({
      candidate: { ...candidate, lifecycle: { status: 'approved', status_changed_at: 'x' } },
      sourceActionId: 'act_seed',
      requestedArtifactType: 'instinct',
      renderPolicy: materializeModule.defaultRenderPolicy(),
      arcforgeRoot,
    });
    expect(matResult.ok).toBe(true);

    const policy = defaultActivationPolicy(arcforgeRoot);
    const actResult = activate({
      candidate: { ...candidate, lifecycle: { status: 'materialized', status_changed_at: 'x' } },
      materializationRecord: matResult.record,
      activationRequest: makeActivationRequest({ candidate_id: candidateId }),
      activationPolicy: policy,
      arcforgeRoot,
    });
    expect(actResult.ok).toBe(true);

    deactivate({
      candidate: { ...candidate, lifecycle: { status: 'activated', status_changed_at: 'x' } },
      activationRecord: actResult.record,
      activationRequest: {
        ...makeActivationRequest({ candidate_id: candidateId }),
        action: 'deactivate',
        expected_candidate_status: 'activated',
      },
      activationPolicy: policy,
      arcforgeRoot,
    });

    const lines = fs
      .readFileSync(path.join(queueDir, 'queue.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const deactEvent = lines.find(
      (e) =>
        e.event_type === 'candidate.transitioned' &&
        e.candidate_id === candidateId &&
        e.action === 'deactivate',
    );
    expect(deactEvent).toBeDefined();
    expect(deactEvent.next_status).toBe('deactivated');
  });
});

// ---------------------------------------------------------------------------
// L8-13: Failed activation logged to activations/failures.jsonl
// ---------------------------------------------------------------------------

describe('L8-13: failure logged to activations/failures.jsonl', () => {
  it('appends failure record on invalid lifecycle status', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const badCandidate = {
      ...candidate,
      lifecycle: { status: 'pending_review', status_changed_at: 'x' },
    };

    activate({
      candidate: badCandidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });

    const failurePath = path.join(arcforgeRoot, 'learning', 'activations', 'failures.jsonl');
    expect(fs.existsSync(failurePath)).toBe(true);
    const lines = fs.readFileSync(failurePath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const failure = JSON.parse(lines[0]);
    expect(failure.reason).toBe('invalid_lifecycle_status');
  });
});

// ---------------------------------------------------------------------------
// L8-14: claude_md_addition must be rejected
// ---------------------------------------------------------------------------

describe('L8-14: claude_md_addition rejected by activate()', () => {
  it('returns policy_violation for claude_md_addition artifact', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    // Use a candidate whose artifact_type appears as claude_md_addition
    const claudeMdCandidate = { ...candidate, artifact_type: 'claude_md_addition' };

    const result = activate({
      candidate: claudeMdCandidate,
      materializationRecord,
      activationRequest: makeActivationRequest({
        candidate_id: candidate.candidate_id,
        target_kind: 'manual_claude_md_patch',
      }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(result.ok).toBe(false);
    expect(['policy_violation', 'target_kind_mismatch']).toContain(result.failure.reason);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe('module API exports', () => {
  it('defaultActivationPolicy returns a policy with allowed_target_kinds containing instinct', () => {
    const policy = defaultActivationPolicy(path.join(tmpDir, '.arcforge'));
    expect(policy.allowed_target_kinds).toContain('instinct');
  });

  it('defaultActivationPolicy has instinct overwrite_policy: supersede_with_backup', () => {
    const policy = defaultActivationPolicy(path.join(tmpDir, '.arcforge'));
    expect(policy.overwrite_existing_active_artifact.instinct).toBe('supersede_with_backup');
  });

  it('defaultActivationPolicy has skill overwrite_policy: forbidden', () => {
    const policy = defaultActivationPolicy(path.join(tmpDir, '.arcforge'));
    expect(policy.overwrite_existing_active_artifact.skill).toBe('forbidden');
  });

  it('defaultActivationPolicy.claude_md_auto_apply_allowed is false', () => {
    const policy = defaultActivationPolicy(path.join(tmpDir, '.arcforge'));
    expect(policy.claude_md_auto_apply_allowed).toBe(false);
  });

  it('defaultActivationPolicy.deactivation_mode is move_to_disabled_archive', () => {
    const policy = defaultActivationPolicy(path.join(tmpDir, '.arcforge'));
    expect(policy.deactivation_mode).toBe('move_to_disabled_archive');
  });
});

// ---------------------------------------------------------------------------
// RT-1: Round-trip integration test (approve → materialize → activate → deactivate)
// ---------------------------------------------------------------------------

describe('RT-1: round-trip integration test', () => {
  it('approved → materialize → activate → deactivate full round-trip', () => {
    const candidateId = `cand_rt1_${crypto.randomBytes(4).toString('hex')}`;
    const arcforgeRoot = path.join(tmpDir, '.arcforge');

    // Step 1: Build approved candidate
    const approvedCandidate = makeCandidateRecord({
      candidate_id: candidateId,
      lifecycle: { status: 'approved', status_changed_at: '2026-05-21T00:00:00Z' },
    });

    // Step 2: Materialize
    const matResult = materializeModule.materialize({
      candidate: approvedCandidate,
      sourceActionId: 'act_rt1_mat',
      requestedArtifactType: 'instinct',
      renderPolicy: materializeModule.defaultRenderPolicy(),
      arcforgeRoot,
    });
    expect(matResult.ok).toBe(true);
    expect(fs.existsSync(matResult.draftPaths[0])).toBe(true);

    const materializedCandidate = {
      ...approvedCandidate,
      lifecycle: { status: 'materialized', status_changed_at: new Date().toISOString() },
    };

    // Step 3: Activate
    const actResult = activate({
      candidate: materializedCandidate,
      materializationRecord: matResult.record,
      activationRequest: makeActivationRequest({ candidate_id: candidateId }),
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(actResult.ok).toBe(true);
    const activePath = actResult.activeArtifacts[0].active_path;
    expect(fs.existsSync(activePath)).toBe(true);

    const activatedCandidate = {
      ...approvedCandidate,
      lifecycle: { status: 'activated', status_changed_at: new Date().toISOString() },
    };

    // Step 4: Deactivate
    const deactResult = deactivate({
      candidate: activatedCandidate,
      activationRecord: actResult.record,
      activationRequest: {
        ...makeActivationRequest({ candidate_id: candidateId }),
        action: 'deactivate',
        expected_candidate_status: 'activated',
      },
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(deactResult.ok).toBe(true);

    // Original active path gone, archive exists
    expect(fs.existsSync(activePath)).toBe(false);
    expect(fs.existsSync(deactResult.activeArtifacts[0].active_path)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion #4 — active_path_summary redaction (PR-B Layer 8)
// ---------------------------------------------------------------------------

describe('active_path_summary — redacted form', () => {
  it('activate: active_path_summary matches instincts/<12hexchars>.md and does not contain project_id', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const policy = defaultActivationPolicy(arcforgeRoot);

    const actResult = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: policy,
      arcforgeRoot,
    });

    expect(actResult.ok).toBe(true);
    const summary = actResult.activeArtifacts[0].active_path_summary;
    expect(summary).toMatch(/^instincts\/[a-f0-9]{12}\.md$/);
    expect(summary).not.toContain('proj-abc123');
  });

  it('deactivate: active_path_summary matches instincts/<12hexchars>.md and does not contain project_id', () => {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const policy = defaultActivationPolicy(arcforgeRoot);

    const actResult = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: policy,
      arcforgeRoot,
    });
    expect(actResult.ok).toBe(true);

    const deactResult = deactivate({
      candidate: { ...candidate, lifecycle: { status: 'activated', status_changed_at: 'x' } },
      activationRecord: actResult.record,
      activationRequest: {
        ...makeActivationRequest({ candidate_id: candidate.candidate_id }),
        action: 'deactivate',
        expected_candidate_status: 'activated',
      },
      activationPolicy: policy,
      arcforgeRoot,
    });

    expect(deactResult.ok).toBe(true);
    const summary = deactResult.activeArtifacts[0].active_path_summary;
    expect(summary).toMatch(/^instincts\/[a-f0-9]{12}\.md$/);
    expect(summary).not.toContain('proj-abc123');
  });
});

// ---------------------------------------------------------------------------
// Criterion #3 — deactivate() requires reviewer_ack (PR-B Layer 8 Blocker #3)
// ---------------------------------------------------------------------------

describe('deactivate — reviewer_ack enforcement', () => {
  function runActivate() {
    const { candidate, materializationRecord, arcforgeRoot } = runMaterialize();
    const policy = defaultActivationPolicy(arcforgeRoot);
    const actResult = activate({
      candidate,
      materializationRecord,
      activationRequest: makeActivationRequest({ candidate_id: candidate.candidate_id }),
      activationPolicy: policy,
      arcforgeRoot,
    });
    expect(actResult.ok).toBe(true);
    return {
      activatedCandidate: {
        ...candidate,
        lifecycle: { status: 'activated', status_changed_at: 'x' },
      },
      activationRecord: actResult.record,
      arcforgeRoot,
      policy,
    };
  }

  it('rejects deactivation when reviewer_ack is missing', () => {
    const { activatedCandidate, activationRecord, arcforgeRoot, policy } = runActivate();
    const req = {
      ...makeActivationRequest({ candidate_id: activatedCandidate.candidate_id }),
      action: 'deactivate',
      expected_candidate_status: 'activated',
    };
    delete req.reviewer_ack;

    const result = deactivate({
      candidate: activatedCandidate,
      activationRecord,
      activationRequest: req,
      activationPolicy: policy,
      arcforgeRoot,
    });

    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('missing_reviewer_ack');
  });

  it('rejects deactivation when confirmed_behavior_change is false', () => {
    const { activatedCandidate, activationRecord, arcforgeRoot, policy } = runActivate();
    const req = {
      ...makeActivationRequest({ candidate_id: activatedCandidate.candidate_id }),
      action: 'deactivate',
      expected_candidate_status: 'activated',
      reviewer_ack: { confirmed_behavior_change: false, saw_target_summary: true },
    };

    const result = deactivate({
      candidate: activatedCandidate,
      activationRecord,
      activationRequest: req,
      activationPolicy: policy,
      arcforgeRoot,
    });

    expect(result.ok).toBe(false);
    expect(result.failure.reason).toBe('missing_reviewer_ack');
  });

  it('succeeds deactivation when reviewer_ack.confirmed_behavior_change is true', () => {
    const { activatedCandidate, activationRecord, arcforgeRoot, policy } = runActivate();
    const req = {
      ...makeActivationRequest({ candidate_id: activatedCandidate.candidate_id }),
      action: 'deactivate',
      expected_candidate_status: 'activated',
      reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
    };

    const result = deactivate({
      candidate: activatedCandidate,
      activationRecord,
      activationRequest: req,
      activationPolicy: policy,
      arcforgeRoot,
    });

    expect(result.ok).toBe(true);
  });
});
