/**
 * inject-context.js — SDD-5 rendering + S7-1 relay-isolation tests.
 *
 * Covers:
 * - renderRatifyPending / renderLoopFinished produce the model-visible forms.
 * - loadPendingActions consumes normally, but SKIPS consumption when
 *   ARCFORGE_SPAWNED is set (relay isolation).
 * - SessionStart child process surfaces both the ratify line and the
 *   loop-finished line; ARCFORGE_SPAWNED preserves the actions for the user's
 *   next (unmarked) SessionStart.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const INJECT_CONTEXT = path.join(__dirname, '..', 'session-tracker', 'inject-context.js');

// ─────────────────────────────────────────────
// Pure render helpers
// ─────────────────────────────────────────────

describe('inject-context render helpers (SDD-5)', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../session-tracker/inject-context')];
  });

  it('renderRatifyPending uses the PARSABLE ratify command and pipeline doc', () => {
    const { renderRatifyPending } = require('../session-tracker/inject-context');
    const out = renderRatifyPending({
      count: 2,
      specs: [{ spec_id: 'my-spec', decision_ids: ['D-007', 'D-009'] }],
    });
    assert.ok(out.includes('2 decisions pending ratification'), 'mentions count');
    assert.ok(
      out.includes(
        'ARCFORGE_MODE=attended node "$ARCFORGE_ROOT/scripts/cli.js" ratify my-spec D-007',
      ),
      'parsable ratify invocation with concrete spec/D-id',
    );
    assert.ok(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder, not JS interpolation.
      out.includes('${ARCFORGE_ROOT}/docs/guide/sdd-pipeline.md'),
      'points at the ARCFORGE_ROOT-relative pipeline guide',
    );
    assert.ok(!/(^|\s)arcforge ratify/.test(out), 'no bare `arcforge` bin invocation');
  });

  it('renderLoopFinished renders the morning review-queue line', () => {
    const { renderLoopFinished } = require('../session-tracker/inject-context');
    const out = renderLoopFinished({
      status: 'complete',
      completed_count: 3,
      blocked: [{ id: 'T-9', reason: 'conflict' }],
      base_branch: 'main',
      total_cost: 2.5,
    });
    assert.ok(out.includes('3 merged on main'), 'mentions merged count + branch');
    assert.ok(out.includes('1 blocked'), 'mentions blocked count');
    assert.ok(out.includes('T-9'), 'lists blocked id');
  });

  it('renderLoopFinished tolerates a null base_branch', () => {
    const { renderLoopFinished } = require('../session-tracker/inject-context');
    const out = renderLoopFinished({ completed_count: 0, blocked: [], base_branch: null });
    assert.ok(out.includes('0 merged'), 'renders without a branch suffix');
    assert.ok(!out.includes('on null'), 'never prints "on null"');
  });
});

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
    seedAction(project, 'ratify-pending', { count: 1, specs: [] });
    const { loadPendingActions } = require('../session-tracker/inject-context');

    const result = loadPendingActions(project);
    assert.ok(result.text, 'renders the action');
    assert.strictEqual(unconsumedCount(project), 0, 'action consumed');
  });

  it('does NOT consume when ARCFORGE_SPAWNED is set', () => {
    const project = 'relay-proj';
    seedAction(project, 'ratify-pending', { count: 1, specs: [] });
    process.env.ARCFORGE_SPAWNED = 'enricher';
    const { loadPendingActions } = require('../session-tracker/inject-context');

    const result = loadPendingActions(project);
    assert.strictEqual(result.text, null, 'renders nothing for a spawned session');
    assert.strictEqual(unconsumedCount(project), 1, 'action survives for the user');
  });
});

// ─────────────────────────────────────────────
// SessionStart child process (SDD-5 end-to-end)
// ─────────────────────────────────────────────

describe('inject-context SessionStart child process (SDD-5)', () => {
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

  it('surfaces BOTH the ratify count line and the loop-finished line', () => {
    writePending([
      makeAction('ratify-pending', {
        count: 2,
        specs: [{ spec_id: 'spec-x', decision_ids: ['D-001'] }],
      }),
      makeAction('loop-finished', {
        status: 'complete',
        completed_count: 4,
        blocked: [{ id: 'T-2', reason: 'conflict' }],
        base_branch: 'main',
        total_cost: 1.0,
      }),
    ]);

    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectDir };
    delete env.ARCFORGE_SPAWNED;
    const res = spawnSync('node', [INJECT_CONTEXT], {
      input: JSON.stringify({
        session_id: 'ss-test',
        cwd: projectDir,
        hook_event_name: 'SessionStart',
        source: 'startup',
      }),
      encoding: 'utf-8',
      env,
    });

    assert.strictEqual(res.status, 0, res.stderr);
    // Parse the single JSON object the hook emits; assert against the decoded
    // additionalContext so escaped quotes in the raw stdout don't trip us.
    const parsed = JSON.parse(res.stdout.trim());
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('pending ratification'), 'ratify line present');
    assert.ok(
      ctx.includes('ARCFORGE_MODE=attended node "$ARCFORGE_ROOT/scripts/cli.js" ratify'),
      'parsable ratify command present',
    );
    assert.ok(ctx.includes('Loop finished: 4 merged on main'), 'loop-finished line present');
  });

  it('preserves actions under ARCFORGE_SPAWNED, then consumes on the next unmarked start', () => {
    writePending([
      makeAction('ratify-pending', {
        count: 1,
        specs: [{ spec_id: 'spec-x', decision_ids: ['D-001'] }],
      }),
    ]);

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
