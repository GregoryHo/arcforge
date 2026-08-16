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
