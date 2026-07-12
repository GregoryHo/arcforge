/**
 * autopilot-deny tests (Node --test runner).
 *
 * The deny is ACTIVE ONLY under a live loop sentinel. It reads the same
 * per-session state arc-remind writes (test-seen counter, edited-SKILL.md paths)
 * and the benchmark freshness — so the tests fabricate a `.arcforge-loop.json`
 * sentinel, set CLAUDE_SESSION_ID, and drive those state files directly.
 *
 * Matrix: loopSentinelPresent {false,true} × test-seen {0,present} × stale-eval,
 * plus the hard invariant that `gh pr create` is NEVER denied.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createSessionCounter, clearCachedSessionId } = require('../../scripts/lib/utils');
const { evaluate } = require('../autopilot-deny/main');
const arcRemind = require('../arc-remind/main');

describe('autopilot-deny evaluate', () => {
  let dirs;
  let savedSessionId;

  beforeEach(() => {
    dirs = [];
    savedSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = `ws3-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearCachedSessionId();
  });

  afterEach(() => {
    // Best-effort cleanup of the per-session state files.
    try {
      fs.rmSync(arcRemind.skillEditStatePath(), { force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(createSessionCounter('arc-remind-test-seen').getFilePath(), { force: true });
    } catch {
      /* ignore */
    }
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    if (savedSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = savedSessionId;
    clearCachedSessionId();
  });

  /** Temp dir carrying a live (running, fresh) loop sentinel. */
  function loopDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-loop-'));
    fs.writeFileSync(path.join(d, '.arcforge-loop.json'), JSON.stringify({ status: 'running' }));
    dirs.push(d);
    return d;
  }

  /** Plain temp dir with no sentinel (attended session). */
  function plainDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-plain-'));
    dirs.push(d);
    return d;
  }

  function setTestSeen(n) {
    createSessionCounter('arc-remind-test-seen').write(n);
  }

  /** Record a fresh SKILL.md edit and an OLD benchmark → stale-eval fires. */
  function makeStale(cwd) {
    const skillDir = path.join(cwd, 'skills', 'arc-x');
    fs.mkdirSync(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillFile, '# skill\n');
    arcRemind.recordSkillEdit(skillFile, cwd);
    const benchDir = path.join(cwd, 'evals', 'benchmarks');
    fs.mkdirSync(benchDir, { recursive: true });
    fs.writeFileSync(
      path.join(benchDir, 'latest.json'),
      JSON.stringify({ generated: '2000-01-01T00:00:00.000Z' }),
    );
  }

  function bash(command, cwd) {
    return evaluate({ tool_name: 'Bash', tool_input: { command }, cwd });
  }

  it('attended (no sentinel): never denies, even with no test seen', () => {
    const cwd = plainDir();
    setTestSeen(0);
    assert.strictEqual(bash('gh pr merge 42', cwd), null);
    assert.strictEqual(bash('git push origin main', cwd), null);
  });

  it('autopilot + no test seen: DENIES gh pr merge', () => {
    const cwd = loopDir();
    setTestSeen(0);
    const reason = bash('gh pr merge 42', cwd);
    assert.ok(reason, 'should deny');
    assert.ok(reason.includes('no test command was observed'), 'names the missing evidence');
    assert.ok(reason.includes('ARCFORGE_DISABLED_HOOKS'), 'documents the override');
  });

  it('autopilot + no test seen: DENIES git push', () => {
    const cwd = loopDir();
    setTestSeen(0);
    assert.ok(bash('git push', cwd), 'should deny git push');
  });

  it('autopilot + test seen + fresh eval: ALLOWS the ship', () => {
    const cwd = loopDir();
    setTestSeen(1);
    // No skill edits recorded → stale-eval cannot fire.
    assert.strictEqual(bash('gh pr merge 42', cwd), null);
    assert.strictEqual(bash('git push', cwd), null);
  });

  it('autopilot + test seen but STALE eval: DENIES the ship', () => {
    const cwd = loopDir();
    setTestSeen(1);
    makeStale(cwd);
    const reason = bash('git push', cwd);
    assert.ok(reason, 'should deny on stale eval even with a test seen');
    assert.ok(reason.includes('no eval postdates the edit'), 'names the stale-eval reason');
  });

  it('NEVER denies `gh pr create`, even under autopilot with no evidence', () => {
    const cwd = loopDir();
    setTestSeen(0);
    makeStale(cwd);
    assert.strictEqual(bash('gh pr create --fill', cwd), null);
  });

  it('ignores non-ship Bash and non-Bash tools', () => {
    const cwd = loopDir();
    setTestSeen(0);
    assert.strictEqual(bash('npm test', cwd), null);
    assert.strictEqual(bash('git status', cwd), null);
    assert.strictEqual(evaluate({ tool_name: 'Edit', tool_input: { file_path: 'x' }, cwd }), null);
    assert.strictEqual(evaluate(null), null);
  });
});
