// tests/scripts/inject-activated-instincts-contract.test.js
//
// ICL-4 / S5-1 content contract.
//
// Proves the real chain materialize() → activate() → loadInstinctFiles() works
// end to end: the draft→active TRANSFORM emits YAML frontmatter so the active
// file is loadable with a NUMERIC confidence, and the instinct.js status reader
// lists it. NO hand-written YAML fixtures — that would defeat the contract.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

let tmpDir;
let homedirSpy;
let materializeModule;
let activateModule;

function makeCandidate(overrides = {}) {
  const candidateId = overrides.candidate_id || `cand_${crypto.randomBytes(4).toString('hex')}`;
  return {
    schema_version: 1,
    candidate_id: candidateId,
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'contract-project', project_id: 'proj-hash' },
    name: 'prefer-edit-over-bash',
    summary: 'Prefer Edit before Bash.',
    rationale: 'Observed.',
    body: 'When editing files, prefer Edit then Bash.',
    body_source: 'llm_curator',
    domain: 'workflow',
    trigger: 'when editing files',
    evidence: [{ evidence_id: 'ev-1', evidence_type: 'observation', relevance: 'x', summary: 's' }],
    evidence_quality: 'medium',
    lifecycle: { status: 'approved', status_changed_at: '2026-05-21T00:00:00Z' },
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-icl4-contract-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
  materializeModule = require('../../scripts/lib/learning-curator/materialize');
  activateModule = require('../../scripts/lib/learning-curator/activate');
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ICL-4 content contract: materialize → activate → loadInstinctFiles', () => {
  it('activated instinct loads with a numeric confidence and instinct.js lists it', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const candidate = makeCandidate();

    // 1. Materialize (writes the JSON-header INACTIVE DRAFT).
    const matResult = materializeModule.materialize({
      candidate,
      sourceActionId: 'act_seed',
      requestedArtifactType: 'instinct',
      renderPolicy: materializeModule.defaultRenderPolicy(),
      arcforgeRoot,
    });
    expect(matResult.ok).toBe(true);

    // 2. Activate (the transform — strips banner, emits YAML frontmatter).
    const actResult = activateModule.activate({
      candidate: { ...candidate, lifecycle: { status: 'materialized', status_changed_at: 'x' } },
      materializationRecord: matResult.record,
      activationRequest: {
        schema_version: 1,
        request_id: 'req_x',
        source_action_id: 'act_test',
        action: 'activate',
        candidate_id: candidate.candidate_id,
        target: { target_kind: 'instinct' },
        reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
      },
      activationPolicy: activateModule.defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    expect(actResult.ok).toBe(true);
    const activePath = actResult.activeArtifacts[0].active_path;

    // 3a. The active file must NOT carry the INACTIVE DRAFT banner.
    const activeContent = fs.readFileSync(activePath, 'utf8');
    expect(activeContent).not.toContain('INACTIVE DRAFT');
    expect(activeContent.startsWith('---\n')).toBe(true);

    // 3b. loadInstinctFiles (injection-side parser) must load it with a NUMBER.
    const injectContext = require('../../hooks/session-tracker/inject-context');
    const dir = path.dirname(activePath);
    const loaded = injectContext.loadInstinctFiles(dir);
    const match = loaded.find((i) => i.id === candidate.candidate_id);
    expect(match).toBeDefined();
    expect(typeof match.confidence).toBe('number');
    expect(Number.isFinite(match.confidence)).toBe(true);

    // 3c. instinct.js status reader must list it (visibility contract).
    const instinctCli = require('../../skills/arc-observing/scripts/instinct');
    const statusLoaded = instinctCli.loadInstincts(dir);
    const statusMatch = statusLoaded.find((i) => i.id === candidate.candidate_id);
    expect(statusMatch).toBeDefined();
    expect(typeof statusMatch.frontmatter.confidence).toBe('number');
  });

  it('initial confidence reflects evidence_quality', () => {
    const arcforgeRoot = path.join(tmpDir, '.arcforge');
    const { initialConfidenceFor } = activateModule;
    expect(initialConfidenceFor('high')).toBeGreaterThan(initialConfidenceFor('low'));
    expect(initialConfidenceFor(undefined)).toBe(0.5);

    // End-to-end: a 'high' candidate's active file carries a higher confidence.
    const candidate = makeCandidate({ evidence_quality: 'high' });
    const matResult = materializeModule.materialize({
      candidate,
      sourceActionId: 'act_seed',
      requestedArtifactType: 'instinct',
      renderPolicy: materializeModule.defaultRenderPolicy(),
      arcforgeRoot,
    });
    const actResult = activateModule.activate({
      candidate: { ...candidate, lifecycle: { status: 'materialized', status_changed_at: 'x' } },
      materializationRecord: matResult.record,
      activationRequest: {
        schema_version: 1,
        request_id: 'req_x',
        source_action_id: 'act_test',
        action: 'activate',
        candidate_id: candidate.candidate_id,
        target: { target_kind: 'instinct' },
        reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
      },
      activationPolicy: activateModule.defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    const content = fs.readFileSync(actResult.activeArtifacts[0].active_path, 'utf8');
    expect(content).toMatch(/confidence: 0\.60/);
  });
});
