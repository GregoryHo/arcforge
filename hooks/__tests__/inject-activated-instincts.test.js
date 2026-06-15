// hooks/__tests__/inject-activated-instincts.test.js
//
// ICL-4 — SessionStart injection of ACTIVATED instincts.
//
// The gate is the activation lifecycle, not confidence. Every fixture uses the
// real materialize() → activate() chain (no hand-written YAML) so the test
// proves the content contract end to end: a dashboard-activated instinct is
// transformed into loadable YAML frontmatter and surfaces at SessionStart.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const materializeModule = require('../../scripts/lib/learning-curator/materialize');
const {
  activate,
  deactivate,
  defaultActivationPolicy,
} = require('../../scripts/lib/learning-curator/activate');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let testDir;
let projectRoot;
let projectName;
let arcforgeRoot;
const originalEnv = { ...process.env };

function makeCandidate(overrides = {}) {
  const candidateId = overrides.candidate_id || `cand_${crypto.randomBytes(4).toString('hex')}`;
  return {
    schema_version: 1,
    candidate_id: candidateId,
    artifact_type: 'instinct',
    scope: { kind: 'project', project: projectName, project_id: 'proj-hash' },
    name: overrides.name || `instinct-${candidateId}`,
    summary: overrides.summary || 'A behavioral pattern.',
    rationale: 'Observed pattern.',
    body: overrides.body || 'Prefer Edit before Bash when modifying files.',
    body_source: 'llm_curator',
    domain: overrides.domain || 'workflow',
    trigger: overrides.trigger || 'when editing files',
    evidence: [{ evidence_id: 'ev-1', evidence_type: 'observation', relevance: 'x', summary: 's' }],
    evidence_quality: overrides.evidence_quality || 'low',
    lifecycle: { status: 'approved', status_changed_at: '2026-05-21T00:00:00Z' },
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    ...overrides,
  };
}

// Run the real materialize → activate chain. Returns the candidate.
function activateCandidate(overrides = {}) {
  const candidate = makeCandidate(overrides);
  const matResult = materializeModule.materialize({
    candidate,
    sourceActionId: 'act_seed',
    requestedArtifactType: 'instinct',
    renderPolicy: materializeModule.defaultRenderPolicy(),
    arcforgeRoot,
  });
  if (!matResult.ok) throw new Error(`materialize failed: ${matResult.failure.reason}`);

  const actResult = activate({
    candidate: { ...candidate, lifecycle: { status: 'materialized', status_changed_at: 'x' } },
    materializationRecord: matResult.record,
    activationRequest: {
      schema_version: 1,
      request_id: `req_${crypto.randomBytes(4).toString('hex')}`,
      source_action_id: 'act_test',
      action: 'activate',
      candidate_id: candidate.candidate_id,
      target: { target_kind: 'instinct' },
      reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
    },
    activationPolicy: defaultActivationPolicy(arcforgeRoot),
    arcforgeRoot,
  });
  if (!actResult.ok) throw new Error(`activate failed: ${actResult.failure.reason}`);
  return { candidate, activationRecord: actResult.record };
}

function deactivateCandidate(candidate, activationRecord) {
  const result = deactivate({
    candidate: { ...candidate, lifecycle: { status: 'activated', status_changed_at: 'x' } },
    activationRecord,
    activationRequest: {
      schema_version: 1,
      request_id: `req_${crypto.randomBytes(4).toString('hex')}`,
      source_action_id: 'act_test',
      action: 'deactivate',
      candidate_id: candidate.candidate_id,
      target: { target_kind: 'instinct' },
      reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
    },
    activationPolicy: defaultActivationPolicy(arcforgeRoot),
    arcforgeRoot,
  });
  if (!result.ok) throw new Error(`deactivate failed: ${result.failure.reason}`);
}

function runInjectContext() {
  const scriptPath = path.join(__dirname, '..', 'session-tracker', 'inject-context.js');
  const result = spawnSync('node', [scriptPath], {
    input: JSON.stringify({
      session_id: 'icl4',
      hook_event_name: 'SessionStart',
      source: 'startup',
      cwd: projectRoot,
      transcript_path: path.join(testDir, 'transcript.jsonl'),
    }),
    env: { ...process.env, HOME: testDir, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0, `inject-context exit non-zero. stderr: ${result.stderr}`);
  return result.stdout;
}

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-icl4-inject-'));
  projectRoot = path.join(testDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  projectName = path.basename(projectRoot);
  arcforgeRoot = path.join(testDir, '.arcforge');
  process.env.HOME = testDir;
  process.env.CLAUDE_PROJECT_DIR = projectRoot;
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

// ---------------------------------------------------------------------------
// Case 1: activated instinct is injected
// ---------------------------------------------------------------------------

describe('ICL-4 activated instinct injection', () => {
  it('injects an activated instinct into SessionStart context', () => {
    const { candidate } = activateCandidate({ trigger: 'inject-me-canary' });
    const stdout = runInjectContext();
    assert.ok(stdout.includes('Active Behavioral Instincts'), `stdout: ${stdout}`);
    assert.ok(stdout.includes(candidate.candidate_id), `stdout: ${stdout}`);
    assert.ok(stdout.includes('inject-me-canary'), `stdout: ${stdout}`);
  });

  // Case 2: deactivated instinct is not injected
  it('does not inject a deactivated instinct', () => {
    const { candidate, activationRecord } = activateCandidate({ trigger: 'deact-canary' });
    deactivateCandidate(candidate, activationRecord);
    const stdout = runInjectContext();
    assert.ok(!stdout.includes('deact-canary'), `deactivated instinct injected. stdout: ${stdout}`);
    assert.ok(
      !stdout.includes('Active Behavioral Instincts'),
      `no instincts should remain. stdout: ${stdout}`,
    );
  });

  // Case 3: a non-activated high-confidence file in the same dir is NOT injected
  it('does not inject a non-activated high-confidence file in the same dir', () => {
    const { candidate } = activateCandidate({ trigger: 'activated-canary' });
    // Hand-place a high-confidence instinct with NO activation record.
    const instinctsDir = path.join(arcforgeRoot, 'instincts', projectName);
    fs.writeFileSync(
      path.join(instinctsDir, 'rogue-high-conf.md'),
      `---\nid: rogue-high-conf\nconfidence: 0.95\ntrigger: rogue-canary\ndomain: workflow\n---\n\n## Action\nshould not inject\n`,
      'utf-8',
    );
    const stdout = runInjectContext();
    assert.ok(
      stdout.includes(candidate.candidate_id),
      `activated should inject. stdout: ${stdout}`,
    );
    assert.ok(!stdout.includes('rogue-canary'), `non-activated injected. stdout: ${stdout}`);
    assert.ok(!stdout.includes('rogue-high-conf'), `non-activated injected. stdout: ${stdout}`);
  });

  // Case 4: kill-switch disables injection
  it('injects nothing when inject_activated_instincts is false (kill-switch)', () => {
    activateCandidate({ trigger: 'killswitch-canary' });
    const configDir = path.join(arcforgeRoot, 'learning');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ scope: 'global', inject_activated_instincts: false }),
      'utf-8',
    );
    const stdout = runInjectContext();
    assert.ok(!stdout.includes('killswitch-canary'), `kill-switch failed. stdout: ${stdout}`);
    assert.ok(
      !stdout.includes('Active Behavioral Instincts'),
      `kill-switch failed. stdout: ${stdout}`,
    );
  });

  // Case 5: cap at 5, ordered by confidence
  it('caps injection at the top 5 activated instincts by confidence', () => {
    // 7 activated instincts; evidence_quality maps to distinct confidences so
    // the top-5 ordering is deterministic. 3 high (0.60), 2 medium (0.55),
    // 2 low (0.50): the two low ones must be dropped.
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(activateCandidate({ evidence_quality: 'high' }).candidate);
    for (let i = 0; i < 2; i++)
      ids.push(activateCandidate({ evidence_quality: 'medium' }).candidate);
    const lows = [];
    for (let i = 0; i < 2; i++) lows.push(activateCandidate({ evidence_quality: 'low' }).candidate);

    const stdout = runInjectContext();
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    const instinctLines = ctx.split('\n').filter((l) => /^- \*\*cand_/.test(l));
    assert.strictEqual(instinctLines.length, 5, `expected 5 lines, got ${instinctLines.length}`);
    // The two lowest-confidence instincts must be the dropped ones.
    for (const low of lows) {
      assert.ok(
        !instinctLines.some((l) => l.includes(low.candidate_id)),
        `lowest-confidence instinct should have been capped out: ${low.candidate_id}`,
      );
    }
  });

  // Case 6: zero-state — no learning, no output
  it('emits no instinct output when nothing is activated (zero-state)', () => {
    const stdout = runInjectContext();
    assert.ok(
      !stdout.includes('Active Behavioral Instincts'),
      `zero-state should be silent. stdout: ${stdout}`,
    );
  });

  // E2E: config false makes the header disappear (re-enabled by default)
  it('header is present by default and disappears when config is false', () => {
    activateCandidate({ trigger: 'e2e-canary' });
    const withInjection = runInjectContext();
    assert.ok(withInjection.includes('Active Behavioral Instincts'), `default ON failed`);

    const configDir = path.join(arcforgeRoot, 'learning');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ scope: 'global', inject_activated_instincts: false }),
      'utf-8',
    );
    const disabled = runInjectContext();
    assert.ok(!disabled.includes('Active Behavioral Instincts'), `config false should silence`);
  });
});
