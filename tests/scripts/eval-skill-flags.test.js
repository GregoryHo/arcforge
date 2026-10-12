/**
 * eval-skill-flags.test.js - `eval ab --stage-skill-files` (B-19), trial runner
 * stubbed: what the command hands the runner, and what it refuses.
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

describe('eval ab skill flags', () => {
  let tempDir;
  let logs;

  function writeScenario(name, { scope = 'skill', extra = '\n## Preflight\nskip\n' } = {}) {
    const dir = path.join(tempDir, evalLib.SCENARIOS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.md`), SCENARIO(name, scope, extra));
  }

  function writeSkill(name, body) {
    const dir = path.join(tempDir, 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
    return path.join('skills', name, 'SKILL.md');
  }

  const run = (argv) => runEvalCommand(argv, { projectRoot: tempDir, asJson: false });
  const skillEvalOptions = () => evalLib.runSkillEval.mock.calls[0][2];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-flags-'));
    logs = [];
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const none = { baseline: [], treatment: [], delta: 0 };
    evalLib.runSkillEval.mockReturnValue(none);
    evalLib.runWorkflowEval.mockReturnValue(none);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('--stage-skill-files (B-19)', () => {
    it('hands the runner the resolved skill file path and the staging flag', async () => {
      writeScenario('staged');
      const skill = writeSkill('demo', 'NEW');
      await run(args(['ab', 'staged'], { 'skill-file': skill }, { 'stage-skill-files': true }));
      expect(skillEvalOptions()).toEqual(
        expect.objectContaining({
          skillInstruction: 'NEW',
          skillFile: path.join(tempDir, skill),
          stageSkillFiles: true,
        }),
      );
      expect(logs.join('\n')).toContain(`Skill: ${skill} (files staged)`);
    });

    it('stages nothing unless asked', async () => {
      writeScenario('plain');
      const skill = writeSkill('demo', 'NEW');
      await run(args(['ab', 'plain'], { 'skill-file': skill }));
      expect(skillEvalOptions().stageSkillFiles).toBe(false);
    });

    it('is refused for a workflow scenario, which injects no skill text', async () => {
      writeScenario('flow', { scope: 'workflow' });
      await expect(
        run(args(['ab', 'flow'], { model: 'opus', effort: 'high' }, { 'stage-skill-files': true })),
      ).rejects.toThrow(/--stage-skill-files is refused for a workflow-scope scenario/);
      expect(evalLib.runWorkflowEval).not.toHaveBeenCalled();
    });
  });
});
