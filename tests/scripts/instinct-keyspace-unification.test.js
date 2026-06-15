// tests/scripts/instinct-keyspace-unification.test.js
//
// ICL-3: instinct keyspace unification.
//
// Active instinct files must be written under the NAME-keyed directory
// (`instincts/<scope.project>/`) — the same key the injection/decay side
// resolves via getInstinctsDir(getProjectName()) — not the hashed
// `scope.project_id` directory the loader never reads. This suite verifies:
//   1. temp-HOME integration: activate → name dir; deactivate → .disabled/
//   2. one-time idempotent migration: move, collision-skip, second-run no-op
//   3. decay touches the migrated fixture
//   4. cross-project: dashboard activate from another cwd lands in scope.project

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Candidate fixture (matches the shipped Layer 5 candidate shape)
// ---------------------------------------------------------------------------

function makeCandidateRecord(overrides = {}) {
  const base = {
    schema_version: 1,
    candidate_id: overrides.candidate_id || `cand_test_${crypto.randomBytes(4).toString('hex')}`,
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'alpha-project', project_id: 'proj-hash-aaa' },
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
        summary: 'Edit then Bash seen in session A.',
      },
      {
        evidence_id: 'ev-002',
        evidence_type: 'observation',
        relevance: 'Second observation.',
        summary: 'Edit then Bash seen in session B.',
      },
    ],
    evidence_quality: 'low',
    evidence_quality_metadata: { rule_version: 'v1', basis: { project_obs_count: 5 } },
    lifecycle: { status: 'materialized', status_changed_at: '2026-05-21T00:00:00Z' },
    // Full safety block so the fixture passes validateCandidateV1 on the
    // dashboard appendCandidate path (the direct activate() path ignores it).
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
    dedupe: { dedupe_key: 'use-edit-bash-workflow-v1', dedupe_basis: { name_hash: 'abc' } },
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    ...overrides,
  };
  if (overrides.scope) base.scope = overrides.scope;
  if (overrides.lifecycle) base.lifecycle = overrides.lifecycle;
  return base;
}

// ---------------------------------------------------------------------------
// Module isolation — all os.homedir() calls redirect to tmpDir
// ---------------------------------------------------------------------------

let tmpDir;
let homedirSpy;
let materializeModule;
let activate;
let deactivate;
let defaultActivationPolicy;
let sessionUtils;
const prevProjectDir = process.env.CLAUDE_PROJECT_DIR;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-icl3-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);

  materializeModule = require('../../scripts/lib/learning-curator/materialize');
  ({
    activate,
    deactivate,
    defaultActivationPolicy,
  } = require('../../scripts/lib/learning-curator/activate'));
  sessionUtils = require('../../scripts/lib/session-utils');
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (prevProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = prevProjectDir;
});

// ---------------------------------------------------------------------------
// Helpers — full materialize → activate chain producing real on-disk files
// ---------------------------------------------------------------------------

function materializeAndGet(candidateOverrides = {}) {
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

function makeActivationRequest(candidateId) {
  return {
    schema_version: 1,
    request_id: `req_${crypto.randomBytes(4).toString('hex')}`,
    requested_at: new Date().toISOString(),
    source_action_id: 'act_test_001',
    action: 'activate',
    candidate_id: candidateId,
    expected_candidate_status: 'materialized',
    target: { target_kind: 'instinct' },
    reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
  };
}

function activateCandidate(ctx) {
  return activate({
    candidate: ctx.candidate,
    materializationRecord: ctx.materializationRecord,
    activationRequest: makeActivationRequest(ctx.candidate.candidate_id),
    activationPolicy: defaultActivationPolicy(ctx.arcforgeRoot),
    arcforgeRoot: ctx.arcforgeRoot,
  });
}

// ---------------------------------------------------------------------------
// 1. temp-HOME integration: activate → name dir; deactivate → .disabled/
// ---------------------------------------------------------------------------

describe('activate lands in the name-keyed dir (matches injection key)', () => {
  it('activation writes to instincts/<scope.project>/, the getInstinctsDir() key', () => {
    const ctx = materializeAndGet();
    const result = activateCandidate(ctx);
    expect(result.ok).toBe(true);

    const activePath = result.activeArtifacts[0].active_path;
    // The exact directory the injection/decay side reads from.
    const nameDir = sessionUtils.getInstinctsDir('alpha-project');
    expect(path.dirname(activePath)).toBe(nameDir);
    expect(fs.existsSync(activePath)).toBe(true);
    // Must NOT use the hashed project_id directory.
    expect(activePath).not.toContain('proj-hash-aaa');
  });

  it('deactivate archives under the same name-keyed dir .disabled/', () => {
    const ctx = materializeAndGet();
    const actResult = activateCandidate(ctx);
    expect(actResult.ok).toBe(true);

    const deactResult = deactivate({
      candidate: { ...ctx.candidate, lifecycle: { status: 'activated', status_changed_at: 'x' } },
      activationRecord: actResult.record,
      activationRequest: {
        ...makeActivationRequest(ctx.candidate.candidate_id),
        action: 'deactivate',
        expected_candidate_status: 'activated',
      },
      activationPolicy: defaultActivationPolicy(ctx.arcforgeRoot),
      arcforgeRoot: ctx.arcforgeRoot,
    });
    expect(deactResult.ok).toBe(true);

    const archivePath = deactResult.activeArtifacts[0].active_path;
    const expectedDisabledDir = path.join(
      sessionUtils.getInstinctsDir('alpha-project'),
      '.disabled',
    );
    expect(path.dirname(archivePath)).toBe(expectedDisabledDir);
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(archivePath).not.toContain('proj-hash-aaa');
  });
});

// ---------------------------------------------------------------------------
// 2. one-time idempotent migration: move, collision-skip, second-run no-op
// ---------------------------------------------------------------------------

describe('migrateInstinctsToNameKey — hash dir → name dir', () => {
  // Seed an active instinct file inside a stale hash-keyed dir by writing the
  // real materialized draft (which embeds scope) under instincts/<project_id>/.
  function seedHashKeyedInstinct(candidateId, project, projectId) {
    const ctx = materializeAndGet({
      candidate_id: candidateId,
      scope: { kind: 'project', project, project_id: projectId },
    });
    const draftPath = ctx.materializationRecord.draft_artifacts[0].draft_path;
    const draftContent = fs.readFileSync(draftPath, 'utf8');
    const hashDir = path.join(tmpDir, '.arcforge', 'instincts', projectId);
    fs.mkdirSync(hashDir, { recursive: true });
    const filePath = path.join(hashDir, `${candidateId}.md`);
    fs.writeFileSync(filePath, draftContent);
    return { filePath, draftContent };
  }

  it('moves a stale hash-keyed instinct into the name-keyed dir', () => {
    const { filePath } = seedHashKeyedInstinct('cand_mig_1', 'alpha-project', 'proj-hash-aaa');
    expect(fs.existsSync(filePath)).toBe(true);

    const res = sessionUtils.migrateInstinctsToNameKey('alpha-project');

    expect(res.moved).toContain('cand_mig_1.md');
    // Old location gone, new name-keyed location present.
    expect(fs.existsSync(filePath)).toBe(false);
    const nameDirFile = path.join(sessionUtils.getInstinctsDir('alpha-project'), 'cand_mig_1.md');
    expect(fs.existsSync(nameDirFile)).toBe(true);
  });

  it('skips files belonging to a different project (per-file scope match)', () => {
    seedHashKeyedInstinct('cand_other', 'beta-project', 'proj-hash-bbb');

    const res = sessionUtils.migrateInstinctsToNameKey('alpha-project');

    expect(res.moved).not.toContain('cand_other.md');
    // beta's file stays put in its hash dir; alpha's name dir does not gain it.
    const betaHashFile = path.join(
      tmpDir,
      '.arcforge',
      'instincts',
      'proj-hash-bbb',
      'cand_other.md',
    );
    expect(fs.existsSync(betaHashFile)).toBe(true);
  });

  it('collision-skip: never overwrites an existing name-keyed file', () => {
    seedHashKeyedInstinct('cand_collide', 'alpha-project', 'proj-hash-aaa');
    // Pre-existing file at the destination with sentinel content.
    const nameDir = sessionUtils.getInstinctsDir('alpha-project');
    fs.mkdirSync(nameDir, { recursive: true });
    const destFile = path.join(nameDir, 'cand_collide.md');
    fs.writeFileSync(destFile, 'SENTINEL — must not be overwritten');

    const res = sessionUtils.migrateInstinctsToNameKey('alpha-project');

    expect(res.skipped).toContain('cand_collide.md');
    expect(res.moved).not.toContain('cand_collide.md');
    // Destination content preserved; stale source preserved (not destroyed).
    expect(fs.readFileSync(destFile, 'utf8')).toBe('SENTINEL — must not be overwritten');
    const staleSource = path.join(
      tmpDir,
      '.arcforge',
      'instincts',
      'proj-hash-aaa',
      'cand_collide.md',
    );
    expect(fs.existsSync(staleSource)).toBe(true);
  });

  it('idempotent: a second invocation is a no-op', () => {
    seedHashKeyedInstinct('cand_idem', 'alpha-project', 'proj-hash-aaa');

    const first = sessionUtils.migrateInstinctsToNameKey('alpha-project');
    expect(first.moved).toContain('cand_idem.md');

    const second = sessionUtils.migrateInstinctsToNameKey('alpha-project');
    expect(second.moved).toEqual([]);
    expect(second.skipped).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. decay touches the migrated fixture
// ---------------------------------------------------------------------------

describe('decay cycle reaches migrated instincts', () => {
  it('runDecayCycle on the name-keyed dir sees the migrated file', () => {
    // Decay reads leading YAML frontmatter (confidence + last_confirmed);
    // migration reads the embedded ```json scope block from the body. A file
    // can satisfy both: YAML frontmatter first, then the scope JSON block.
    const staleDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const scopeBlock = JSON.stringify(
      {
        schema_version: 1,
        candidate_id: 'cand_decay',
        scope: { kind: 'project', project: 'alpha-project', project_id: 'proj-hash-aaa' },
      },
      null,
      2,
    );
    const fileContent = [
      '---',
      'id: cand_decay',
      'confidence: 0.8',
      'trigger: stale instinct',
      'domain: workflow',
      `last_confirmed: ${staleDate}`,
      '---',
      '',
      '```json',
      scopeBlock,
      '```',
      '',
      '## Action',
      'do the thing',
      '',
    ].join('\n');

    const hashDir = path.join(tmpDir, '.arcforge', 'instincts', 'proj-hash-aaa');
    fs.mkdirSync(hashDir, { recursive: true });
    fs.writeFileSync(path.join(hashDir, 'cand_decay.md'), fileContent);

    const moveRes = sessionUtils.migrateInstinctsToNameKey('alpha-project');
    expect(moveRes.moved).toContain('cand_decay.md');

    const { runDecayCycle } = require('../../scripts/lib/confidence');
    const decayResult = runDecayCycle(sessionUtils.getInstinctsDir('alpha-project'));

    // The migrated file must be reachable by decay (decayed or archived).
    const touched = [...decayResult.decayed, ...decayResult.archived];
    expect(touched).toContain('cand_decay.md');
  });
});

// ---------------------------------------------------------------------------
// 4. cross-project: dashboard activate from another cwd → scope.project dir
// ---------------------------------------------------------------------------

describe('cross-project activation is keyed by candidate scope, not cwd', () => {
  it('dashboard activate from a different cwd lands in scope.project dir', () => {
    // Launcher cwd / CLAUDE_PROJECT_DIR points at an UNRELATED project.
    process.env.CLAUDE_PROJECT_DIR = '/tmp/some-other-cwd-project';

    jest.resetModules();
    const dashboard = require('../../scripts/lib/learning-dashboard');
    const { appendCandidate } = require('../../scripts/lib/learning-curator/queue-writer');
    const {
      appendTransitionEvent,
    } = require('../../scripts/lib/learning-curator/dashboard-events');

    // The candidate belongs to 'gamma-project' (its captured scope.project),
    // which is NOT the current cwd basename.
    const candidate = makeCandidateRecord({
      candidate_id: `cand_xproj_${crypto.randomBytes(4).toString('hex')}`,
      scope: { kind: 'project', project: 'gamma-project', project_id: 'proj-hash-ggg' },
    });
    appendCandidate(candidate);
    appendTransitionEvent(candidate.candidate_id, 'approve', 'approved');

    const matResult = dashboard.handleDashboardAction({
      action: 'materialize',
      candidate_id: candidate.candidate_id,
    });
    expect(matResult.accepted).toBe(true);

    const actResult = dashboard.handleDashboardAction({
      action: 'activate',
      candidate_id: candidate.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });
    expect(actResult.accepted).toBe(true);

    // File must land in gamma-project (candidate scope), NOT the cwd project.
    const gammaDir = path.join(tmpDir, '.arcforge', 'instincts', 'gamma-project');
    const files = fs.existsSync(gammaDir)
      ? fs.readdirSync(gammaDir).filter((f) => f.endsWith('.md'))
      : [];
    expect(files).toContain(`${candidate.candidate_id}.md`);

    // And explicitly NOT in a cwd-named dir or the hashed project_id dir.
    const cwdDir = path.join(tmpDir, '.arcforge', 'instincts', 'some-other-cwd-project');
    expect(fs.existsSync(cwdDir)).toBe(false);
    const hashDir = path.join(tmpDir, '.arcforge', 'instincts', 'proj-hash-ggg');
    expect(fs.existsSync(hashDir)).toBe(false);
  });
});
