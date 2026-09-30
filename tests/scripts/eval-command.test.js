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

  describe('eval ab, skill scope (B-1, #197)', () => {
    const SKILL_BODY = 'SKILL BODY THAT MUST NOT REACH A PLUGIN-ROUTED TREATMENT';

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

    it('loads the plugin without injecting the ## Target body', async () => {
      writeSkillScenario('ab-plugin');
      await runEvalCommand(args(['ab', 'ab-plugin'], { 'plugin-dir': tempDir }), {
        projectRoot: tempDir,
        asJson: false,
      });
      const [, , opts] = evalLib.runSkillEval.mock.calls[0];
      expect(opts.pluginDir).toBe(tempDir);
      expect(opts.skillInstruction).toBeUndefined();
    });

    it('runs a plugin-routed comparison for a scenario with no ## Target', async () => {
      writeSkillScenario('ab-plugin-no-target', { target: false });
      await runEvalCommand(args(['ab', 'ab-plugin-no-target'], { 'plugin-dir': tempDir }), {
        projectRoot: tempDir,
        asJson: false,
      });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
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

    it('still injects the body when only --skill-file (or ## Target) is given', async () => {
      writeSkillScenario('ab-skill');
      await runEvalCommand(args(['ab', 'ab-skill']), { projectRoot: tempDir, asJson: false });
      const [, , opts] = evalLib.runSkillEval.mock.calls[0];
      expect(opts.skillInstruction).toBe(SKILL_BODY);
      expect(opts.pluginDir).toBeUndefined();
    });
  });
});
