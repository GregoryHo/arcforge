/**
 * Dispatcher parity + fault-isolation tests.
 *
 * The e2e suite spawns entry files directly, so it can never prove the two
 * consolidated dispatchers (dispatch-pre.js / dispatch-post.js) reproduce the
 * former per-hook behavior. These tests do:
 *
 *   1. PARITY — for each sub-hook scenario, the dispatcher's stdout JSON is
 *      byte-identical to the standalone hook's stdout (run with a fresh session
 *      so per-session counters don't cross-talk), plus the no-op-emits-NOTHING
 *      invariant for every sub-hook.
 *   2. FAULT ISOLATION — one rule throwing must not block the event or its
 *      siblings; the dispatcher still exits 0.
 *   3. ARCFORGE_DISABLED_HOOKS — disabling one sub-hook id leaves its siblings
 *      (and the shared counter) running.
 *   4. observe fast-path — the disabled learning path emits nothing and exits 0.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const HOOKS_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(HOOKS_DIR, '..');

const DISPATCH_PRE = path.join(HOOKS_DIR, 'dispatch-pre.js');
const DISPATCH_POST = path.join(HOOKS_DIR, 'dispatch-post.js');

let uid = 0;
function freshSession(tag) {
  uid += 1;
  return `disp-${tag}-${Date.now()}-${uid}`;
}

function runScript(script, input, { env = {}, args = [] } = {}) {
  const r = spawnSync('node', [script, ...args], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    timeout: 15000,
    env: { ...process.env, ...env },
  });
  return { stdout: (r.stdout || '').trim(), stderr: r.stderr || '', status: r.status ?? 1 };
}

/**
 * Assert the dispatcher and the standalone hook produce identical stdout for the
 * same event. Each is given its OWN fresh session id so once-per-session
 * counters start clean for both runs.
 */
function assertParity(dispatcher, standalone, buildInput, { env = {}, tag } = {}) {
  const soloInput = buildInput(freshSession(`${tag}-solo`));
  const dispInput = buildInput(freshSession(`${tag}-disp`));
  const solo = runScript(standalone.script, soloInput, { env, args: standalone.args || [] });
  const disp = runScript(dispatcher, dispInput, { env });
  assert.strictEqual(disp.status, 0, `dispatcher exit 0 (stderr: ${disp.stderr})`);
  if (solo.stdout === '') {
    assert.strictEqual(disp.stdout, '', `${tag}: both emit nothing`);
    return;
  }
  assert.deepStrictEqual(
    JSON.parse(disp.stdout),
    JSON.parse(solo.stdout),
    `${tag}: dispatcher output must equal standalone hook output`,
  );
}

describe('PreToolUse dispatcher parity', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-pre-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('arc-guard deny (git merge in an epic worktree) matches standalone', () => {
    fs.writeFileSync(path.join(dir, '.arcforge-epic'), 'epic: e\nspec_id: s\n');
    assertParity(
      DISPATCH_PRE,
      { script: path.join(HOOKS_DIR, 'arc-guard', 'main.js') },
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Bash',
        tool_input: { command: 'git merge feature' },
      }),
      { tag: 'arc-guard-deny' },
    );
  });

  it('sdd-ledger-guard deny (forged status:accepted on a new decisions.yml) matches standalone', () => {
    const ledger = path.join(dir, 'decisions.yml');
    assertParity(
      DISPATCH_PRE,
      { script: path.join(HOOKS_DIR, 'sdd-ledger-guard', 'main.js') },
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Write',
        tool_input: { file_path: ledger, content: '- D-id: D1\n  status: accepted\n' },
      }),
      { tag: 'ledger-deny' },
    );
  });

  it('sdd-ratify-guard deny (ratify during a live loop) matches standalone', () => {
    fs.writeFileSync(path.join(dir, '.arcforge-loop.json'), JSON.stringify({ status: 'running' }));
    assertParity(
      DISPATCH_PRE,
      { script: path.join(HOOKS_DIR, 'sdd-ratify-guard', 'main.js') },
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Bash',
        tool_input: { command: 'arcforge ratify D1' },
      }),
      { tag: 'ratify-deny' },
    );
  });

  it('no-op invariant: a benign Bash command emits nothing', () => {
    const r = runScript(DISPATCH_PRE, {
      session_id: freshSession('pre-noop'),
      cwd: dir,
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.status, 0);
  });
});

describe('PostToolUse dispatcher parity', () => {
  let dir;
  let env;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-post-'));
    env = { TMPDIR: dir };
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const arcRemind = { script: path.join(HOOKS_DIR, 'arc-remind', 'main.js') };
  const compact = { script: path.join(HOOKS_DIR, 'compact-suggester', 'main.js') };

  it('arc-remind PR-boundary nudge (attended) matches standalone', () => {
    assertParity(
      DISPATCH_POST,
      arcRemind,
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Bash',
        tool_input: { command: 'gh pr create --fill' },
      }),
      { env, tag: 'pr-attended' },
    );
  });

  it('arc-remind PR-boundary nudge (autopilot: both channels) matches standalone', () => {
    fs.writeFileSync(path.join(dir, '.arcforge-loop.json'), JSON.stringify({ status: 'running' }));
    assertParity(
      DISPATCH_POST,
      arcRemind,
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Bash',
        tool_input: { command: 'gh pr create --fill' },
      }),
      { env, tag: 'pr-autopilot' },
    );
  });

  it('arc-remind worktree-add nudge matches standalone', () => {
    fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });
    assertParity(
      DISPATCH_POST,
      arcRemind,
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Bash',
        tool_input: { command: 'git worktree add ../wt feature' },
      }),
      { env, tag: 'worktree-add' },
    );
  });

  it('arc-remind main-branch nudge matches standalone', () => {
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const jsFile = path.join(dir, 'app.js');
    fs.writeFileSync(jsFile, 'const x = 1;\n');
    assertParity(
      DISPATCH_POST,
      arcRemind,
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Edit',
        tool_input: { file_path: jsFile, old_string: 'x', new_string: 'y' },
      }),
      { env, tag: 'main-branch' },
    );
  });

  it('arc-remind spec→dag nudge matches standalone', () => {
    const specDir = path.join(dir, 'specs', 'sdd-a');
    fs.mkdirSync(specDir, { recursive: true });
    const specXml = path.join(specDir, 'spec.xml');
    fs.writeFileSync(specXml, '<spec/>\n');
    assertParity(
      DISPATCH_POST,
      arcRemind,
      (session_id) => ({
        session_id,
        cwd: dir,
        tool_name: 'Write',
        tool_input: { file_path: specXml, content: '<spec/>\n' },
      }),
      { env, tag: 'spec-dag' },
    );
  });

  it('compact-suggester threshold hit matches standalone', () => {
    // Seed each run's own suggester state at 49 (its own fresh session id).
    const dispatcher = (script, buildInput, tag) => {
      const session = freshSession(tag);
      const stateFile = path.join(dir, `arcforge-suggester-state-session-${session}.json`);
      fs.writeFileSync(
        stateFile,
        JSON.stringify({ tools: 49, reads: 0, writes: 0, window: [], suggestions: [] }),
      );
      return runScript(script, buildInput(session), { env });
    };
    const build = (session_id) => ({
      session_id,
      cwd: dir,
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/x.js' },
    });
    const solo = dispatcher(compact.script, build, 'compact-solo');
    const disp = dispatcher(DISPATCH_POST, build, 'compact-disp');
    assert.strictEqual(disp.status, 0, disp.stderr);
    assert.deepStrictEqual(JSON.parse(disp.stdout), JSON.parse(solo.stdout));
    assert.ok(JSON.parse(disp.stdout).systemMessage.includes('tool call'));
  });

  it('no-op invariant: a benign Read event emits nothing (every sub-hook silent)', () => {
    const r = runScript(
      DISPATCH_POST,
      {
        session_id: freshSession('post-noop'),
        cwd: dir,
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/x.js' },
      },
      { env },
    );
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.status, 0);
  });

  it('Stop-batch invariant: an Edit accumulates but runs no tsc / emits nothing', () => {
    const jsFile = path.join(dir, 'app.js');
    fs.writeFileSync(jsFile, 'console.log("x");\n');
    const r = runScript(
      DISPATCH_POST,
      {
        session_id: freshSession('post-accum'),
        cwd: dir,
        tool_name: 'Edit',
        tool_input: { file_path: jsFile, old_string: 'x', new_string: 'y' },
      },
      { env },
    );
    // Accumulate-only: no per-edit findings, no tsc, silent.
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.status, 0);
  });
});

describe('dispatcher fault isolation (runRules)', () => {
  it('one rule throwing does not block siblings or crash the dispatcher', () => {
    const dispatchPath = path.resolve(PROJECT_ROOT, 'scripts', 'lib', 'hook-dispatch.js');
    const code = `
      const { runRules } = require(${JSON.stringify(dispatchPath)});
      const { results } = runRules([
        { id: 'boom', evaluate: () => { throw new Error('boom'); } },
        { id: 'ok', evaluate: (input) => ({ ran: true, tool: input && input.tool_name }) },
      ]);
      process.stdout.write(JSON.stringify(results));
    `;
    const r = spawnSync('node', ['-e', code], {
      input: JSON.stringify({ tool_name: 'Read', session_id: 'fault-iso' }),
      encoding: 'utf-8',
      timeout: 15000,
    });
    assert.strictEqual(r.status, 0, `no crash (stderr: ${r.stderr})`);
    assert.deepStrictEqual(JSON.parse(r.stdout.trim()), [
      { id: 'boom', value: null },
      { id: 'ok', value: { ran: true, tool: 'Read' } },
    ]);
  });
});

describe('ARCFORGE_DISABLED_HOOKS granularity', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-disable-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('disabling arc-remind suppresses its nudge but a sibling (compact) still fires', () => {
    const session = freshSession('disable');
    const stateFile = path.join(dir, `arcforge-suggester-state-session-${session}.json`);
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ tools: 49, reads: 0, writes: 0, window: [], suggestions: [] }),
    );
    // Bash gh pr create would normally nudge via arc-remind; disabling it must
    // not stop compact-suggester (seeded at 49) from firing on the same event.
    const r = runScript(
      DISPATCH_POST,
      {
        session_id: session,
        cwd: dir,
        tool_name: 'Bash',
        tool_input: { command: 'gh pr create --fill' },
      },
      { env: { TMPDIR: dir, ARCFORGE_DISABLED_HOOKS: 'arc-remind' } },
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    // Compact fired (sibling unaffected)…
    assert.ok(parsed.systemMessage.includes('tool call'), 'compact-suggester still fired');
    // …but arc-remind's PR-boundary nudge is absent.
    assert.ok(!parsed.systemMessage.includes('PR boundary'), 'arc-remind suppressed');
  });
});

describe('observe fast-path (learning disabled)', () => {
  const observe = path.join(HOOKS_DIR, 'observe', 'main.js');
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-observe-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('ARCFORGE_OBSERVE_EXPLICIT_SKIP=1 → emits nothing, exit 0, no observation written', () => {
    const r = runScript(
      observe,
      { tool_name: 'Read', tool_input: { file_path: '/tmp/x' }, cwd: PROJECT_ROOT },
      {
        args: ['pre'],
        env: { ARCFORGE_OBSERVE_EXPLICIT_SKIP: '1', HOME: dir, CLAUDE_PROJECT_DIR: dir },
      },
    );
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.status, 0);
    assert.ok(
      !fs.existsSync(path.join(dir, '.claude', 'observations')),
      'no observation file written on the fast-path',
    );
  });

  it('no learning config anywhere → fast-path skip, exit 0, nothing written', () => {
    const r = runScript(
      observe,
      { tool_name: 'Read', tool_input: { file_path: '/tmp/x' }, cwd: dir },
      {
        args: ['pre'],
        env: { HOME: dir, CLAUDE_PROJECT_DIR: dir, ARCFORGE_HOME: path.join(dir, '.arcforge') },
      },
    );
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'observations')), 'nothing written');
  });
});
