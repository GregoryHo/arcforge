// tests/scripts/learning-dashboard.test.js
//
// Layer 6 dashboard control plane — TDD rewrite per Slice F spec.
// Criterion coverage:
//   Criterion 1: Wire model returns only Layer 6 DashboardCandidateCard allowlist fields.
//   Criterion 2: Server-side action handlers reject Action × Status matrix violations.
//   Criterion 3: actions.jsonl audit log written for accepted AND rejected actions.
//   Criterion 4: Statistical-pipeline dead UI code removed from HTML.
//   Criterion 5: promote eval (covered by dashboard-promote-gate.md scenario).
//   Criterion 6/7: npm test passes + lint passes (not in unit tests — gate only).

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Helper — write a candidate event directly to queue.jsonl, bypassing
// schema validation (for testing edge-case states like empty evidence).
// ---------------------------------------------------------------------------

function writeDirectlyToQueue(record) {
  const queuePath = path.join(os.homedir(), '.arcforge', 'learning', 'candidates', 'queue.jsonl');
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  const event = {
    schema_version: 1,
    event_id: `evt_direct_${crypto.randomBytes(4).toString('hex')}`,
    ts: new Date().toISOString(),
    candidate_id: record.candidate_id,
    event_type: 'candidate.created',
    actor: { layer: 5, actor_type: 'validator' },
    record,
  };
  fs.appendFileSync(queuePath, `${JSON.stringify(event)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Helpers — build a valid Candidate v1 record
// ---------------------------------------------------------------------------

function makeCandidateRecord(overrides = {}) {
  const base = {
    schema_version: 1,
    candidate_id: overrides.candidate_id || `cand-${crypto.randomBytes(4).toString('hex')}`,
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'test-project', project_id: 'proj-abc123' },
    source: { source_type: 'layer4_llm_curator' },
    name: 'use-edit-bash-workflow',
    summary: 'Prefer Edit before Bash in the same turn.',
    rationale: 'Observed in 3 sessions. Edit before Bash reduces round-trips.',
    body: 'When editing files, prefer Edit → Bash over Bash-only.',
    body_source: 'llm_curator',
    domain: 'workflow',
    evidence: [
      {
        evidence_id: 'ev-001',
        evidence_type: 'observation',
        relevance: 'Direct observation of Edit → Bash pattern.',
        summary: 'Edit then Bash seen in session A.',
      },
      {
        evidence_id: 'ev-002',
        evidence_type: 'observation',
        relevance: 'Second observation confirming the pattern.',
        summary: 'Edit then Bash seen in session B.',
      },
    ],
    evidence_quality: 'low',
    evidence_quality_metadata: {
      rule_version: 'v1',
      basis: { project_obs_count: 5 },
    },
    lifecycle: {
      status: 'pending_review',
      status_changed_at: '2026-05-01T00:00:00Z',
    },
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
    dedupe: {
      dedupe_key: 'use-edit-bash-workflow-v1',
      dedupe_basis: { name_hash: 'abc' },
    },
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
  // Allow deep scope override
  if (overrides.scope) base.scope = overrides.scope;
  return base;
}

// ---------------------------------------------------------------------------
// Module-under-test — loaded fresh in beforeEach via jest.resetModules()
// Uses jest.spyOn(os, 'homedir') to redirect ALL os.homedir() calls to tmpDir,
// including those inside freshly required modules.
// ---------------------------------------------------------------------------

let appendCandidate;
let readCurrentCandidates;
let sanitizeDashboardCard;
let sanitizeDashboardDetail;
let createDashboardModel;
let handleDashboardAction;
let createRouter;
let hasDashboardWriteHeader;
let appendTransitionEvent;

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-dash-f-'));
  // Spy on os.homedir so all freshly required modules return tmpDir
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);

  ({
    appendCandidate,
    readCurrentCandidates,
  } = require('../../scripts/lib/learning-curator/queue-writer'));
  ({ appendTransitionEvent } = require('../../scripts/lib/learning-curator/dashboard-events'));
  ({
    sanitizeDashboardCard,
    sanitizeDashboardDetail,
    createDashboardModel,
    handleDashboardAction,
    createRouter,
    hasDashboardWriteHeader,
  } = require('../../scripts/lib/learning-dashboard'));
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// Criterion 1 — Wire model allowlist
// ===========================================================================

describe('wire model — DashboardCandidateCard allowlist (criterion 1)', () => {
  it('returns only allowlisted top-level fields for a card', () => {
    const record = makeCandidateRecord();
    // Test sanitizeDashboardCard directly — deterministic, no queue I/O needed
    const card = sanitizeDashboardCard(record);

    // Required Layer 6 DashboardCandidateCard fields present
    expect(card).toHaveProperty('schema_version', 1);
    expect(card).toHaveProperty('candidate_id');
    expect(card).toHaveProperty('artifact_type');
    expect(card).toHaveProperty('name');
    expect(card).toHaveProperty('summary');
    expect(card).toHaveProperty('domain');
    expect(card).toHaveProperty('lifecycle_status');
    expect(card).toHaveProperty('evidence_quality');
    expect(card).toHaveProperty('evidence_counts');
    expect(card.evidence_counts).toHaveProperty('total');
    expect(card.evidence_counts).toHaveProperty('by_type');
    expect(card).toHaveProperty('risk_note_count');
    expect(card).toHaveProperty('uncertainty_note_count');
    expect(card).toHaveProperty('available_actions');
    expect(Array.isArray(card.available_actions)).toBe(true);
    expect(card).toHaveProperty('scope');
    expect(card).toHaveProperty('created_at');
    expect(card).toHaveProperty('updated_at');

    // Forbidden fields absent
    expect(card).not.toHaveProperty('body');
    expect(card).not.toHaveProperty('rationale');
    expect(card).not.toHaveProperty('trigger');
    expect(card).not.toHaveProperty('evidence');
    expect(card).not.toHaveProperty('dedupe');
    expect(card).not.toHaveProperty('safety');
    expect(card).not.toHaveProperty('source');
    expect(card).not.toHaveProperty('evidence_quality_metadata');
  });

  it('scope does not leak project_id in card wire model', () => {
    const record = makeCandidateRecord({
      scope: { kind: 'project', project: 'my-project', project_id: 'proj-secret-123' },
    });
    const card = sanitizeDashboardCard(record);
    const serialized = JSON.stringify(card);

    expect(card.scope.kind).toBe('project');
    expect(card.scope.project).toBe('my-project');
    expect(card.scope.project_id).toBeUndefined();
    expect(serialized).not.toContain('proj-secret-123');
  });

  it('lifecycle_status is a flat field (not nested under lifecycle)', () => {
    const record = makeCandidateRecord();
    const card = sanitizeDashboardCard(record);

    expect(card.lifecycle_status).toBe('pending_review');
    expect(card).not.toHaveProperty('lifecycle');
  });

  it('summary is capped at 200 characters in card', () => {
    const longSummary = 'A'.repeat(500);
    const record = makeCandidateRecord({ summary: longSummary });
    // Test by calling sanitizeDashboardCard directly (no I/O needed)
    const card = sanitizeDashboardCard(record);

    expect(card.summary.length).toBeLessThanOrEqual(200);
  });

  it('name is capped at 120 characters in card', () => {
    const longName = 'B'.repeat(200);
    const record = makeCandidateRecord({ name: longName });
    const card = sanitizeDashboardCard(record);

    expect(card.name.length).toBeLessThanOrEqual(120);
  });

  it('evidence_counts.total equals number of evidence entries; by_type counts each type', () => {
    const record = makeCandidateRecord({
      evidence: [
        { evidence_id: 'ev-1', evidence_type: 'observation', relevance: 'r1', summary: 's1' },
        { evidence_id: 'ev-2', evidence_type: 'observation', relevance: 'r2', summary: 's2' },
        { evidence_id: 'ev-3', evidence_type: 'diary', relevance: 'r3', summary: 's3' },
      ],
    });
    const card = sanitizeDashboardCard(record);

    expect(card.evidence_counts.total).toBe(3);
    expect(card.evidence_counts.by_type).toEqual({ observation: 2, diary: 1 });
  });

  it('risk_note_count and uncertainty_note_count derived from llm_assessment', () => {
    const record = makeCandidateRecord({
      llm_assessment: {
        llm_confidence: 'medium',
        risk_notes: ['risk-a', 'risk-b'],
        uncertainty_notes: ['unc-1'],
      },
    });
    const card = sanitizeDashboardCard(record);
    expect(card.risk_note_count).toBe(2);
    expect(card.uncertainty_note_count).toBe(1);
  });

  it('available_actions enumerates legal actions for the current status', () => {
    const record = makeCandidateRecord();
    // pending_review allows dismiss/approve/promote/evolve
    const card = sanitizeDashboardCard(record);
    expect(new Set(card.available_actions)).toEqual(
      new Set(['dismiss', 'approve', 'promote', 'evolve']),
    );
  });

  it('available_actions is empty for terminal statuses', () => {
    const record = makeCandidateRecord({
      lifecycle: { status: 'dismissed', status_changed_at: new Date().toISOString() },
    });
    const card = sanitizeDashboardCard(record);
    expect(card.available_actions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Adversarial fixtures — Criterion 1 privacy invariant
// ---------------------------------------------------------------------------

describe('wire model — adversarial secret fixtures (criterion 1 privacy invariant)', () => {
  it('never exposes OPENAI_API_KEY in wire response', () => {
    const record = makeCandidateRecord({
      body: 'Inject OPENAI_API_KEY=sk-real-secret123 into context',
    });
    appendCandidate(record);

    const model = createDashboardModel();
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain('sk-real-secret123');
    // body itself must not be in wire
    expect(serialized).not.toContain('OPENAI_API_KEY=sk-real-secret123');
  });

  it('never exposes Authorization Bearer token in wire response', () => {
    const record = makeCandidateRecord({
      body: 'Authorization: Bearer abc123tokenvalue in headers',
    });
    appendCandidate(record);

    const model = createDashboardModel();
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain('abc123tokenvalue');
  });

  it('never exposes JWT-shaped strings in wire response', () => {
    const jwtLike =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const record = makeCandidateRecord({ body: `Use token: ${jwtLike}` });
    appendCandidate(record);

    const model = createDashboardModel();
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain(jwtLike);
  });

  it('never exposes private key block in wire response', () => {
    const record = makeCandidateRecord({
      body: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAthisisfake\n-----END RSA PRIVATE KEY-----',
    });
    appendCandidate(record);

    const model = createDashboardModel();
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain('MIIEpAIBAAKCAQEAthisisfake');
  });

  it('wire response does not contain raw body text at all', () => {
    const secretBody = 'secret-body-content-should-not-appear';
    const record = makeCandidateRecord({ body: secretBody });
    appendCandidate(record);

    const model = createDashboardModel();
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain(secretBody);
  });
});

// ---------------------------------------------------------------------------
// Detail view (sanitizeDashboardDetail)
// ---------------------------------------------------------------------------

describe('sanitizeDashboardDetail — bounded preview only', () => {
  it('returns allowlisted card fields plus bounded rationale and body_preview', () => {
    const record = makeCandidateRecord({
      rationale: 'Detailed rationale here.',
      body: 'The full body content that should be capped.',
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);

    expect(detail).toHaveProperty('candidate_id');
    expect(detail).toHaveProperty('lifecycle_status');
    expect(detail).toHaveProperty('rationale');
    expect(detail).toHaveProperty('body_preview');
    // Forbidden: raw full body never exposed beyond preview cap
    expect(JSON.stringify(detail)).not.toContain('scope.project_id');
  });

  it('body_preview is capped at 500 chars', () => {
    const record = makeCandidateRecord({ body: 'X'.repeat(600) });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);

    expect(detail.body_preview.text.length).toBeLessThanOrEqual(500);
    expect(detail.body_preview.truncated).toBe(true);
  });

  it('rationale is capped at 500 chars in detail view', () => {
    const record = makeCandidateRecord({ rationale: 'R'.repeat(600) });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);

    expect(detail.rationale.length).toBeLessThanOrEqual(500);
  });

  it('throws NOT_FOUND error for missing candidate_id', () => {
    expect(() => sanitizeDashboardDetail('nonexistent-id')).toThrow();
  });
});

// ===========================================================================
// Criterion 2 — Action × Status matrix enforcement
// ===========================================================================

describe('action handlers — Action × Status matrix (criterion 2)', () => {
  // ---------- dismiss ----------

  it('dismiss from pending_review is accepted', () => {
    const record = makeCandidateRecord({
      lifecycle: { status: 'pending_review', status_changed_at: '2026-05-01T00:00:00Z' },
    });
    appendCandidate(record);

    const result = handleDashboardAction({ action: 'dismiss', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(true);
  });

  it('dismiss from activated is rejected with policy_violation', () => {
    // Can't append an activated record via appendCandidate (pending_review only for new records)
    // so write directly via transition events
    const record = makeCandidateRecord();
    appendCandidate(record);
    // Transition to approved, then materialized, then activated via appendTransitionEvent
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    appendTransitionEvent(record.candidate_id, 'materialize', 'materialized');
    appendTransitionEvent(record.candidate_id, 'activate', 'activated');

    const result = handleDashboardAction({ action: 'dismiss', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('policy_violation');
  });

  // ---------- approve ----------

  it('approve from pending_review is accepted', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({ action: 'approve', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(true);
  });

  it('approve from needs_more_evidence is rejected with policy_violation', () => {
    // Use a dedicated record and write a needs_more_evidence transition directly
    // (bypasses the state machine for test setup — sets up the status we need to test from)
    const record = makeCandidateRecord({ candidate_id: 'needs-more-test' });
    appendCandidate(record);
    appendTransitionEvent('needs-more-test', 'dismiss', 'needs_more_evidence');

    const result = handleDashboardAction({ action: 'approve', candidate_id: 'needs-more-test' });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('policy_violation');
  });

  // ---------- materialize ----------

  it('materialize from approved is accepted', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    const result = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });

    expect(result.accepted).toBe(true);
  });

  it('materialize from pending_review is rejected with policy_violation', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('policy_violation');
  });

  // ---------- activate ----------

  it('activate from materialized is accepted', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    // Use the dashboard materialize action to get both transition event AND draft file on disk
    const matResult = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });
    expect(matResult.accepted).toBe(true);

    const result = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });

    expect(result.accepted).toBe(true);
  });

  it('activate from pending_review is rejected with policy_violation', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({ action: 'activate', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('policy_violation');
  });

  // ---------- promote ----------

  it('promote from pending_review is accepted and creates a new global candidate', () => {
    const record = makeCandidateRecord({
      scope: { kind: 'project', project: 'my-project', project_id: 'proj-999' },
    });
    appendCandidate(record);

    const result = handleDashboardAction({ action: 'promote', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(true);
    // New global candidate must exist in queue
    const candidates = readCurrentCandidates();
    const globalCands = Object.values(candidates).filter(
      (c) => c.scope && c.scope.kind === 'global',
    );
    expect(globalCands.length).toBeGreaterThanOrEqual(1);
    // Source candidate status does NOT change
    expect(candidates[record.candidate_id].lifecycle.status).toBe('pending_review');
    // New global candidate has promoted_from link
    const promoted = globalCands[0];
    expect(promoted.relationships?.promoted_from_candidate_id).toBe(record.candidate_id);
  });

  it('promote from dismissed is rejected with policy_violation', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'dismiss', 'dismissed');

    const result = handleDashboardAction({ action: 'promote', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('policy_violation');
  });

  // ---------- evolve ----------

  it('evolve from approved is accepted', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    const result = handleDashboardAction({ action: 'evolve', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(true);
    // Evolve creates a new skill candidate
    const candidates = readCurrentCandidates();
    const skillCands = Object.values(candidates).filter((c) => c.artifact_type === 'skill');
    expect(skillCands.length).toBeGreaterThanOrEqual(1);
    // Source status does NOT change
    expect(candidates[record.candidate_id].lifecycle.status).toBe('approved');
  });

  it('evolve from needs_more_evidence is rejected with policy_violation', () => {
    const record = makeCandidateRecord({ candidate_id: 'evolve-needs-more' });
    appendCandidate(record);
    appendTransitionEvent('evolve-needs-more', 'dismiss', 'needs_more_evidence');

    const result = handleDashboardAction({ action: 'evolve', candidate_id: 'evolve-needs-more' });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('policy_violation');
  });

  // ---------- candidate not found ----------

  it('returns 404 when candidate_id is not found', () => {
    const result = handleDashboardAction({ action: 'dismiss', candidate_id: 'nonexistent' });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('candidate_not_found');
  });

  it('returns error when action is not in the valid action set', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({ action: 'hack', candidate_id: record.candidate_id });

    expect(result.accepted).toBe(false);
  });

  it('status-changing action persists transition via queue.jsonl', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    handleDashboardAction({ action: 'approve', candidate_id: record.candidate_id });

    const candidates = readCurrentCandidates();
    expect(candidates[record.candidate_id].lifecycle.status).toBe('approved');
  });
});

// ===========================================================================
// Criterion 3 — Audit log
// ===========================================================================

describe('audit log — actions.jsonl (criterion 3)', () => {
  function getAuditLogPath() {
    return path.join(tmpDir, '.arcforge', 'learning', 'dashboard', 'actions.jsonl');
  }

  it('accepted action writes audit line to actions.jsonl', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    handleDashboardAction({ action: 'approve', candidate_id: record.candidate_id });

    expect(fs.existsSync(getAuditLogPath())).toBe(true);
    const lines = fs.readFileSync(getAuditLogPath(), 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.accepted).toBe(true);
    expect(entry.action).toBe('approve');
    expect(entry.candidate_id).toBe(record.candidate_id);
    expect(entry.action_id).toBeTruthy();
    expect(entry.requested_at).toBeTruthy();
  });

  it('rejected action ALSO writes audit line to actions.jsonl', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    // materialize from pending_review — illegal
    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });

    expect(fs.existsSync(getAuditLogPath())).toBe(true);
    const lines = fs.readFileSync(getAuditLogPath(), 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.accepted).toBe(false);
    expect(entry.reason).toBe('policy_violation');
  });

  it('concurrent actions both produce audit lines', async () => {
    const record1 = makeCandidateRecord({ candidate_id: 'conc-1' });
    const record2 = makeCandidateRecord({ candidate_id: 'conc-2' });
    appendCandidate(record1);
    appendCandidate(record2);

    await Promise.all([
      Promise.resolve(handleDashboardAction({ action: 'approve', candidate_id: 'conc-1' })),
      Promise.resolve(handleDashboardAction({ action: 'approve', candidate_id: 'conc-2' })),
    ]);

    const lines = fs.readFileSync(getAuditLogPath(), 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const entries = lines.map((l) => JSON.parse(l));
    const ids = entries.map((e) => e.candidate_id);
    expect(ids).toContain('conc-1');
    expect(ids).toContain('conc-2');
  });

  it('audit log record includes required fields', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    handleDashboardAction({ action: 'dismiss', candidate_id: record.candidate_id });

    const line = fs.readFileSync(getAuditLogPath(), 'utf8').trim();
    const entry = JSON.parse(line);
    expect(entry).toHaveProperty('action_id');
    expect(entry).toHaveProperty('requested_at');
    expect(entry).toHaveProperty('action');
    expect(entry).toHaveProperty('candidate_id');
    expect(entry).toHaveProperty('accepted');
  });
});

// ===========================================================================
// Criterion 4 — HTML snapshot: no statistical-pipeline dead code
// ===========================================================================

describe('HTML — statistical-pipeline dead code removed (criterion 4)', () => {
  it('HTML does not contain retired statistical concepts', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const retired = [
      'Workflow Candidate',
      'Outcome Repair',
      'buildWorkflowCandidate',
      'Statistical analyzer',
      'statistical',
      'artifact_type_label',
      'status_label',
      'next_user_action',
      'can_draft',
      'can_apply',
    ];
    for (const term of retired) {
      expect(html.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it('HTML contains a candidates endpoint fetch and action buttons', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Should fetch from /api/candidates
    expect(html).toContain('/api/candidates');
    // Should have action buttons defined
    expect(html).toMatch(/dismiss|approve|promote/i);
  });

  it('HTML exposes every lifecycle action in ACTION_LABELS and ACTION_AVAILABLE_FROM', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    for (const action of [
      'dismiss',
      'approve',
      'materialize',
      'activate',
      'deactivate',
      'promote',
      'evolve',
    ]) {
      expect(html).toMatch(new RegExp(`${action}:\\s*'[A-Z][a-z]+'`));
      expect(html).toMatch(new RegExp(`${action}:\\s*\\[[^\\]]+\\]`));
    }
  });

  it('HTML contains evidence_quality_chip CSS classes', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('chip-low_signal');
    expect(html).toContain('chip-medium_signal');
    expect(html).toContain('chip-high_signal');
  });

  it('HTML renders evidence_quality_chip pill on card', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('evidence_quality_chip');
  });

  it('HTML renders evidence_counts breakdown on card', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('evidence_counts');
  });

  it('HTML renders risk and uncertainty count badges on card', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('risk_note_count');
    expect(html).toContain('uncertainty_note_count');
  });

  it('HTML renders evidence_summaries section in detail view', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('evidence_summaries');
  });

  it('HTML renders llm_assessment block in detail view', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('llm_assessment');
  });

  it('HTML renders materialization and activation status blocks in detail view', () => {
    const htmlPath = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('materialization');
    expect(html).toContain('activation');
  });
});

// ===========================================================================
// HTTP routes — createRouter wiring
// ===========================================================================

describe('HTTP routes — createRouter', () => {
  async function routeRequest(router, { method = 'GET', url = '/', headers = {}, body = '' } = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: '127.0.0.1', ...headers };
    req.destroy = () => req.emit('error', new Error('destroyed'));

    const res = {
      statusCode: undefined,
      headers: undefined,
      body: '',
      writeHead(statusCode, responseHeaders) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(chunk = '') {
        this.body += chunk;
      },
    };

    const promise = router(req, res);
    process.nextTick(() => {
      if (body) req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body));
      req.emit('end');
    });
    await promise;
    return res;
  }

  it('GET /api/candidates returns candidate list', async () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'tok' });
    const res = await routeRequest(router, { url: '/api/candidates' });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.candidates).toHaveLength(1);
    expect(data.candidates[0].candidate_id).toBe(record.candidate_id);
  });

  it('GET /api/candidates/:id returns detail view', async () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'tok' });
    const res = await routeRequest(router, { url: `/api/candidates/${record.candidate_id}` });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.candidate_id).toBe(record.candidate_id);
    expect(data).toHaveProperty('body_preview');
  });

  it('POST /api/candidates/:id/action requires write token', async () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'expected' });
    const res = await routeRequest(router, {
      method: 'POST',
      url: `/api/candidates/${record.candidate_id}/action`,
      headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'wrong' },
      body: JSON.stringify({ action: 'approve' }),
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /api/candidates/:id/action with valid token performs action', async () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'valid-tok' });
    const res = await routeRequest(router, {
      method: 'POST',
      url: `/api/candidates/${record.candidate_id}/action`,
      headers: {
        'x-arcforge-dashboard': '1',
        'x-arcforge-dashboard-token': 'valid-tok',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'approve' }),
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.accepted).toBe(true);
  });

  it('POST rejects oversized bodies before acting', async () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'tok' });
    const res = await routeRequest(router, {
      method: 'POST',
      url: `/api/candidates/${record.candidate_id}/action`,
      headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'tok' },
      body: Buffer.alloc(70 * 1024, 'x'),
    });

    expect(res.statusCode).toBe(400);
  });

  it('hasDashboardWriteHeader validates presence of both header + token', () => {
    expect(hasDashboardWriteHeader({ headers: {} })).toBe(false);
    expect(hasDashboardWriteHeader({ headers: { 'x-arcforge-dashboard': '1' } })).toBe(false);
    expect(
      hasDashboardWriteHeader(
        { headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'wrong' } },
        'expected',
      ),
    ).toBe(false);
    expect(
      hasDashboardWriteHeader(
        { headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'right' } },
        'right',
      ),
    ).toBe(true);
  });

  it('GET / returns HTML body', async () => {
    const router = createRouter({ htmlBody: '<html>test-dashboard</html>', writeToken: 'tok' });
    const res = await routeRequest(router, { url: '/' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('test-dashboard');
  });

  it('unknown routes return 404', async () => {
    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'tok' });
    const res = await routeRequest(router, { url: '/unknown/path' });

    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// Slice G — Dashboard re-wire (DH-1..DH-5)
// ===========================================================================

describe('DH-1: materialize action calls materialize.js module', () => {
  it('successful materialize writes a draft file on disk (proof of module call)', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    const result = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });

    expect(result.accepted).toBe(true);

    // Proof: a draft file must exist under .arcforge/learning/drafts/
    const draftsBase = path.join(tmpDir, '.arcforge', 'learning', 'drafts');
    expect(fs.existsSync(draftsBase)).toBe(true);
    const candidateDirs = fs.readdirSync(draftsBase).filter((f) => !f.endsWith('.jsonl'));
    expect(candidateDirs.length).toBeGreaterThan(0);
  });

  it('materialize failure propagates as accepted: false with reason', () => {
    // Attempt materialize from pending_review (not approved) — should fail
    const record = makeCandidateRecord({
      lifecycle: { status: 'pending_review', status_changed_at: '2026-05-21T00:00:00Z' },
    });
    appendCandidate(record);

    // Force an invalid path: candidate name with traversal — materialize.js will reject
    const badRecord = makeCandidateRecord({
      candidate_id: `cand_badname_${crypto.randomBytes(4).toString('hex')}`,
      name: '../../../etc/passwd',
    });
    appendCandidate(badRecord);
    appendTransitionEvent(badRecord.candidate_id, 'approve', 'approved');

    const result = handleDashboardAction({
      action: 'materialize',
      candidate_id: badRecord.candidate_id,
    });

    // materialize.js should reject with path_policy_rejected
    expect(result.accepted).toBe(false);
  });
});

describe('DH-2: activate action calls activate.js module', () => {
  it('successful activate writes active file on disk (proof of module call)', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });
    appendTransitionEvent(record.candidate_id, 'materialize', 'materialized');

    const result = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });

    expect(result.accepted).toBe(true);

    // Proof: an active instinct file must exist
    const instinctsBase = path.join(tmpDir, '.arcforge', 'instincts');
    expect(fs.existsSync(instinctsBase)).toBe(true);
  });

  it('activate fails gracefully when no materialization record exists', () => {
    // Candidate is in materialized status but no materialization.json on disk
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    appendTransitionEvent(record.candidate_id, 'materialize', 'materialized');
    // No actual materialize.js call — so no draft file on disk

    const result = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
    });

    // activate.js should fail because there is no materialization record on disk
    expect(result.accepted).toBe(false);
  });
});

describe('DH-3: no double transition events on success', () => {
  it('materialize action emits exactly 1 transition event total', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });

    const {
      readCurrentCandidates: rcc,
    } = require('../../scripts/lib/learning-curator/queue-writer');
    const candidates = rcc();
    expect(candidates[record.candidate_id].lifecycle.status).toBe('materialized');

    // Count transition events for this candidate
    const queuePath = path.join(tmpDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl');
    const lines = fs
      .readFileSync(queuePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const transitionEvents = lines.filter(
      (e) =>
        e.event_type === 'candidate.transitioned' &&
        e.candidate_id === record.candidate_id &&
        e.action === 'materialize',
    );
    // Exactly 1 transition event for this materialize action (not 2)
    expect(transitionEvents.length).toBe(1);
  });
});

describe('DH-4: dashboard synthesizes reviewer_ack (does not pass from HTTP body)', () => {
  it('handleDashboardAction does not require reviewer_ack in the action input', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    // Call handleDashboardAction without reviewer_ack in the opts
    const result = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
      // No reviewer_ack passed — dashboard synthesizes it
    });

    expect(result.accepted).toBe(true);
  });
});

describe('DH-5: audit log still written on materialize/activate', () => {
  function getAuditLogPath() {
    return path.join(tmpDir, '.arcforge', 'learning', 'dashboard', 'actions.jsonl');
  }

  it('materialize action writes to actions.jsonl', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });

    expect(fs.existsSync(getAuditLogPath())).toBe(true);
    const lines = fs.readFileSync(getAuditLogPath(), 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[0]);
    expect(entry.action).toBe('materialize');
    expect(entry.candidate_id).toBe(record.candidate_id);
  });
});

describe('DH-6: deactivate action calls deactivate.js module', () => {
  it('deactivate → active file gone, .disabled/ archive exists, exactly 1 deactivate transition event', () => {
    // Set up: pending_review → approve → materialize → activate
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    const matResult = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });
    expect(matResult.accepted).toBe(true);

    const actResult = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });
    expect(actResult.accepted).toBe(true);

    // Verify active file exists before deactivate. Active instinct files are
    // keyed by the NAME slug (scope.project) — the injection-side key — not the
    // hashed scope.project_id (ICL-3 keyspace unification).
    const instinctsBase = path.join(tmpDir, '.arcforge', 'instincts');
    const scopeDir = record.scope.project || 'unknown';
    const activePath = path.join(instinctsBase, scopeDir, `${record.candidate_id}.md`);
    expect(fs.existsSync(activePath)).toBe(true);

    // Deactivate
    const deactResult = handleDashboardAction({
      action: 'deactivate',
      candidate_id: record.candidate_id,
      safety_ack: { reviewer_saw_behavior_change_warning: true },
    });
    expect(deactResult.accepted).toBe(true);

    // Active file should be gone
    expect(fs.existsSync(activePath)).toBe(false);

    // .disabled/ archive should contain the archived file
    const disabledDir = path.join(instinctsBase, scopeDir, '.disabled');
    expect(fs.existsSync(disabledDir)).toBe(true);
    const disabledFiles = fs.readdirSync(disabledDir);
    expect(disabledFiles.length).toBeGreaterThan(0);
    const archivedFile = disabledFiles.find((f) => f.startsWith(record.candidate_id));
    expect(archivedFile).toBeTruthy();

    // Exactly 1 deactivate transition event in queue.jsonl
    const queuePath = path.join(tmpDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl');
    const lines = fs
      .readFileSync(queuePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const deactivateEvents = lines.filter(
      (e) =>
        e.event_type === 'candidate.transitioned' &&
        e.candidate_id === record.candidate_id &&
        e.action === 'deactivate',
    );
    expect(deactivateEvents.length).toBe(1);

    // Candidate lifecycle status must read as deactivated
    const {
      readCurrentCandidates: rcc,
    } = require('../../scripts/lib/learning-curator/queue-writer');
    expect(rcc()[record.candidate_id].lifecycle.status).toBe('deactivated');
  });
});

// ===========================================================================
// PR-D Criterion 1 — evidence_quality_chip + relationships on card
// ===========================================================================

describe('PR-D Criterion 1 — evidence_quality_chip and relationships on card', () => {
  it('evidence_quality_chip is derived correctly from evidence_quality', () => {
    for (const [quality, chip] of [
      ['low', 'low_signal'],
      ['medium', 'medium_signal'],
      ['high', 'high_signal'],
    ]) {
      const record = makeCandidateRecord({ evidence_quality: quality });
      const card = sanitizeDashboardCard(record);
      expect(card.evidence_quality_chip).toBe(chip);
    }
  });

  it('evidence_quality_chip is omitted when evidence_quality is absent', () => {
    const record = makeCandidateRecord({ evidence_quality: undefined });
    const card = sanitizeDashboardCard(record);
    expect(card).not.toHaveProperty('evidence_quality_chip');
  });

  it('relationships is copied from candidate if present', () => {
    const record = makeCandidateRecord({
      relationships: { promoted_from_candidate_id: 'cand-parent-001' },
    });
    const card = sanitizeDashboardCard(record);
    expect(card.relationships).toEqual({ promoted_from_candidate_id: 'cand-parent-001' });
  });

  it('relationships is absent from card if candidate has none', () => {
    const record = makeCandidateRecord();
    const card = sanitizeDashboardCard(record);
    expect(card).not.toHaveProperty('relationships');
  });
});

// ===========================================================================
// PR-D Criterion 2 — expected_current_status optimistic concurrency
// ===========================================================================

describe('PR-D Criterion 2 — expected_current_status stale guard', () => {
  it('stale expected_current_status → rejected with stale_status', () => {
    const record = makeCandidateRecord({
      lifecycle: { status: 'pending_review', status_changed_at: '2026-05-01T00:00:00Z' },
    });
    appendCandidate(record);

    // Client thinks status is 'approved' but it's really 'pending_review'
    const result = handleDashboardAction({
      action: 'dismiss',
      candidate_id: record.candidate_id,
      expected_current_status: 'approved',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('stale_status');
    expect(result.expected).toBe('approved');
    expect(result.current).toBe('pending_review');
  });

  it('matching expected_current_status → proceeds normally', () => {
    const record = makeCandidateRecord({
      lifecycle: { status: 'pending_review', status_changed_at: '2026-05-01T00:00:00Z' },
    });
    appendCandidate(record);

    const result = handleDashboardAction({
      action: 'dismiss',
      candidate_id: record.candidate_id,
      expected_current_status: 'pending_review',
    });

    expect(result.accepted).toBe(true);
  });

  it('absent expected_current_status → degrades gracefully (backward compat)', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({
      action: 'dismiss',
      candidate_id: record.candidate_id,
      // no expected_current_status
    });

    expect(result.accepted).toBe(true);
  });

  it('null expected_current_status → degrades gracefully', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({
      action: 'dismiss',
      candidate_id: record.candidate_id,
      expected_current_status: null,
    });

    expect(result.accepted).toBe(true);
  });

  it('stale_status check emits 409 from HTTP router', async () => {
    const { EventEmitter } = require('node:events');

    async function routeRequest(
      router,
      { method = 'GET', url = '/', headers = {}, body = '' } = {},
    ) {
      const req = new EventEmitter();
      req.method = method;
      req.url = url;
      req.headers = { host: '127.0.0.1', ...headers };
      req.destroy = () => req.emit('error', new Error('destroyed'));
      const res = {
        statusCode: undefined,
        headers: undefined,
        body: '',
        writeHead(statusCode, responseHeaders) {
          this.statusCode = statusCode;
          this.headers = responseHeaders;
        },
        end(chunk = '') {
          this.body += chunk;
        },
      };
      const promise = router(req, res);
      process.nextTick(() => {
        if (body) req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body));
        req.emit('end');
      });
      await promise;
      return res;
    }

    const record = makeCandidateRecord({
      lifecycle: { status: 'pending_review', status_changed_at: '2026-05-01T00:00:00Z' },
    });
    appendCandidate(record);

    const router = createRouter({ htmlBody: '<html></html>', writeToken: 'tok' });
    const res = await routeRequest(router, {
      method: 'POST',
      url: `/api/candidates/${record.candidate_id}/action`,
      headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'tok' },
      body: JSON.stringify({ action: 'dismiss', expected_current_status: 'approved' }),
    });

    expect(res.statusCode).toBe(409);
    const data = JSON.parse(res.body);
    expect(data.reason).toBe('stale_status');
  });
});

// ===========================================================================
// PR-D Criterion 3 — safety_ack required for activate / deactivate
// ===========================================================================

describe('PR-D Criterion 3 — safety_ack gate on activate / deactivate', () => {
  it('activate without safety_ack is rejected with missing_safety_ack', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });

    const result = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      // no safety_ack
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('missing_safety_ack');
  });

  it('activate with partial safety_ack (behavior_change only) is rejected', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });

    const result = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: { reviewer_saw_behavior_change_warning: true },
      // missing reviewer_saw_target_path_summary
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('missing_safety_ack');
  });

  it('activate with full safety_ack succeeds', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });

    const result = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });

    expect(result.accepted).toBe(true);
  });

  it('deactivate without safety_ack is rejected with missing_safety_ack', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    const matResult = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });
    expect(matResult.accepted).toBe(true);
    handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });

    const result = handleDashboardAction({
      action: 'deactivate',
      candidate_id: record.candidate_id,
      // no safety_ack
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('missing_safety_ack');
  });

  it('deactivate with reviewer_saw_behavior_change_warning: true succeeds', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');
    const matResult = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });
    expect(matResult.accepted).toBe(true);
    handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });

    const result = handleDashboardAction({
      action: 'deactivate',
      candidate_id: record.candidate_id,
      safety_ack: { reviewer_saw_behavior_change_warning: true },
    });

    expect(result.accepted).toBe(true);
  });

  it('non-activate/deactivate actions do not require safety_ack', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    const result = handleDashboardAction({
      action: 'dismiss',
      candidate_id: record.candidate_id,
      // no safety_ack
    });

    expect(result.accepted).toBe(true);
  });
});

// ===========================================================================
// PR-D Criterion 4 — actor default + reason to audit log
// ===========================================================================

describe('PR-D Criterion 4 — actor default and reason in audit log', () => {
  function getAuditLogPath() {
    return path.join(tmpDir, '.arcforge', 'learning', 'dashboard', 'actions.jsonl');
  }

  it('absent actor defaults to { layer: 6, actor_type: "dashboard", reviewer: "local_user" }', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    handleDashboardAction({ action: 'dismiss', candidate_id: record.candidate_id });

    const line = fs.readFileSync(getAuditLogPath(), 'utf8').trim();
    const entry = JSON.parse(line);
    expect(entry.actor).toEqual({ layer: 6, actor_type: 'dashboard', reviewer: 'local_user' });
  });

  it('reason is written to audit log when provided', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    handleDashboardAction({
      action: 'dismiss',
      candidate_id: record.candidate_id,
      reason: 'not relevant to this project',
    });

    const line = fs.readFileSync(getAuditLogPath(), 'utf8').trim();
    const entry = JSON.parse(line);
    expect(entry.reason).toBe('not relevant to this project');
  });

  it('absent reason does not add reason field to audit log', () => {
    const record = makeCandidateRecord();
    appendCandidate(record);

    handleDashboardAction({ action: 'dismiss', candidate_id: record.candidate_id });

    const line = fs.readFileSync(getAuditLogPath(), 'utf8').trim();
    const entry = JSON.parse(line);
    expect(entry).not.toHaveProperty('reason');
  });
});

// ===========================================================================
// PR-D Criterion 5 — detail view new blocks
// ===========================================================================

describe('PR-D Criterion 5 — detail view evidence_summaries / llm_assessment / materialization / activation', () => {
  it('evidence_summaries maps evidence[] to { evidence_id, evidence_type, relevance, summary }', () => {
    const record = makeCandidateRecord({
      evidence: [
        {
          evidence_id: 'ev-1',
          evidence_type: 'observation',
          relevance: 'direct use',
          summary: 'Seen in session A',
        },
        {
          evidence_id: 'ev-2',
          evidence_type: 'diary',
          relevance: 'indirect',
          summary: 'Mentioned in diary',
        },
      ],
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);

    expect(detail).toHaveProperty('evidence_summaries');
    expect(detail.evidence_summaries).toHaveLength(2);
    expect(detail.evidence_summaries[0]).toMatchObject({
      evidence_id: 'ev-1',
      evidence_type: 'observation',
    });
    expect(detail.evidence_summaries[0]).toHaveProperty('relevance');
    expect(detail.evidence_summaries[0]).toHaveProperty('summary');
  });

  it('evidence_summaries is empty array when candidate has no evidence', () => {
    // Write directly to queue bypassing schema validation (0 evidence is below MIN_EVIDENCE_REFS)
    const record = makeCandidateRecord({ evidence: [] });
    writeDirectlyToQueue(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(detail.evidence_summaries).toEqual([]);
  });

  it('llm_assessment is included in detail view if present on candidate', () => {
    const record = makeCandidateRecord({
      llm_assessment: {
        llm_confidence: 'high',
        risk_notes: ['risk A'],
        uncertainty_notes: [],
      },
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(detail.llm_assessment).toBeDefined();
    expect(detail.llm_assessment.llm_confidence).toBe('high');
  });

  it('llm_assessment is absent from detail if not on candidate', () => {
    const record = makeCandidateRecord({ llm_assessment: undefined });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(detail).not.toHaveProperty('llm_assessment');
  });

  it('materialization is included in detail if lifecycle.materialization is present', () => {
    const record = makeCandidateRecord({
      lifecycle: {
        status: 'materialized',
        status_changed_at: '2026-05-01T00:00:00Z',
        materialization: { materialization_id: 'mat-001', materialized_at: '2026-05-01T00:00:00Z' },
      },
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(detail.materialization).toBeDefined();
    expect(detail.materialization.materialization_id).toBe('mat-001');
  });

  it('activation is included in detail if lifecycle.activation is present', () => {
    const record = makeCandidateRecord({
      lifecycle: {
        status: 'activated',
        status_changed_at: '2026-05-01T00:00:00Z',
        activation: { activation_id: 'act-001', activated_at: '2026-05-01T00:00:00Z' },
      },
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(detail.activation).toBeDefined();
    expect(detail.activation.activation_id).toBe('act-001');
  });

  it('evidence_summaries — secret in evidence.summary does not leak', () => {
    const secretKey = 'sk-secret-evidence-key-99999';
    const record = makeCandidateRecord({
      evidence: [
        {
          evidence_id: 'ev-sec',
          evidence_type: 'observation',
          relevance: 'test relevance',
          summary: `API_KEY=${secretKey} was used in the session`,
        },
        {
          evidence_id: 'ev-sec2',
          evidence_type: 'observation',
          relevance: 'second evidence',
          summary: 'Clean evidence entry',
        },
      ],
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(secretKey);
  });

  it('llm_assessment — secret in risk_notes does not leak', () => {
    const secretKey = 'sk-llm-risk-leak-12345';
    const record = makeCandidateRecord({
      llm_assessment: {
        llm_confidence: 'medium',
        risk_notes: [`Observed API_KEY=${secretKey} in the agent's output`],
        uncertainty_notes: [],
      },
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(JSON.stringify(detail)).not.toContain(secretKey);
  });

  it('materialization — API_KEY in a string field is redacted', () => {
    const secretKey = 'sk-materialize-leak-77777';
    const record = makeCandidateRecord({
      lifecycle: {
        status: 'materialized',
        status_changed_at: new Date().toISOString(),
        materialization: {
          materialization_id: 'mat-test',
          reviewer_note: `Looked at draft; API_KEY=${secretKey} was visible in the body.`,
        },
      },
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(JSON.stringify(detail)).not.toContain(secretKey);
  });

  it('activation — API_KEY in target_summary is redacted', () => {
    const secretKey = 'sk-activate-leak-88888';
    const record = makeCandidateRecord({
      lifecycle: {
        status: 'activated',
        status_changed_at: new Date().toISOString(),
        activation: {
          activation_id: 'act-test',
          target_summary: `Token: API_KEY=${secretKey} embedded`,
        },
      },
    });
    appendCandidate(record);

    const detail = sanitizeDashboardDetail(record.candidate_id);
    expect(JSON.stringify(detail)).not.toContain(secretKey);
  });
});
