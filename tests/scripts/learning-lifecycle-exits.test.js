// tests/scripts/learning-lifecycle-exits.test.js
//
// B-15 / D-036 (#160, #165): no lifecycle state is a dead end. An `approved`
// candidate can be dismissed — `learn reject` — and a `materialized` one can be
// materialized again — `learn materialize` — which rewrites its draft from the
// stored record after a hand edit or a deletion. Both pass the same gate and
// land in the same audit log as every other transition (B-5).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_NAME = 'arcforge';
const CANDIDATE_ID = 'cand_instinct_20261001T010000Z_a1b2c3d4e5f6';
const CLI = path.join(__dirname, '../../scripts/cli.js');

let testDir;
let arcforgeHome;
let env;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-exits-'));
  const projectRoot = path.join(testDir, PROJECT_NAME);
  arcforgeHome = path.join(testDir, 'home', '.arcforge');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(arcforgeHome, { recursive: true });
  env = { ...process.env, ARCFORGE_HOME: arcforgeHome, CLAUDE_PROJECT_DIR: projectRoot };
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function makeRecord(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: CANDIDATE_ID,
    created_at: '2026-10-01T01:00:00.000Z',
    updated_at: '2026-10-01T01:00:00.000Z',
    artifact_type: 'instinct',
    scope: { kind: 'project', project: PROJECT_NAME, project_id: 'proj_test' },
    source: { source_type: 'layer4_llm_curator' },
    name: 'grep-before-editing',
    summary: 'Grep for existing patterns before making edits',
    rationale: 'Prevents duplicate code',
    domain: 'workflow',
    body: 'When editing files, first grep for existing patterns',
    body_source: 'llm_curator',
    evidence: [],
    evidence_quality: 'medium',
    lifecycle: { status: 'pending_review', status_changed_at: '2026-10-01T01:00:00.000Z' },
    ...overrides,
  };
}

/**
 * Seed a raw `candidate.created` event. Raw on purpose: it is how a candidate
 * queued before the B-14 name check (a "legacy" record) still sits on disk.
 */
function seed(record) {
  const queuePath = path.join(arcforgeHome, 'learning', 'candidates', 'queue.jsonl');
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  const event = {
    schema_version: 1,
    event_id: `evt_${record.candidate_id}`,
    ts: record.created_at,
    candidate_id: record.candidate_id,
    event_type: 'candidate.created',
    actor: { layer: 5, actor_type: 'validator' },
    record,
  };
  fs.appendFileSync(queuePath, `${JSON.stringify(event)}\n`, 'utf8');
}

function runCli(args) {
  const result = spawnSync('node', [CLI, 'learn', ...args], { env, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function runJson(args) {
  const result = runCli([...args, '--json']);
  // stdout carries the refusal under --json; stderr carries activation's warning.
  expect({ status: result.status, out: result.stdout }).toMatchObject({ status: 0 });
  return JSON.parse(result.stdout);
}

function statusOf(candidateId = CANDIDATE_ID) {
  const card = runJson(['inspect', candidateId, '--project']).candidate;
  return card.lifecycle_status;
}

function auditEntries() {
  const logPath = path.join(arcforgeHome, 'learning', 'dashboard', 'actions.jsonl');
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('dismiss from approved (#160, B-15)', () => {
  it('retires an approved non-instinct candidate the curator cannot build', () => {
    seed(makeRecord({ artifact_type: 'skill' }));
    runJson(['approve', CANDIDATE_ID, '--project']);

    const result = runJson(['reject', CANDIDATE_ID, '--project']);

    expect(result.next_status).toBe('dismissed');
    expect(statusOf()).toBe('dismissed');
    expect(auditEntries().at(-1)).toMatchObject({
      accepted: true,
      action: 'dismiss',
      candidate_id: CANDIDATE_ID,
      actor: { actor_type: 'cli' },
    });
  });

  it('retires an approved candidate queued under a name from before B-14', () => {
    seed(makeRecord({ name: 'some/path/traversal' }));
    runJson(['approve', CANDIDATE_ID, '--project']);
    expect(runCli(['materialize', CANDIDATE_ID, '--project', '--json']).status).not.toBe(0);

    expect(runJson(['reject', CANDIDATE_ID, '--project']).next_status).toBe('dismissed');
  });

  it('lists dismiss among an approved card’s available actions', () => {
    seed(makeRecord());
    runJson(['approve', CANDIDATE_ID, '--project']);

    const [card] = runJson(['inbox', '--project']).candidates;

    expect(card.available_actions).toContain('dismiss');
    // The forward move is still the suggested one.
    expect(card.next_command).toBe(`arcforge learn materialize ${CANDIDATE_ID} --project`);
  });

  it('names `learn reject` when accept refuses a legacy name from approved', () => {
    seed(makeRecord({ name: 'some/path/traversal' }));
    runJson(['approve', CANDIDATE_ID, '--project']);

    const { error } = JSON.parse(runCli(['accept', CANDIDATE_ID, '--project', '--json']).stdout);

    expect(error).toMatch(new RegExp(`arcforge learn reject ${CANDIDATE_ID} --project`));
  });
});

describe('materialize again from materialized (#165, B-15)', () => {
  function materialized() {
    seed(makeRecord());
    return runJson(['accept', CANDIDATE_ID, '--project']).draft_paths[0];
  }

  it('rewrites an edited draft from the stored record, so activation runs again', () => {
    const draftPath = materialized();
    fs.appendFileSync(draftPath, '\nreviewer edit\n');
    expect(runCli(['activate', CANDIDATE_ID, '--project', '--json']).status).not.toBe(0);

    const again = runJson(['materialize', CANDIDATE_ID, '--project']);

    expect(again.next_status).toBe('materialized');
    expect(again.draft_paths[0]).not.toBe(draftPath);
    expect(fs.readFileSync(again.draft_paths[0], 'utf8')).not.toContain('reviewer edit');
    // The reviewer's edit is left where they left it.
    expect(fs.readFileSync(draftPath, 'utf8')).toContain('reviewer edit');
    expect(runJson(['activate', CANDIDATE_ID, '--project']).next_status).toBe('activated');
  });

  it('rewrites a deleted draft', () => {
    const draftPath = materialized();
    fs.rmSync(draftPath);

    const again = runJson(['materialize', CANDIDATE_ID, '--project']);

    expect(fs.existsSync(again.draft_paths[0])).toBe(true);
    expect(runJson(['drafts', '--project']).drafts[0].draft_paths_stale).toEqual([]);
  });

  it('hands back the same draft when it is intact, and audits the move', () => {
    const draftPath = materialized();

    const again = runJson(['materialize', CANDIDATE_ID, '--project']);

    expect(again.draft_paths).toEqual([draftPath]);
    expect(statusOf()).toBe('materialized');
    expect(auditEntries().at(-1)).toMatchObject({
      accepted: true,
      action: 'materialize',
      actor: { actor_type: 'cli' },
    });
  });

  it('points inspect at `learn materialize` when the draft is gone', () => {
    fs.rmSync(materialized());

    const { next_actions: actions } = runJson(['inspect', CANDIDATE_ID, '--project']);

    expect(actions.join('\n')).toMatch(
      new RegExp(`arcforge learn materialize ${CANDIDATE_ID} --project`),
    );
  });

  it('keeps `activate` as the next command for an intact materialized candidate', () => {
    materialized();

    const [card] = runJson(['inbox', '--project']).candidates;

    expect(card.available_actions).toEqual(expect.arrayContaining(['materialize', 'activate']));
    expect(card.next_command).toBe(`arcforge learn activate ${CANDIDATE_ID} --project`);
  });
});
