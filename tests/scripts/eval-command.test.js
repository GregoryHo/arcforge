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
});
