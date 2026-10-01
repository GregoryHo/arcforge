// tests/scripts/learning-candidate-name-policy.test.js
//
// B-14 / D-035 (#175): a candidate name is checked at the door, once. Layer 5
// ingestion rejects a name the draft writer could not use as a filename, or one
// the redactor would alter, and records the rejection with its reason in
// rejections.jsonl. Materialization never normalizes: the stored name is the
// draft filename, the draft heading and the active instinct's heading.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-name-policy-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SECRET = 'ghp_SUPERSECRET123456';

function candidatesDir() {
  return path.join(tmpDir, '.arcforge', 'learning', 'candidates');
}

function readJsonl(file) {
  const p = path.join(candidatesDir(), file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Every file under the arcforge home, concatenated — where a secret could leak. */
function everythingOnDisk() {
  const root = path.join(tmpDir, '.arcforge');
  if (!fs.existsSync(root)) return '';
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      out.push(full);
      if (entry.isDirectory()) walk(full);
      else out.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  return out.join('\n');
}

function makeRecord(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'cand_instinct_20261001T010000Z_a1b2c3d4e5f6',
    created_at: '2026-10-01T01:00:00.000Z',
    updated_at: '2026-10-01T01:00:00.000Z',
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
      { evidence_id: 'ev_1', evidence_type: 'observation', relevance: 'a', summary: 'a' },
      { evidence_id: 'ev_2', evidence_type: 'observation', relevance: 'b', summary: 'b' },
    ],
    evidence_quality: 'medium',
    evidence_quality_metadata: { rule_version: 'v1', basis: { project_obs_count: 500 } },
    lifecycle: { status: 'pending_review', status_changed_at: '2026-10-01T01:00:00.000Z' },
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
    dedupe: { dedupe_key: 'grep-before-editing-v1', dedupe_basis: { name_hash: 'abc' } },
    ...overrides,
  };
}

describe('Layer 5 ingestion checks the candidate name once (B-14)', () => {
  it('rejects a name the redactor would alter, recording why without the secret', () => {
    const { appendCandidate } = require('../../scripts/lib/learning-curator/queue-writer');

    const result = appendCandidate(makeRecord({ name: `token=${SECRET}` }));

    expect(result.ok).toBe(false);
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: 'unsafe_content', field_path: 'name' }),
    );
    expect(readJsonl('queue.jsonl')).toEqual([]);
    const [rejection] = readJsonl('rejections.jsonl');
    expect(rejection.reasons).toContainEqual(
      expect.objectContaining({ code: 'unsafe_content', field_path: 'name' }),
    );
    expect(rejection.normalized_name).toBe('token=[REDACTED]');
    expect(everythingOnDisk()).not.toContain(SECRET);
  });

  it.each([
    ['a path separator', 'some/path/traversal'],
    ['a backslash', 'some\\path'],
    ['a parent-directory segment', 'a..b'],
    ['a control character', 'line\nbreak'],
    ['a blank name', '   '],
    ['a name too long in bytes', '界'.repeat(120)],
  ])('rejects %s, which the draft writer could not use as a filename', (_label, name) => {
    const { appendCandidate } = require('../../scripts/lib/learning-curator/queue-writer');
    const { NAME_POLICY_SUMMARY } = require('../../scripts/lib/learning-curator/name-policy');

    const result = appendCandidate(makeRecord({ name }));

    expect(result.ok).toBe(false);
    expect(readJsonl('queue.jsonl')).toEqual([]);
    const [rejection] = readJsonl('rejections.jsonl');
    expect(rejection.reasons).toContainEqual({
      code: 'schema_invalid',
      field_path: 'name',
      detail: NAME_POLICY_SUMMARY,
    });
  });

  it('never puts the refused name in the rejection detail', () => {
    const { appendCandidate } = require('../../scripts/lib/learning-curator/queue-writer');

    appendCandidate(makeRecord({ name: 'leak/me-please' }));

    const [rejection] = readJsonl('rejections.jsonl');
    expect(JSON.stringify(rejection.reasons)).not.toContain('leak/me-please');
  });

  it('accepts a usable name and stores it exactly as proposed', () => {
    const {
      appendCandidate,
      readCurrentCandidates,
    } = require('../../scripts/lib/learning-curator/queue-writer');
    const name = 'grep before editing — 日本語 ok';

    expect(appendCandidate(makeRecord({ name })).ok).toBe(true);

    const [record] = Object.values(readCurrentCandidates());
    expect(record.name).toBe(name);
    expect(readJsonl('rejections.jsonl')).toEqual([]);
  });

  it('is the draft writer’s own policy: every name the queue accepts, Layer 7 can write', () => {
    const { validateCandidateV1 } = require('../../scripts/lib/learning-curator/schema');
    const { isMaterializableName } = require('../../scripts/lib/learning-curator/materialize');
    const names = ['ok', 'a/b', '..', ' ', '界'.repeat(83), '界'.repeat(82), `api_key=${SECRET}`];

    for (const name of names) {
      const admitted = validateCandidateV1(makeRecord({ name })).ok;
      if (admitted)
        expect({ name, writable: isMaterializableName(name) }).toEqual({ name, writable: true });
    }
  });
});

describe('materialization never normalizes the name (B-14)', () => {
  it('writes the stored name as the draft filename and heading, unchanged', () => {
    const { appendCandidate } = require('../../scripts/lib/learning-curator/queue-writer');
    const {
      appendTransitionEvent,
    } = require('../../scripts/lib/learning-curator/dashboard-events');
    const { handleDashboardAction } = require('../../scripts/lib/learning-dashboard');
    const name = 'Grep Before Editing (v2)';
    const record = makeRecord({ name });
    appendCandidate(record);
    appendTransitionEvent(record.candidate_id, 'approve', 'approved');

    const result = handleDashboardAction({
      action: 'materialize',
      candidate_id: record.candidate_id,
    });

    expect(result.accepted).toBe(true);
    expect(path.basename(result.draft_paths[0])).toBe(`${name}.md`);
    expect(fs.readFileSync(result.draft_paths[0], 'utf8')).toContain(`# ${name}\n`);
  });
});
