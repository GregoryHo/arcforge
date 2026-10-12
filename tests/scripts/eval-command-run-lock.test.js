/**
 * eval-command-run-lock.test.js - `eval run`, `eval preflight` and `eval ab`
 * hold the checkout's run lock; a second live eval is refused.
 *
 * The lib's trial runners are replaced so no `claude` session is spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/eval', () => {
  const actual = jest.requireActual('../../scripts/lib/eval');
  return {
    ...actual,
    runTrial: jest.fn(),
    gradeTrialResult: jest.fn(),
    runSkillEval: jest.fn(),
    runWorkflowEval: jest.fn(),
  };
});
const evalLib = require('../../scripts/lib/eval');
jest.mock('../../scripts/lib/eval-blind-autotrigger', () => ({
  runBlindAutoTrigger: jest.fn(() => ({ skipped: true })),
}));
const { runEvalCommand } = require('../../scripts/cli/eval-command');
const { RUN_LOCK_RELATIVE } = require('../../scripts/lib/eval-run-lock');

const SCENARIO = (name, scope, extra = '') => `# Eval: ${name}

## Scope
${scope}

## Scenario
Do something.

## Context
A fixture.

## Assertions
- [ ] A1: It works

## Grader
code

## Grader Config
true
${extra}`;

const args = (positional, options = {}, flags = {}) => ({ positional, options, flags });

describe('eval run lock', () => {
  let tempDir;
  let lockPath;
  let logs;
  const run = (positional) =>
    runEvalCommand(args(positional), { projectRoot: tempDir, asJson: false });
  const readLock = () => JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  // The parent process outlives this test, so it stands in for another live eval.
  const OTHER = { pid: process.ppid, started: '2026-10-12T08:00:00.000Z', command: 'other eval' };
  const plantLiveLock = () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify(OTHER));
  };
  const trialRow = (name, t, extra = {}) => ({
    eval: name,
    trial: t,
    k: 1,
    passed: true,
    score: 1,
    grader: 'code',
    timestamp: '2026-10-12T00:00:00.000Z',
    ...extra,
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-run-lock-'));
    lockPath = path.join(tempDir, RUN_LOCK_RELATIVE);
    logs = [];
    jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    jest.clearAllMocks();

    const dir = path.join(tempDir, evalLib.SCENARIOS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'solo.md'), SCENARIO('solo', 'agent'));
    fs.mkdirSync(path.join(tempDir, 'skills', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'skills', 'demo', 'SKILL.md'), 'BODY');
    fs.writeFileSync(
      path.join(dir, 'pair.md'),
      SCENARIO('pair', 'skill', '\n## Preflight\nskip\n\n## Target\nskills/demo/SKILL.md\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'gated.md'),
      SCENARIO('gated', 'skill', '\n## Target\nskills/demo/SKILL.md\n'),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('while another live eval holds the lock', () => {
    beforeEach(plantLiveLock);

    it.each([
      ['run', 'solo'],
      ['preflight', 'solo'],
      ['ab', 'pair'],
      ['report'],
    ])('eval %s refuses before any trial, naming the holder', async (...positional) => {
      const { message } = await run(positional).catch((err) => err);

      expect(message).toContain('Another eval is running in this checkout');
      expect(message).toContain(`PID ${OTHER.pid}`);
      expect(message).toContain(OTHER.started);
      expect(message).toContain(lockPath);
      expect(evalLib.runTrial).not.toHaveBeenCalled();
      expect(evalLib.runSkillEval).not.toHaveBeenCalled();
      // No progress line before the refusal, and the holder's lock is untouched.
      expect(logs).toEqual([]);
      expect(readLock()).toEqual(OTHER);
    });

    it('eval ab refuses before the preflight gate reads a record still being written', async () => {
      const { message } = await run(['ab', 'gated']).catch((err) => err);

      expect(message).toContain('Another eval is running in this checkout');
    });

    it('a refusal of the invocation itself still comes first', async () => {
      await expect(run(['run', 'no-such-scenario'])).rejects.toThrow('not found');
    });

    it('eval report writes no benchmark a live trial would be blamed for', async () => {
      await run(['report']).catch(() => {});

      expect(fs.existsSync(path.join(tempDir, evalLib.BENCHMARKS_DIR))).toBe(false);
    });

    it('commands that start no trial and write no benchmark are not locked out', async () => {
      await run(['list']);

      expect(logs.join('\n')).toContain('solo (agent, code');
      expect(readLock()).toEqual(OTHER);
    });
  });

  it('eval run holds the lock for its trials and releases it after', async () => {
    let during;
    evalLib.runTrial.mockImplementation((_s, t) => {
      during = readLock();
      return trialRow('solo', t);
    });
    evalLib.gradeTrialResult.mockImplementation((r) => r);

    await runEvalCommand(args(['run', 'solo'], { k: '1' }), {
      projectRoot: tempDir,
      asJson: false,
    });

    expect(during.pid).toBe(process.pid);
    expect(during.command).toBe('arcforge eval run solo');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('eval ab holds the lock for both arms and releases it after', async () => {
    let during;
    evalLib.runSkillEval.mockImplementation(() => {
      during = readLock();
      return { baseline: [], treatment: [], delta: 0 };
    });

    await run(['ab', 'pair']);

    expect(during.command).toBe('arcforge eval ab pair');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('eval report holds the lock while it writes the benchmark, under its own name', async () => {
    const benchmarkLib = require('../../scripts/lib/eval-benchmark');
    let during;
    const generate = benchmarkLib.generateBenchmark;
    jest.spyOn(benchmarkLib, 'generateBenchmark').mockImplementation((...a) => {
      during = readLock();
      return generate(...a);
    });

    await run(['report']);

    expect(during.command).toBe('arcforge eval report');
    expect(fs.existsSync(path.join(tempDir, evalLib.BENCHMARKS_DIR, 'latest.json'))).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('eval preflight releases the lock when it exits on BLOCK', async () => {
    let during;
    evalLib.runTrial.mockImplementation((_s, t) => {
      during = readLock();
      return trialRow('solo', t, { infraError: true, errorType: 'setup_failed' });
    });

    await expect(run(['preflight', 'solo'])).rejects.toThrow('process.exit(1)');

    expect(during.command).toBe('arcforge eval preflight solo');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('releases the lock when a trial throws', async () => {
    evalLib.runTrial.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    await expect(run(['run', 'solo'])).rejects.toThrow('spawn failed');

    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('releases the lock when the preflight gate refuses the A/B', async () => {
    await expect(run(['ab', 'gated'])).rejects.toThrow(/preflight/i);

    expect(evalLib.runSkillEval).not.toHaveBeenCalled();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('an invocation refused before the lock creates no .eval-trials directory', async () => {
    await expect(run(['run', 'no-such-scenario'])).rejects.toThrow('not found');

    expect(fs.existsSync(path.join(tempDir, '.eval-trials'))).toBe(false);
  });
});
