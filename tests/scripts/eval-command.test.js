/**
 * eval-command.test.js - `arcforge eval` subcommand paths, trial runner stubbed.
 *
 * The lib's trial runners are replaced so no `claude` session is spawned; the
 * rest of the lib (scenario parsing, result storage, verdicts) runs for real
 * against a temp project root.
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
// The blind comparator is observed, not run: these tests check what it is told
// to redact.
jest.mock('../../scripts/lib/eval-blind-autotrigger', () => ({
  runBlindAutoTrigger: jest.fn(() => ({ skipped: true })),
}));
const { runBlindAutoTrigger } = require('../../scripts/lib/eval-blind-autotrigger');
const { runEvalCommand } = require('../../scripts/cli/eval-command');

const SCENARIO = (name, extra = '') => `# Eval: ${name}

## Scope
agent

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

function writeScenario(root, name, extra) {
  const dir = path.join(root, evalLib.SCENARIOS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), SCENARIO(name, extra));
}

function args(positional, options = {}, flags = {}) {
  return { positional, options, flags };
}

describe('eval command', () => {
  let tempDir;
  let logs;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-command-'));
    logs = [];
    jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('eval run', () => {
    it('judges the verdict over scored trials, so an infra error does not move it (#198)', async () => {
      writeScenario(tempDir, 'run-verdict');
      const row = (t, extra = {}) => ({
        eval: 'run-verdict',
        trial: t,
        k: 6,
        passed: false,
        score: 0,
        grader: 'code',
        timestamp: new Date(Date.UTC(2026, 8, 30, 0, 0, t)).toISOString(),
        runId: '20260930-000000',
        ...extra,
      });
      evalLib.runTrial.mockImplementation((_s, t) =>
        t === 6 ? row(t, { infraError: true, errorType: 'trial_killed_incomplete' }) : row(t),
      );
      evalLib.gradeTrialResult.mockImplementation((r) => ({ ...r, passed: true, score: 1 }));

      await runEvalCommand(args(['run', 'run-verdict'], { k: '6' }), {
        projectRoot: tempDir,
        asJson: false,
      });

      expect(logs).toContain('Verdict: SHIP');
      // An infra error row is recorded as it is, never handed to a grader.
      const gradedTrials = evalLib.gradeTrialResult.mock.calls.map(([r]) => r.trial);
      expect(gradedTrials).toEqual([1, 2, 3, 4, 5]);
      const stored = evalLib.loadResults('run-verdict', tempDir);
      expect(stored.find((r) => r.trial === 6).infraError).toBe(true);
    });
  });

  describe('eval run stops on a repository write', () => {
    it('aborts after the trial that wrote, keeping its row', async () => {
      writeScenario(tempDir, 'run-stop');
      evalLib.runTrial.mockImplementation((_s, t) => ({
        eval: 'run-stop',
        trial: t,
        k: 3,
        passed: false,
        score: 0,
        grader: 'code',
        timestamp: '2026-09-30T00:00:00.000Z',
        runId: '20260930-000000',
        infraError: true,
        errorType: 'trial_wrote_repo',
        error: 'Trial wrote outside its directory: /repo/src/x.js',
      }));

      await expect(
        runEvalCommand(args(['run', 'run-stop'], { k: '3' }), {
          projectRoot: tempDir,
          asJson: false,
        }),
      ).rejects.toThrow(/trial 1 wrote outside its directory: \/repo\/src\/x\.js/);
      expect(evalLib.runTrial).toHaveBeenCalledTimes(1);
      const [row] = evalLib.loadResults('run-stop', tempDir);
      expect(row.errorType).toBe('trial_wrote_repo');
    });
  });

  describe('eval preflight', () => {
    it('records a refused trial without grading it, so no grader session spawns', async () => {
      writeScenario(tempDir, 'preflight-refusal');
      evalLib.runTrial.mockImplementation((_s, t) => ({
        eval: 'preflight-refusal',
        trial: t,
        k: 3,
        passed: false,
        score: 0,
        grader: 'model',
        timestamp: '2026-09-30T00:00:00.000Z',
        infraError: true,
        errorType: 'provider_refusal',
      }));
      jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });

      await expect(
        runEvalCommand(args(['preflight', 'preflight-refusal']), {
          projectRoot: tempDir,
          asJson: false,
        }),
      ).rejects.toThrow('process.exit(1)');

      expect(evalLib.runTrial).toHaveBeenCalledTimes(3);
      expect(evalLib.gradeTrialResult).not.toHaveBeenCalled();
      expect(logs).toContain('Verdict: BLOCK');
    });
  });

  describe('eval preflight turn budget', () => {
    const infraRow = (t) => ({
      eval: 'x',
      trial: t,
      k: 3,
      passed: false,
      score: 0,
      grader: 'code',
      timestamp: '2026-09-30T00:00:00.000Z',
      infraError: true,
      errorType: 'setup_failed',
    });

    async function preflightOpts(name, options = {}) {
      evalLib.runTrial.mockImplementation((_s, t) => infraRow(t));
      jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      await expect(
        runEvalCommand(args(['preflight', name], options), { projectRoot: tempDir, asJson: false }),
      ).rejects.toThrow('process.exit(1)');
      return evalLib.runTrial.mock.calls.map(([, , , opts]) => opts);
    }

    it('gives the baseline the budget a plugin-dir A/B baseline gets', async () => {
      const dir = path.join(tempDir, evalLib.SCENARIOS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'pf-workflow.md'),
        SCENARIO('pf-workflow', `\n## Plugin Dir\n${tempDir}\n`).replace(
          '## Scope\nagent',
          '## Scope\nworkflow',
        ),
      );
      const calls = await preflightOpts('pf-workflow');
      for (const opts of calls) {
        expect(opts.isolated).toBe(true);
        expect(opts.pluginDir).toBeUndefined();
        expect(opts.maxTurns).toBe(10);
        expect(opts.skipPermissions).toBe(true);
      }
    });

    it('honours --max-turns the way eval ab resolves it', async () => {
      writeScenario(tempDir, 'pf-skill');
      const [capped] = await preflightOpts('pf-skill', { 'max-turns': '4' });
      expect(capped.maxTurns).toBe(4);
    });

    it('refuses --plugin-dir outside workflow scope', async () => {
      writeScenario(tempDir, 'pf-skill-plugin');
      jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        runEvalCommand(args(['preflight', 'pf-skill-plugin'], { 'plugin-dir': tempDir }), {
          projectRoot: tempDir,
          asJson: false,
        }),
      ).rejects.toThrow('process.exit(1)');
      expect(evalLib.runTrial).not.toHaveBeenCalled();
    });

    it('leaves the budget unset when the A/B baseline would have none', async () => {
      writeScenario(tempDir, 'pf-plain');
      const [opts] = await preflightOpts('pf-plain');
      expect(opts.maxTurns).toBeUndefined();
      expect(opts.skipPermissions).toBe(false);
    });
  });

  describe('eval ab preflight gate matches the baseline conditions', () => {
    const { runPreflight } = require('../../scripts/lib/eval-preflight');
    let errors;

    beforeEach(() => {
      const dir = path.join(tempDir, evalLib.SCENARIOS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'gated.md'),
        SCENARIO('gated').replace('## Scope\nagent', '## Scope\nworkflow'),
      );
      // A PASS recorded under a plugin-dir baseline: 10 turns, plugin dir in play.
      runPreflight('gated', tempDir, {
        runTrial: () => ({ passed: false, score: 0 }),
        gradeResult: (r) => r,
        conditions: { maxTurns: 10, pluginDir: tempDir },
      });
      evalLib.runWorkflowEval.mockReturnValue({ baseline: [], treatment: [], delta: 0 });
      errors = [];
      jest.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
      jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
    });

    it('runs when the A/B baseline matches the recorded conditions (hit)', async () => {
      await runEvalCommand(args(['ab', 'gated'], { 'plugin-dir': tempDir }), {
        projectRoot: tempDir,
        asJson: false,
      });
      expect(evalLib.runWorkflowEval).toHaveBeenCalledTimes(1);
    });

    it('refuses, naming the mismatch and the command, when they differ (miss)', async () => {
      await expect(
        runEvalCommand(args(['ab', 'gated']), { projectRoot: tempDir, asJson: false }),
      ).rejects.toThrow('process.exit(1)');
      expect(evalLib.runWorkflowEval).not.toHaveBeenCalled();
      const message = errors.join('\n');
      expect(message).toContain('max turns none, plugin dir no');
      expect(message).toContain('recorded under: max turns 10, plugin dir yes');
      expect(message).toContain('Run: arcforge eval preflight gated');
    });
  });

  describe('eval ab, skill scope (B-1, #197)', () => {
    const SKILL_BODY = 'THE SKILL BODY';

    function writeSkillScenario(name, { target = true } = {}) {
      fs.mkdirSync(path.join(tempDir, 'skills', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'skills', 'demo', 'SKILL.md'), SKILL_BODY);
      const extra = `\n## Preflight\nskip\n${target ? '\n## Target\nskills/demo/SKILL.md\n' : ''}`;
      const dir = path.join(tempDir, evalLib.SCENARIOS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${name}.md`),
        SCENARIO(name, extra).replace('## Scope\nagent', '## Scope\nskill'),
      );
    }

    beforeEach(() => {
      evalLib.runSkillEval.mockReturnValue({ baseline: [], treatment: [], delta: 0 });
      jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('refuses --plugin-dir, pointing at workflow scope and claude plugin eval', async () => {
      writeSkillScenario('ab-plugin');
      await expect(
        runEvalCommand(args(['ab', 'ab-plugin'], { 'plugin-dir': tempDir }), {
          projectRoot: tempDir,
          asJson: false,
        }),
      ).rejects.toThrow('process.exit(1)');
      expect(evalLib.runSkillEval).not.toHaveBeenCalled();
      const message = console.error.mock.calls.join('\n');
      expect(message).toContain('workflow');
      expect(message).toContain('claude plugin eval');
    });

    it('refuses --skill-file together with --plugin-dir', async () => {
      writeSkillScenario('ab-both');
      await expect(
        runEvalCommand(
          args(['ab', 'ab-both'], {
            'plugin-dir': tempDir,
            'skill-file': 'skills/demo/SKILL.md',
          }),
          { projectRoot: tempDir, asJson: false },
        ),
      ).rejects.toThrow('process.exit(1)');
      expect(evalLib.runSkillEval).not.toHaveBeenCalled();
    });

    it('redacts the skill folder name, not "SKILL", for a SKILL.md target', async () => {
      writeSkillScenario('ab-name');
      await runEvalCommand(args(['ab', 'ab-name']), { projectRoot: tempDir, asJson: false });
      const [, , , , opts] = runBlindAutoTrigger.mock.calls.at(-1);
      expect(opts.skillName).toBe('demo');
    });

    it('still injects the body when only --skill-file (or ## Target) is given', async () => {
      writeSkillScenario('ab-skill');
      await runEvalCommand(args(['ab', 'ab-skill']), { projectRoot: tempDir, asJson: false });
      const [, , opts] = evalLib.runSkillEval.mock.calls[0];
      expect(opts.skillInstruction).toBe(SKILL_BODY);
      expect(opts.pluginDir).toBeUndefined();
    });
  });
});
