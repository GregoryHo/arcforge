// tests/scripts/learning-lifecycle-lock.test.js
//
// B-16 (#178): a transition's legality check reads the candidate's current state
// inside the same store lock that appends the transition — on the dashboard, on
// the CLI, and on the contradict path that deactivates. Two writers acting on
// one candidate at once are serialized: the second sees the first's result and
// is refused if its move is no longer legal, so replaying the queue never yields
// an order the matrix forbids.
//
// The race is made deterministic by holding the store lock from the test while
// both writers start: each reads the queue (outside any lock, as the CLI does to
// find the card) and then blocks on the lock. Releasing it lets them through one
// at a time. Before B-16 both had already passed their check, so both appended.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const PROJECT_NAME = 'arcforge';
const CANDIDATE_ID = 'cand_instinct_20261001T010000Z_a1b2c3d4e5f6';
const CLI = path.join(__dirname, '../../scripts/cli.js');

// Long enough for two node processes to start, read the queue and block on the
// lock; short of the 5 s lock timeout either of them would give up at.
const HOLD_MS = 1500;

let testDir;
let arcforgeHome;
let env;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-lock-'));
  const projectRoot = path.join(testDir, PROJECT_NAME);
  arcforgeHome = path.join(testDir, 'home', '.arcforge');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(arcforgeHome, { recursive: true });
  env = { ...process.env, ARCFORGE_HOME: arcforgeHome, CLAUDE_PROJECT_DIR: projectRoot };
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function candidatesDir() {
  return path.join(arcforgeHome, 'learning', 'candidates');
}

function seed() {
  const record = {
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
  };
  fs.mkdirSync(candidatesDir(), { recursive: true });
  const event = {
    schema_version: 1,
    event_id: 'evt_seed',
    ts: record.created_at,
    candidate_id: CANDIDATE_ID,
    event_type: 'candidate.created',
    actor: { layer: 5, actor_type: 'validator' },
    record,
  };
  fs.writeFileSync(path.join(candidatesDir(), 'queue.jsonl'), `${JSON.stringify(event)}\n`);
}

function cliSync(args) {
  const result = spawnSync('node', [CLI, 'learn', ...args], { env, encoding: 'utf8' });
  expect({ args, status: result.status, out: result.stdout }).toMatchObject({ status: 0 });
  return result;
}

/** Run `node <argv>` to completion without blocking the event loop. */
function run(argv) {
  return new Promise((resolve) => {
    const child = spawn('node', argv, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** Start every writer while the store lock is held, then release it. */
async function raceUnderHeldLock(argvs) {
  const lockPath = path.join(candidatesDir(), 'store.lock');
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 0, ts: new Date().toISOString() }));
  const runs = argvs.map(run);
  await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
  fs.unlinkSync(lockPath);
  return Promise.all(runs);
}

function transitions() {
  return fs
    .readFileSync(path.join(candidatesDir(), 'queue.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.event_type === 'candidate.transitioned');
}

function auditEntries() {
  const logPath = path.join(arcforgeHome, 'learning', 'dashboard', 'actions.jsonl');
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('two writers on one candidate are serialized (B-16)', () => {
  it('lets one of approve / reject through and refuses the other as stale', async () => {
    seed();

    const results = await raceUnderHeldLock([
      [CLI, 'learn', 'approve', CANDIDATE_ID, '--project', '--json'],
      [CLI, 'learn', 'reject', CANDIDATE_ID, '--project', '--json'],
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([0, 1]);
    const loser = results.find((r) => r.status !== 0);
    expect(JSON.parse(loser.stdout).error).toMatch(/stale_status/);
    expect(transitions()).toHaveLength(1);
    const audit = auditEntries();
    expect(audit.filter((e) => e.accepted)).toHaveLength(1);
    expect(audit.filter((e) => !e.accepted).map((e) => e.reason)).toEqual(['stale_status']);
  }, 15000);

  it('does not deactivate again when the candidate was deactivated while it waited', async () => {
    seed();
    cliSync(['accept', CANDIDATE_ID, '--project', '--json']);
    cliSync(['activate', CANDIDATE_ID, '--project', '--json']);
    // One contradiction away from the archive threshold, so the contradict path
    // deactivates the candidate it came from.
    const activePath = path.join(arcforgeHome, 'instincts', PROJECT_NAME, `${CANDIDATE_ID}.md`);
    const active = fs.readFileSync(activePath, 'utf8');
    fs.writeFileSync(activePath, active.replace(/^confidence: .*$/m, 'confidence: 0.20'));

    // The other writer — the dashboard's Deactivate, say — wins the lock first:
    // its transition lands while the contradiction is waiting for the lock.
    const lockPath = path.join(candidatesDir(), 'store.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 0, ts: new Date().toISOString() }));
    const contradiction = run([CLI, 'learn', 'instinct', 'contradict', CANDIDATE_ID, '--json']);
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    const winner = {
      schema_version: 1,
      event_id: 'evt_winner',
      ts: new Date().toISOString(),
      candidate_id: CANDIDATE_ID,
      event_type: 'candidate.transitioned',
      actor: { layer: 6, actor_type: 'dashboard' },
      action: 'deactivate',
      next_status: 'deactivated',
    };
    fs.appendFileSync(path.join(candidatesDir(), 'queue.jsonl'), `${JSON.stringify(winner)}\n`);
    fs.unlinkSync(lockPath);
    const result = await contradiction;

    expect(JSON.parse(result.stdout).archived).toBe(true);
    const deactivations = transitions().filter((e) => e.next_status === 'deactivated');
    expect(deactivations.map((e) => e.event_id)).toEqual(['evt_winner']);
  }, 20000);
});
