// tests/scripts/learning-curator-queue-writer.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Setup — redirect HOME to a temp directory for each test using jest.spyOn
// ---------------------------------------------------------------------------

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-test-'));
  // Spy on os.homedir so both the test helpers AND the freshly required module
  // return tmpDir — avoids process.env.HOME propagation issues in Jest.
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function getWriter() {
  // Always require fresh after jest.resetModules()
  return require('../../scripts/lib/learning-curator/queue-writer');
}

// Helper: get candidate store paths using current mocked HOME
function getCandidatesDir() {
  return path.join(os.homedir(), '.arcforge', 'learning', 'candidates');
}

function getQueuePath() {
  return path.join(getCandidatesDir(), 'queue.jsonl');
}

function getRejectionsPath() {
  return path.join(getCandidatesDir(), 'rejections.jsonl');
}

// ---------------------------------------------------------------------------
// Record fixture
// ---------------------------------------------------------------------------

function makeValidRecord(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'cand_instinct_20260521T010000Z_a1b2c3d4e5f6',
    created_at: '2026-05-21T01:00:00.000Z',
    updated_at: '2026-05-21T01:00:00.000Z',
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'arcforge', project_id: 'proj_abc' },
    source: { source_type: 'layer4_llm_curator' },
    name: 'grep before editing',
    summary: 'Always grep for existing patterns before making edits',
    rationale: 'Prevents duplicate code and missed context',
    domain: 'workflow',
    body: 'When editing files, first grep for existing patterns to avoid duplication',
    body_source: 'llm_curator',
    evidence: [
      {
        evidence_id: 'ev_abc123',
        evidence_type: 'observation',
        relevance: 'User repeatedly used grep before editing files',
        summary: 'Observed grep-first pattern 5 times across 3 sessions',
      },
      {
        evidence_id: 'ev_def456',
        evidence_type: 'observation',
        relevance: 'Second observation supporting the pattern',
        summary: 'Confirmed grep-first pattern in another session',
      },
    ],
    evidence_quality: 'medium',
    evidence_quality_metadata: {
      rule_version: 'v1',
      basis: {
        project_obs_count: 500,
        cited_evidence_count: 1,
        cited_evidence_by_type: {
          observation: 1,
          diary: 0,
          reflect: 0,
          recall: 0,
          session_summary: 0,
        },
        has_user_correction: false,
        has_manual_recall: false,
        has_reflect_pattern: false,
        has_error_repair_sequence: false,
      },
    },
    lifecycle: {
      status: 'pending_review',
      status_changed_at: '2026-05-21T01:00:00.000Z',
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
      dedupe_key: 'project:proj_abc:instinct:grep-before-editing',
      dedupe_basis: {
        scope_kind: 'project',
        project_id: 'proj_abc',
        artifact_type: 'instinct',
        normalized_name: 'grep-before-editing',
        normalized_body_hash: 'abc123def456',
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// appendCandidate — valid record goes to queue.jsonl
// ---------------------------------------------------------------------------

describe('appendCandidate — successful append', () => {
  it('writes a JSONL line to queue.jsonl for a valid record', () => {
    const { appendCandidate } = getWriter();
    appendCandidate(makeValidRecord());

    const queuePath = getQueuePath();
    expect(fs.existsSync(queuePath)).toBe(true);

    const lines = fs.readFileSync(queuePath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);

    const event = JSON.parse(lines[0]);
    expect(event.event_type).toBe('candidate.created');
    expect(event.candidate_id).toBe('cand_instinct_20260521T010000Z_a1b2c3d4e5f6');
    expect(event.record).toBeDefined();
    expect(event.schema_version).toBe(1);
  });

  it('does NOT write to rejections.jsonl for a valid record', () => {
    const { appendCandidate } = getWriter();
    appendCandidate(makeValidRecord());

    const rejectPath = getRejectionsPath();
    expect(fs.existsSync(rejectPath)).toBe(false);
  });

  it('creates parent directories if they do not exist', () => {
    const { appendCandidate } = getWriter();
    appendCandidate(makeValidRecord());

    const dir = getCandidatesDir();
    expect(fs.existsSync(dir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// appendCandidate — invalid record goes to rejections.jsonl
// ---------------------------------------------------------------------------

describe('appendCandidate — invalid record rejected', () => {
  it('writes to rejections.jsonl when record is invalid', () => {
    const { appendCandidate } = getWriter();
    const badRecord = makeValidRecord({ artifact_type: 'unknown_type' });
    appendCandidate(badRecord);

    const rejectPath = getRejectionsPath();
    expect(fs.existsSync(rejectPath)).toBe(true);

    const lines = fs.readFileSync(rejectPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
    const rejection = JSON.parse(lines[0]);
    expect(rejection.reasons).toBeDefined();
    expect(rejection.reasons.length).toBeGreaterThan(0);
  });

  it('does NOT write to queue.jsonl when record is invalid', () => {
    const { appendCandidate } = getWriter();
    appendCandidate(makeValidRecord({ artifact_type: 'unknown_type' }));

    const queuePath = getQueuePath();
    expect(fs.existsSync(queuePath)).toBe(false);
  });

  it('rejection record has schema_version 1', () => {
    const { appendCandidate } = getWriter();
    appendCandidate(makeValidRecord({ name: 'x'.repeat(200) }));

    const rejectPath = getRejectionsPath();
    const rejection = JSON.parse(fs.readFileSync(rejectPath, 'utf8').trim());
    expect(rejection.schema_version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// rejectProposal — direct rejection
// ---------------------------------------------------------------------------

describe('rejectProposal', () => {
  it('appends a rejection record with provided reasons', () => {
    const { rejectProposal } = getWriter();
    rejectProposal(
      [{ code: 'schema_invalid', field_path: 'artifact_type', detail: 'test rejection' }],
      { source_type: 'layer4_llm_curator' },
    );

    const rejectPath = getRejectionsPath();
    expect(fs.existsSync(rejectPath)).toBe(true);

    const rejection = JSON.parse(fs.readFileSync(rejectPath, 'utf8').trim());
    expect(rejection.reasons[0].code).toBe('schema_invalid');
    expect(rejection.schema_version).toBe(1);
    expect(rejection.raw_proposal_saved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readCurrentCandidates — replay events
// ---------------------------------------------------------------------------

describe('readCurrentCandidates — event replay', () => {
  it('returns empty map when queue.jsonl does not exist', () => {
    const { readCurrentCandidates } = getWriter();
    const result = readCurrentCandidates();
    expect(result).toEqual({});
  });

  it('returns candidate map after appendCandidate', () => {
    const { appendCandidate, readCurrentCandidates } = getWriter();
    appendCandidate(makeValidRecord());

    const candidates = readCurrentCandidates();
    expect(Object.keys(candidates).length).toBe(1);
    expect(candidates.cand_instinct_20260521T010000Z_a1b2c3d4e5f6).toBeDefined();
    expect(candidates.cand_instinct_20260521T010000Z_a1b2c3d4e5f6.artifact_type).toBe('instinct');
  });

  it('reflects lifecycle transition events (candidate.transitioned)', () => {
    const { appendCandidate, readCurrentCandidates } = getWriter();
    appendCandidate(makeValidRecord());

    // Manually write a transition event
    const queuePath = getQueuePath();
    const transitionEvent = JSON.stringify({
      schema_version: 1,
      event_id: 'evt_trans_001',
      ts: '2026-05-21T02:00:00.000Z',
      candidate_id: 'cand_instinct_20260521T010000Z_a1b2c3d4e5f6',
      event_type: 'candidate.transitioned',
      actor: { layer: 6, actor_type: 'dashboard' },
      previous_status: 'pending_review',
      next_status: 'approved',
      transition: { reason: 'looks good' },
    });
    fs.appendFileSync(queuePath, `\n${transitionEvent}\n`);

    const candidates = readCurrentCandidates();
    const cand = candidates.cand_instinct_20260521T010000Z_a1b2c3d4e5f6;
    expect(cand.lifecycle.status).toBe('approved');
  });

  it('reflects patch events (candidate.updated)', () => {
    const { appendCandidate, readCurrentCandidates } = getWriter();
    appendCandidate(makeValidRecord());

    const queuePath = getQueuePath();
    const patchEvent = JSON.stringify({
      schema_version: 1,
      event_id: 'evt_patch_001',
      ts: '2026-05-21T02:00:00.000Z',
      candidate_id: 'cand_instinct_20260521T010000Z_a1b2c3d4e5f6',
      event_type: 'candidate.updated',
      actor: { layer: 6, actor_type: 'dashboard' },
      patch: { name: 'updated name' },
    });
    fs.appendFileSync(queuePath, `\n${patchEvent}\n`);

    const candidates = readCurrentCandidates();
    const cand = candidates.cand_instinct_20260521T010000Z_a1b2c3d4e5f6;
    expect(cand.name).toBe('updated name');
  });

  it('ignores corrupted trailing line — does not throw', () => {
    const { appendCandidate, readCurrentCandidates } = getWriter();
    appendCandidate(makeValidRecord());

    const queuePath = getQueuePath();
    // Append a corrupted partial line
    fs.appendFileSync(queuePath, '\n{corrupted json line without closing\n');

    // Should not throw; corrupted line ignored
    expect(() => readCurrentCandidates()).not.toThrow();
    const candidates = readCurrentCandidates();
    // The valid event was already appended; corrupted line skipped
    expect(Object.keys(candidates).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Concurrent appends — serialize via store.lock (real processes)
// ---------------------------------------------------------------------------

describe('concurrent appends — locking', () => {
  it('serializes two concurrent appends without data loss', (done) => {
    // Write a worker script that appends one candidate and exits
    const workerScript = path.join(tmpDir, 'worker.js');
    const workerContent = `
const path = require('node:path');
process.env.HOME = ${JSON.stringify(tmpDir)};
// Ensure fresh module load in this worker process
const { appendCandidate } = require(${JSON.stringify(
      path.join(__dirname, '../../scripts/lib/learning-curator/queue-writer'),
    )});
const id = process.argv[2];
appendCandidate({
  schema_version: 1,
  candidate_id: id,
  created_at: '2026-05-21T01:00:00.000Z',
  updated_at: '2026-05-21T01:00:00.000Z',
  artifact_type: 'instinct',
  scope: { kind: 'project', project: 'p', project_id: 'p1' },
  source: { source_type: 'layer4_llm_curator' },
  name: 'x',
  summary: 'x',
  rationale: 'x',
  domain: 'workflow',
  body: 'x',
  body_source: 'llm_curator',
  evidence: [{
    evidence_id: 'e1',
    evidence_type: 'observation',
    relevance: 'r',
    summary: 's',
  }, {
    evidence_id: 'e2',
    evidence_type: 'observation',
    relevance: 'r2',
    summary: 's2',
  }],
  evidence_quality: 'low',
  evidence_quality_metadata: {
    rule_version: 'v1',
    basis: {
      project_obs_count: 0,
      cited_evidence_count: 1,
      cited_evidence_by_type: { observation: 1, diary: 0, reflect: 0, recall: 0, session_summary: 0 },
      has_user_correction: false,
      has_manual_recall: false,
      has_reflect_pattern: false,
      has_error_repair_sequence: false,
    },
  },
  lifecycle: { status: 'pending_review', status_changed_at: '2026-05-21T01:00:00.000Z' },
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
    dedupe_key: 'dk-' + id,
    dedupe_basis: {
      scope_kind: 'project',
      project_id: 'p1',
      artifact_type: 'instinct',
      normalized_name: 'x',
      normalized_body_hash: 'h1',
    },
  },
});
`;
    fs.writeFileSync(workerScript, workerContent);

    const id1 = 'cand_instinct_20260521T010000Z_aaa111222333';
    const id2 = 'cand_instinct_20260521T010001Z_bbb444555666';

    try {
      // Run two processes "concurrently" (fork is non-blocking, both start quickly)
      const { fork } = require('node:child_process');
      let done1 = false;
      let done2 = false;

      function check() {
        if (!done1 || !done2) return;
        const queuePath = getQueuePath();
        const lines = fs
          .readFileSync(queuePath, 'utf8')
          .split('\n')
          .filter((l) => l.trim());
        expect(lines.length).toBe(2);
        const ids = lines.map((l) => JSON.parse(l).candidate_id);
        expect(ids).toContain(id1);
        expect(ids).toContain(id2);
        done();
      }

      const p1 = fork(workerScript, [id1]);
      const p2 = fork(workerScript, [id2]);
      p1.on('exit', () => {
        done1 = true;
        check();
      });
      p2.on('exit', () => {
        done2 = true;
        check();
      });
    } catch (e) {
      done(e);
    }
  }, 10000);
});
