// tests/scripts/learning-instinct-commands.test.js
//
// B-12 / D-040: `learn instinct deactivate <id> --project` dispatches the same
// canonical `deactivate` transition as the dashboard's button — same matrix,
// same audit record — and says future sessions will no longer receive the
// instinct. B-11: `learn instinct restore <name> --project` moves an archived
// instinct back whatever archived it, refuses a same-name collision naming both
// files, and audits the restore with the archive reason when the file has one.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_NAME = 'arcforge';
const CANDIDATE_ID = 'cand_instinct_20261001T010000Z_a1b2c3d4e5f6';
const OTHER_ID = 'cand_instinct_20261001T020000Z_b2c3d4e5f6a1';
const CLI = path.join(__dirname, '../../scripts/cli.js');
const DASHBOARD = path.join(__dirname, '../../scripts/lib/learning-dashboard.js');
const INJECT = path.join(__dirname, '../../hooks/session-tracker/inject-context.js');

let testDir;
let arcforgeHome;
let env;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-instinct-cmds-'));
  const projectRoot = path.join(testDir, PROJECT_NAME);
  arcforgeHome = path.join(testDir, 'home', '.arcforge');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(arcforgeHome, { recursive: true });
  env = { ...process.env, ARCFORGE_HOME: arcforgeHome, CLAUDE_PROJECT_DIR: projectRoot };
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function seed(candidateId, overrides = {}) {
  const record = {
    schema_version: 1,
    candidate_id: candidateId,
    created_at: '2026-10-01T01:00:00.000Z',
    updated_at: '2026-10-01T01:00:00.000Z',
    artifact_type: 'instinct',
    scope: { kind: 'project', project: PROJECT_NAME, project_id: 'proj_test' },
    source: { source_type: 'layer4_llm_curator' },
    name: `name-${candidateId.slice(-4)}`,
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
  const queuePath = path.join(arcforgeHome, 'learning', 'candidates', 'queue.jsonl');
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  const event = {
    schema_version: 1,
    event_id: `evt_${candidateId}`,
    ts: record.created_at,
    candidate_id: candidateId,
    event_type: 'candidate.created',
    actor: { layer: 5, actor_type: 'validator' },
    record,
  };
  fs.appendFileSync(queuePath, `${JSON.stringify(event)}\n`);
}

function runCli(args) {
  const result = spawnSync('node', [CLI, 'learn', ...args], { env, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function runJson(args) {
  const result = runCli([...args, '--json']);
  expect({ args, status: result.status, out: result.stdout }).toMatchObject({ status: 0 });
  return JSON.parse(result.stdout);
}

function refusal(args) {
  const result = runCli([...args, '--json']);
  expect(result.status).not.toBe(0);
  return JSON.parse(result.stdout).error;
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

function instinctsDir() {
  return path.join(arcforgeHome, 'instincts', PROJECT_NAME);
}

function activated(candidateId = CANDIDATE_ID) {
  seed(candidateId);
  runJson(['accept', candidateId, '--project']);
  runJson(['activate', candidateId, '--project']);
  return path.join(instinctsDir(), `${candidateId}.md`);
}

function statusOf(candidateId = CANDIDATE_ID) {
  return runJson(['inspect', candidateId, '--project']).candidate.lifecycle_status;
}

describe('learn instinct deactivate (B-12)', () => {
  it('takes an activated instinct out of the injected set and says so', () => {
    const activePath = activated();

    const result = runCli(['instinct', 'deactivate', CANDIDATE_ID, '--project', '--json']);

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/future sessions will no longer receive/);
    const out = JSON.parse(result.stdout);
    expect(out.next_status).toBe('deactivated');
    expect(fs.existsSync(activePath)).toBe(false);
    expect(out.archive_paths).toHaveLength(1);
    expect(out.archive_paths[0]).toContain(path.join(instinctsDir(), '.disabled'));
    expect(fs.existsSync(out.archive_paths[0])).toBe(true);
    expect(statusOf()).toBe('deactivated');
  });

  it('writes the same audit record as the dashboard button, attributed to the CLI', () => {
    activated(CANDIDATE_ID);
    activated(OTHER_ID);
    runJson(['instinct', 'deactivate', CANDIDATE_ID, '--project']);
    const script = `
      const { handleDashboardAction } = require(${JSON.stringify(DASHBOARD)});
      const r = handleDashboardAction({
        action: 'deactivate',
        candidate_id: ${JSON.stringify(OTHER_ID)},
        expected_current_status: 'activated',
        safety_ack: { reviewer_saw_behavior_change_warning: true },
      });
      if (!r.accepted) process.exit(1);
    `;
    expect(spawnSync('node', ['-e', script], { env }).status).toBe(0);

    const deactivations = auditEntries().filter((e) => e.action === 'deactivate');
    expect(deactivations).toHaveLength(2);
    const [cli, dashboard] = deactivations;
    expect(Object.keys(cli).sort()).toEqual(Object.keys(dashboard).sort());
    expect(cli).toMatchObject({
      accepted: true,
      candidate_id: CANDIDATE_ID,
      next_status: 'deactivated',
      actor: { actor_type: 'cli', reviewer: 'local_user' },
    });
    expect(dashboard.actor.actor_type).toBe('dashboard');
  });

  it('leaves the candidate activatable again from deactivated', () => {
    activated();
    runJson(['instinct', 'deactivate', CANDIDATE_ID, '--project']);

    expect(runJson(['activate', CANDIDATE_ID, '--project']).next_status).toBe('activated');
  });

  it('refuses an id that names no activated instinct, moving nothing, audited', () => {
    seed(CANDIDATE_ID);
    runJson(['accept', CANDIDATE_ID, '--project']);

    const error = refusal(['instinct', 'deactivate', CANDIDATE_ID, '--project']);

    expect(error).toMatch(/policy_violation/);
    expect(statusOf()).toBe('materialized');
    expect(fs.existsSync(path.join(instinctsDir(), '.disabled'))).toBe(false);
    expect(auditEntries().at(-1)).toMatchObject({
      accepted: false,
      action: 'deactivate',
      reason: 'policy_violation',
      actor: { actor_type: 'cli' },
    });
  });

  it('refuses an id that names no candidate at all, audited as the engine’s miss', () => {
    refusal(['instinct', 'deactivate', 'cand_nope', '--project']);

    expect(auditEntries().at(-1)).toMatchObject({
      accepted: false,
      action: 'deactivate',
      reason: 'candidate_not_found',
    });
  });

  it('refuses another project’s instinct without touching it', () => {
    seed(CANDIDATE_ID, { scope: { kind: 'project', project: 'elsewhere', project_id: 'p2' } });

    expect(refusal(['instinct', 'deactivate', CANDIDATE_ID, '--project'])).toMatch(
      /belongs to the project "elsewhere"/,
    );
    expect(auditEntries()).toEqual([]);
  });

  it('refuses --global', () => {
    expect(refusal(['instinct', 'deactivate', CANDIDATE_ID, '--global'])).toMatch(
      /learn dashboard/,
    );
  });
});

describe('learn instinct restore (B-11)', () => {
  function archived(file, frontmatter) {
    const dir = path.join(instinctsDir(), 'archived');
    fs.mkdirSync(dir, { recursive: true });
    const lines = ['---', ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`), '---'];
    fs.writeFileSync(path.join(dir, file), `${lines.join('\n')}\n\n## Action\n\nGrep first.\n`);
    return path.join(dir, file);
  }

  const DECAYED = {
    id: 'grep-first',
    trigger: 'editing',
    confidence: '0.12',
    source: 'manual',
    last_confirmed: '2026-08-01',
    archived_at: '2026-09-20',
    archive_reason: 'decay',
  };

  it('moves a decay-archived instinct back and audits the archive reason', () => {
    const from = archived('grep-first.md', DECAYED);

    const out = runJson(['instinct', 'restore', 'grep-first', '--project']);

    const to = path.join(instinctsDir(), 'grep-first.md');
    expect(out.path).toBe(to);
    expect(fs.existsSync(from)).toBe(false);
    const restored = fs.readFileSync(to, 'utf8');
    expect(restored).toContain('confidence: 0.12');
    expect(restored).toContain('Grep first.');
    expect(restored).not.toMatch(/archived_at|archive_reason/);
    expect(auditEntries().at(-1)).toMatchObject({
      accepted: true,
      action: 'instinct_restore',
      instinct_id: 'grep-first',
      instinct_dir: PROJECT_NAME,
      restored_from: path.join('archived', 'grep-first.md'),
      restored_to: 'grep-first.md',
      archive_reason: 'decay',
      actor: { actor_type: 'cli' },
    });
  });

  it('restores a contradiction archive, which carries no reason', () => {
    const { archive_reason: _r, ...contradicted } = DECAYED;
    archived('grep-first.md', contradicted);

    runJson(['instinct', 'restore', 'grep-first', '--project']);

    const entry = auditEntries().at(-1);
    expect(entry).toMatchObject({ accepted: true, action: 'instinct_restore' });
    expect(entry).not.toHaveProperty('archive_reason');
  });

  it('refuses to overwrite an active instinct of the same name, naming both files', () => {
    const from = archived('grep-first.md', DECAYED);
    fs.writeFileSync(path.join(instinctsDir(), 'grep-first.md'), 'active\n');

    const error = refusal(['instinct', 'restore', 'grep-first', '--project']);

    expect(error).toContain(from);
    expect(error).toContain(path.join(instinctsDir(), 'grep-first.md'));
    expect(fs.existsSync(from)).toBe(true);
    expect(fs.readFileSync(path.join(instinctsDir(), 'grep-first.md'), 'utf8')).toBe('active\n');
    expect(auditEntries().at(-1)).toMatchObject({
      accepted: false,
      action: 'instinct_restore',
      reason: 'active_instinct_exists',
    });
  });

  it('refuses a name with nothing archived under it, audited', () => {
    refusal(['instinct', 'restore', 'nothing-here', '--project']);

    expect(auditEntries().at(-1)).toMatchObject({
      accepted: false,
      action: 'instinct_restore',
      reason: 'instinct_not_archived',
    });
  });

  it('finds an archive decay gave a dated name to', () => {
    archived('grep-first.2026-09-20.md', DECAYED);

    runJson(['instinct', 'restore', 'grep-first', '--project']);

    expect(fs.existsSync(path.join(instinctsDir(), 'grep-first.md'))).toBe(true);
  });

  it('refuses an ambiguous name and restores the archive named exactly', () => {
    archived('grep-first.md', DECAYED);
    archived('grep-first.2026-09-20.md', DECAYED);

    const error = refusal(['instinct', 'restore', 'grep-first', '--project']);
    expect(error).toContain('grep-first.2026-09-20');
    expect(auditEntries().at(-1)).toMatchObject({ reason: 'ambiguous_archive' });

    runJson(['instinct', 'restore', 'grep-first.2026-09-20', '--project']);
    expect(fs.existsSync(path.join(instinctsDir(), 'grep-first.md'))).toBe(true);
    expect(fs.existsSync(path.join(instinctsDir(), 'archived', 'grep-first.md'))).toBe(true);
  });

  it('restores what the contradict command archived', () => {
    fs.mkdirSync(instinctsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(instinctsDir(), 'grep-first.md'),
      '---\nid: grep-first\nconfidence: 0.20\nlast_confirmed: 2026-09-01\n---\n\n## Action\n\nGrep first.\n',
    );
    expect(runJson(['instinct', 'contradict', 'grep-first']).archived).toBe(true);

    runJson(['instinct', 'restore', 'grep-first', '--project']);

    expect(fs.existsSync(path.join(instinctsDir(), 'grep-first.md'))).toBe(true);
  });

  it('refuses --global', () => {
    expect(refusal(['instinct', 'restore', 'grep-first', '--global'])).toMatch(/--global/);
  });

  // Codex P1 on #236: what the SessionStart injector would put in a session,
  // read through the hook's own loader in a child process on this home.
  function injectedIds() {
    const script = `
      const { loadAutoInstincts } = require(${JSON.stringify(INJECT)});
      process.stdout.write(loadAutoInstincts(${JSON.stringify(PROJECT_NAME)}).text || '');
    `;
    const out = spawnSync('node', ['-e', script], { env, encoding: 'utf8' }).stdout;
    return [CANDIDATE_ID].filter((id) => out.includes(id));
  }

  it('keeps a contradicted curator instinct out of sessions after restore, until activated', () => {
    const activePath = activated();
    expect(injectedIds()).toEqual([CANDIDATE_ID]);
    const content = fs.readFileSync(activePath, 'utf8');
    fs.writeFileSync(activePath, content.replace(/^confidence: .*$/m, 'confidence: 0.20'));
    expect(runJson(['instinct', 'contradict', CANDIDATE_ID]).archived).toBe(true);
    expect(statusOf()).toBe('deactivated');

    const out = runJson(['instinct', 'restore', CANDIDATE_ID, '--project']);

    expect(fs.existsSync(activePath)).toBe(true);
    expect(out.injected).toBe(false);
    expect(injectedIds()).toEqual([]);
    expect(runJson(['activate', CANDIDATE_ID, '--project']).next_status).toBe('activated');
    expect(injectedIds()).toEqual([CANDIDATE_ID]);
  });

  it('returns an archived instinct whose candidate is still activated to sessions', () => {
    const activePath = activated();
    const archiveDir = path.join(instinctsDir(), 'archived');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(activePath, path.join(archiveDir, `${CANDIDATE_ID}.md`));
    expect(injectedIds()).toEqual([]);

    const out = runJson(['instinct', 'restore', CANDIDATE_ID, '--project']);

    expect(out.injected).toBe(true);
    expect(injectedIds()).toEqual([CANDIDATE_ID]);
  });
});
