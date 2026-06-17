// tests/scripts/instinct-curator-lifecycle.test.js
//
// ICL-6: confirm/contradict on a curator-activated instinct must align the
// Layer 5 candidate lifecycle.
//
// - contradiction-archive on an activated candidate appends a `deactivate`
//   lifecycle transition (gated through lifecycle.isLegalAction), so the
//   dashboard shows it deactivated. The instinct file stays in its own
//   archived/ dir — no activate.js .disabled/ move, no reviewer_ack.
// - confirm/contradict mirror running feedback counts back to the candidate
//   record so the dashboard card matches the instinct frontmatter.
// - a non-curator instinct (no matching candidate) produces no event and no
//   crash.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-curator-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function getInstinct() {
  return require('../../skills/arc-observing/scripts/instinct');
}

function getWriter() {
  return require('../../scripts/lib/learning-curator/queue-writer');
}

function getDashboardEvents() {
  return require('../../scripts/lib/learning-curator/dashboard-events');
}

function getDashboard() {
  return require('../../scripts/lib/learning-dashboard');
}

const PROJECT = 'arcforge';
const CANDIDATE_ID = 'cand_instinct_20260521T010000Z_a1b2c3d4e5f6';

// Minimal valid CandidateQueueRecord (mirrors the queue-writer test fixture).
function makeValidRecord(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: CANDIDATE_ID,
    created_at: '2026-05-21T01:00:00.000Z',
    updated_at: '2026-05-21T01:00:00.000Z',
    artifact_type: 'instinct',
    scope: { kind: 'project', project: PROJECT, project_id: 'proj_abc' },
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

// Seed an activated curator candidate in the HOME-global candidate store by
// replaying lifecycle transitions through the event log.
function seedActivatedCandidate() {
  const { appendCandidate } = getWriter();
  const { appendTransitionEvent } = getDashboardEvents();
  appendCandidate(makeValidRecord());
  appendTransitionEvent(CANDIDATE_ID, 'approve', 'approved');
  appendTransitionEvent(CANDIDATE_ID, 'materialize', 'materialized');
  appendTransitionEvent(CANDIDATE_ID, 'activate', 'activated');
}

function instinctsDir() {
  return path.join(tmpDir, '.arcforge', 'instincts', PROJECT);
}

// Write a curator-sourced active instinct file (id == candidate_id).
function writeCuratorInstinct(
  id,
  { confidence = 0.5, confirmations = 0, contradictions = 0 } = {},
) {
  const dir = instinctsDir();
  fs.mkdirSync(dir, { recursive: true });
  const content = `---
id: ${id}
trigger: "when editing"
domain: workflow
source: curator
confidence: ${confidence.toFixed(2)}
extracted: 2026-05-21
last_confirmed: 2026-05-21
confirmations: ${confirmations}
contradictions: ${contradictions}
---

# ${id}

## Action
Grep before editing.`;
  fs.writeFileSync(path.join(dir, `${id}.md`), content, 'utf-8');
}

function readQueueEvents() {
  const queuePath = path.join(tmpDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl');
  if (!fs.existsSync(queuePath)) return [];
  return fs
    .readFileSync(queuePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('ICL-6: contradiction-archive deactivates a curator-activated candidate', () => {
  it('repeated contradict to archive appends a deactivate transition event', () => {
    seedActivatedCandidate();
    writeCuratorInstinct(CANDIDATE_ID, { confidence: 0.5 });

    const { cmdContradict } = getInstinct();
    // 0.50 → 0.40 → 0.30 → 0.20 → 0.10 (< ARCHIVE_THRESHOLD 0.15)
    for (let i = 0; i < 4; i++) {
      cmdContradict(CANDIDATE_ID, PROJECT);
    }

    // Active file moved to the instinct's own archived/ dir (NOT .disabled/).
    expect(fs.existsSync(path.join(instinctsDir(), `${CANDIDATE_ID}.md`))).toBe(false);
    expect(fs.existsSync(path.join(instinctsDir(), 'archived', `${CANDIDATE_ID}.md`))).toBe(true);
    expect(fs.existsSync(path.join(instinctsDir(), '.disabled'))).toBe(false);

    const events = readQueueEvents();
    const deactivateEvents = events.filter(
      (e) =>
        e.event_type === 'candidate.transitioned' &&
        e.action === 'deactivate' &&
        e.candidate_id === CANDIDATE_ID,
    );
    expect(deactivateEvents.length).toBe(1);
    expect(deactivateEvents[0].next_status).toBe('deactivated');
    // Honest actor — NOT the dashboard.
    expect(deactivateEvents[0].actor.actor_type).toBe('instinct_cli');
  });

  it('dashboard shows the candidate deactivated after archive (lifecycle.status)', () => {
    seedActivatedCandidate();
    writeCuratorInstinct(CANDIDATE_ID, { confidence: 0.5 });

    const { cmdContradict } = getInstinct();
    for (let i = 0; i < 4; i++) {
      cmdContradict(CANDIDATE_ID, PROJECT);
    }

    const { readCurrentCandidates } = getWriter();
    const candidate = readCurrentCandidates()[CANDIDATE_ID];
    // lifecycle.status assertion — proves the curator store (not legacy file) was read.
    expect(candidate.lifecycle.status).toBe('deactivated');

    const { createDashboardModel } = getDashboard();
    const card = createDashboardModel().candidates.find((c) => c.candidate_id === CANDIDATE_ID);
    expect(card.lifecycle_status).toBe('deactivated');
  });

  it('a single contradiction (no archive) does NOT deactivate', () => {
    seedActivatedCandidate();
    writeCuratorInstinct(CANDIDATE_ID, { confidence: 0.5 });

    const { cmdContradict } = getInstinct();
    cmdContradict(CANDIDATE_ID, PROJECT); // 0.50 → 0.40, no archive

    const deactivateEvents = readQueueEvents().filter(
      (e) => e.event_type === 'candidate.transitioned' && e.action === 'deactivate',
    );
    expect(deactivateEvents.length).toBe(0);

    const { readCurrentCandidates } = getWriter();
    expect(readCurrentCandidates()[CANDIDATE_ID].lifecycle.status).toBe('activated');
  });
});

describe('ICL-6: non-curator instinct → no event, no crash', () => {
  it('contradicting an instinct with no matching candidate writes no transition and does not throw', () => {
    // No candidate seeded in the store — only a plain (non-curator) instinct file.
    writeCuratorInstinct('orphan-pattern', { confidence: 0.5 });

    const { cmdContradict } = getInstinct();
    expect(() => {
      for (let i = 0; i < 4; i++) {
        cmdContradict('orphan-pattern', PROJECT);
      }
    }).not.toThrow();

    expect(readQueueEvents()).toEqual([]);
  });

  it('confirming an instinct with no matching candidate does not throw', () => {
    writeCuratorInstinct('orphan-pattern', { confidence: 0.5 });
    const { cmdConfirm } = getInstinct();
    expect(() => cmdConfirm('orphan-pattern', PROJECT)).not.toThrow();
    expect(readQueueEvents()).toEqual([]);
  });
});

describe('ICL-6: dashboard card feedback matches instinct frontmatter', () => {
  it('confirm mirrors confirmations onto the candidate record and card', () => {
    seedActivatedCandidate();
    writeCuratorInstinct(CANDIDATE_ID, { confidence: 0.5, confirmations: 2, contradictions: 1 });

    const { cmdConfirm } = getInstinct();
    cmdConfirm(CANDIDATE_ID, PROJECT); // confirmations 2 → 3

    // Read the running counts from the on-disk instinct frontmatter.
    const { parseConfidenceFrontmatter } = require('../../scripts/lib/confidence');
    const fileContent = fs.readFileSync(path.join(instinctsDir(), `${CANDIDATE_ID}.md`), 'utf-8');
    const { frontmatter } = parseConfidenceFrontmatter(fileContent);

    const { createDashboardModel } = getDashboard();
    const card = createDashboardModel().candidates.find((c) => c.candidate_id === CANDIDATE_ID);

    expect(card.feedback).toEqual({
      confirmations: frontmatter.confirmations,
      contradictions: frontmatter.contradictions,
    });
    expect(card.feedback.confirmations).toBe(3);
    expect(card.feedback.contradictions).toBe(1);
  });

  it('contradict (no archive) mirrors contradictions onto the card', () => {
    seedActivatedCandidate();
    writeCuratorInstinct(CANDIDATE_ID, { confidence: 0.8, confirmations: 4, contradictions: 0 });

    const { cmdContradict } = getInstinct();
    cmdContradict(CANDIDATE_ID, PROJECT); // contradictions 0 → 1, confidence 0.8 → 0.7 (no archive)

    const { createDashboardModel } = getDashboard();
    const card = createDashboardModel().candidates.find((c) => c.candidate_id === CANDIDATE_ID);
    expect(card.feedback).toEqual({ confirmations: 4, contradictions: 1 });
  });
});
