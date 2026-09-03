/**
 * inject-context.js — S7-1 relay-isolation tests.
 *
 * Covers:
 * - loadPendingActions consumes normally, but SKIPS consumption when
 *   ARCFORGE_SPAWNED is set (relay isolation).
 * - SessionStart child process: ARCFORGE_SPAWNED preserves the actions for the
 *   user's next (unmarked) SessionStart.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const INJECT_CONTEXT = path.join(__dirname, '..', 'session-tracker', 'inject-context.js');

// ─────────────────────────────────────────────
// loadPendingActions relay isolation (S7-1)
// ─────────────────────────────────────────────

describe('loadPendingActions relay isolation (S7-1)', () => {
  const originalEnv = { ...process.env };
  let homeDir;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-relay-'));
    process.env.HOME = homeDir;
    delete process.env.ARCFORGE_SPAWNED;
    delete require.cache[require.resolve('../session-tracker/inject-context')];
    delete require.cache[require.resolve('../../scripts/lib/pending-actions')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  function seedAction(project, type, payload) {
    const { addPendingAction } = require('../../scripts/lib/pending-actions');
    return addPendingAction(project, type, payload);
  }

  function unconsumedCount(project) {
    const { getPendingActions } = require('../../scripts/lib/pending-actions');
    return getPendingActions(project).length;
  }

  it('consumes pending actions on an unmarked session', () => {
    const project = 'relay-proj';
    seedAction(project, 'diary-ready', { count: 1 });
    const { loadPendingActions } = require('../session-tracker/inject-context');

    const result = loadPendingActions(project);
    assert.ok(result.text, 'renders the action');
    assert.strictEqual(unconsumedCount(project), 0, 'action consumed');
  });

  it('does NOT consume when ARCFORGE_SPAWNED is set', () => {
    const project = 'relay-proj';
    seedAction(project, 'diary-ready', { count: 1 });
    process.env.ARCFORGE_SPAWNED = 'enricher';
    const { loadPendingActions } = require('../session-tracker/inject-context');

    const result = loadPendingActions(project);
    assert.strictEqual(result.text, null, 'renders nothing for a spawned session');
    assert.strictEqual(unconsumedCount(project), 1, 'action survives for the user');
  });
});

// ─────────────────────────────────────────────
// SessionStart child process (relay isolation, end-to-end)
// ─────────────────────────────────────────────

describe('inject-context SessionStart child process (S7-1)', () => {
  let homeDir;
  let projectDir;
  let project;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-ss-home-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-ss-proj-'));
    project = path.basename(projectDir);
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function pendingFile() {
    return path.join(homeDir, '.arcforge', 'sessions', project, 'pending-actions.json');
  }

  function writePending(actions) {
    const dir = path.dirname(pendingFile());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(pendingFile(), JSON.stringify({ actions }, null, 2));
  }

  function makeAction(type, payload) {
    return {
      id: `${type}-${Math.random().toString(36).slice(2)}`,
      type,
      payload,
      created: new Date().toISOString(),
      consumed: false,
      consumed_at: null,
    };
  }

  it('preserves actions under ARCFORGE_SPAWNED, then consumes on the next unmarked start', () => {
    writePending([makeAction('diary-ready', { count: 1 })]);

    // Spawned session: must NOT consume.
    const spawnedEnv = {
      ...process.env,
      HOME: homeDir,
      CLAUDE_PROJECT_DIR: projectDir,
      ARCFORGE_SPAWNED: 'enricher',
    };
    const spawned = spawnSync('node', [INJECT_CONTEXT], {
      input: JSON.stringify({
        cwd: projectDir,
        hook_event_name: 'SessionStart',
        source: 'startup',
      }),
      encoding: 'utf-8',
      env: spawnedEnv,
    });
    assert.strictEqual(spawned.status, 0, spawned.stderr);

    let data = JSON.parse(fs.readFileSync(pendingFile(), 'utf-8'));
    assert.strictEqual(
      data.actions.filter((a) => !a.consumed).length,
      1,
      'spawned session preserved the action',
    );

    // Unmarked session: consumes.
    const userEnv = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectDir };
    delete userEnv.ARCFORGE_SPAWNED;
    const user = spawnSync('node', [INJECT_CONTEXT], {
      input: JSON.stringify({
        cwd: projectDir,
        hook_event_name: 'SessionStart',
        source: 'startup',
      }),
      encoding: 'utf-8',
      env: userEnv,
    });
    assert.strictEqual(user.status, 0, user.stderr);

    data = JSON.parse(fs.readFileSync(pendingFile(), 'utf-8'));
    assert.strictEqual(
      data.actions.filter((a) => !a.consumed).length,
      0,
      'unmarked session consumed the action',
    );
  });
});

// ─────────────────────────────────────────────
// Stale-draft warning is gated on the learning opt-in (D-009)
// ─────────────────────────────────────────────

describe('inject-context stale-draft warning gate (D-009)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  let homeDir;
  let projectDir;
  let project;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-stale-home-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-stale-proj-'));
    project = path.basename(projectDir);
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  /**
   * Write one unenriched draft — the shape the warning fires on — stamped
   * `ageMs` in the past. Ages are whole days apart so filesystem timestamp
   * granularity never decides an assertion.
   */
  function writeStaleDraft(name, ageMs) {
    const dir = path.join(homeDir, '.arcforge', 'diaries', project, '2026-09-01');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, '# Diary\n\n## Decisions\n<!-- TO BE ENRICHED -->\n- \n');
    const at = new Date(Date.now() - ageMs);
    fs.utimesSync(file, at, at);
    return file;
  }

  /** Turn the project-scope opt-in on, as of `ageMs` in the past. */
  function enableLearning(ageMs) {
    const configPath = path.join(projectDir, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        scope: 'project',
        enabled: true,
        updated_at: new Date(Date.now() - ageMs).toISOString(),
      }),
    );
  }

  function runInject() {
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectDir };
    delete env.ARCFORGE_SPAWNED;
    delete env.ARCFORGE_HOME;
    return spawnSync('node', [INJECT_CONTEXT], {
      input: JSON.stringify({
        cwd: projectDir,
        hook_event_name: 'SessionStart',
        source: 'startup',
      }),
      encoding: 'utf-8',
      env,
    });
  }

  it('stays silent with learning off — unenriched drafts are the contract, not a failure', () => {
    writeStaleDraft('diary-session-xyz-draft.md', 2 * DAY_MS);

    const res = runInject();
    assert.strictEqual(res.status, 0, res.stderr);
    assert.ok(
      !res.stdout.includes('unenriched'),
      `learning-off session must not warn about unenriched drafts. stdout: ${res.stdout}`,
    );
  });

  it('warns about a draft written after the opt-in — the enricher really should have run', () => {
    enableLearning(3 * DAY_MS);
    writeStaleDraft('diary-session-xyz-draft.md', 2 * DAY_MS);

    const res = runInject();
    assert.strictEqual(res.status, 0, res.stderr);
    assert.ok(
      res.stdout.includes('unenriched'),
      `learning-on session must surface the stale-draft warning. stdout: ${res.stdout}`,
    );
  });

  it('opting in does not report the learning-off backlog, only what came after', () => {
    // Three drafts accumulated while learning was off — all by-design stubs.
    writeStaleDraft('diary-session-a-draft.md', 5 * DAY_MS);
    writeStaleDraft('diary-session-b-draft.md', 4 * DAY_MS);
    writeStaleDraft('diary-session-c-draft.md', 3 * DAY_MS);
    enableLearning(0);

    const first = runInject();
    assert.strictEqual(first.status, 0, first.stderr);
    assert.ok(
      !first.stdout.includes('unenriched'),
      `the first session after opting in must not report the backlog. stdout: ${first.stdout}`,
    );

    // A draft the enricher was authorized for, and left stale, still warns —
    // and reports only itself.
    writeStaleDraft('diary-session-d-draft.md', 0);
    const second = runInject();
    assert.strictEqual(second.status, 0, second.stderr);
    assert.ok(
      second.stdout.includes('1 diary draft unenriched'),
      `only the post-opt-in draft should be counted. stdout: ${second.stdout}`,
    );
  });

  it('keeps a pre-opt-in draft suppressed after it is hand-edited or touched', () => {
    const draft = writeStaleDraft('diary-session-old-draft.md', 5 * DAY_MS);
    enableLearning(3 * DAY_MS);

    const before = runInject();
    assert.strictEqual(before.status, 0, before.stderr);
    assert.ok(
      !before.stdout.includes('unenriched'),
      `the pre-opt-in stub must start out silent. stdout: ${before.stdout}`,
    );

    // Touching the stub moves mtime past the opt-in; creation time does not
    // move, so the floor still recognizes it as a pre-opt-in stub.
    const now = new Date();
    fs.utimesSync(draft, now, now);

    const after = runInject();
    assert.strictEqual(after.status, 0, after.stderr);
    assert.ok(
      !after.stdout.includes('unenriched'),
      `touching a pre-opt-in stub must not turn it into a reported failure. stdout: ${after.stdout}`,
    );
  });
});
