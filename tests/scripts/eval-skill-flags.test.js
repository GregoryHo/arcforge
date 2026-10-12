/**
 * eval-skill-flags.test.js - `--stage-skill-files` (B-19) and
 * `--baseline-skill-file` (B-20) on `eval ab` and `eval preflight`, trial runner
 * stubbed: what the commands hand the runner, and what they refuse.
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
const { runBlindAutoTrigger } = require('../../scripts/lib/eval-blind-autotrigger');
const { runEvalCommand } = require('../../scripts/cli/eval-command');
const { runPreflight } = require('../../scripts/lib/eval-preflight');
const { digestSkillDir, hashSkillText } = require('../../scripts/lib/eval-skill-staging');

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

  describe('--baseline-skill-file (B-20)', () => {
    it('hands the runner the baseline text and the path it was read from', async () => {
      writeScenario('two-text');
      const skill = writeSkill('demo', 'NEW');
      const old = writeSkill('demo-old', 'OLD');
      await run(
        args(
          ['ab', 'two-text'],
          { 'skill-file': skill, 'baseline-skill-file': old },
          { 'stage-skill-files': true },
        ),
      );
      expect(skillEvalOptions()).toEqual(
        expect.objectContaining({
          skillInstruction: 'NEW',
          skillFile: path.join(tempDir, skill),
          baselineSkillInstruction: 'OLD',
          baselineSkillFile: path.join(tempDir, old),
          stageSkillFiles: true,
        }),
      );
      expect(logs.join('\n')).toContain(`Baseline text: ${old}`);
    });

    it('hands the blind comparator both skill names to redact', async () => {
      writeScenario('two-names');
      const skill = writeSkill('demo', 'NEW');
      const old = writeSkill('demo-old', 'OLD');
      await run(args(['ab', 'two-names'], { 'skill-file': skill, 'baseline-skill-file': old }));
      expect(runBlindAutoTrigger.mock.calls.at(-1)[4].skillName).toEqual(['demo', 'demo-old']);
    });

    it('gives the baseline no text without the flag', async () => {
      writeScenario('one-text');
      await run(args(['ab', 'one-text'], { 'skill-file': writeSkill('demo', 'NEW') }));
      expect(skillEvalOptions().baselineSkillInstruction).toBeUndefined();
      expect(skillEvalOptions().baselineSkillFile).toBeUndefined();
    });

    it('refuses a baseline skill file that does not exist', async () => {
      writeScenario('missing');
      await expect(
        run(
          args(['ab', 'missing'], {
            'skill-file': writeSkill('demo', 'NEW'),
            'baseline-skill-file': 'skills/gone/SKILL.md',
          }),
        ),
      ).rejects.toThrow('skill file not found: skills/gone/SKILL.md');
      expect(evalLib.runSkillEval).not.toHaveBeenCalled();
    });

    it('refuses an empty baseline skill file, which would be injected as no text', async () => {
      writeScenario('empty');
      const empty = writeSkill('demo-empty', '');
      await expect(
        run(
          args(
            ['ab', 'empty'],
            { 'skill-file': writeSkill('demo', 'NEW'), 'baseline-skill-file': empty },
            { 'stage-skill-files': true },
          ),
        ),
      ).rejects.toThrow(`--baseline-skill-file ${empty} is empty`);
      expect(evalLib.runSkillEval).not.toHaveBeenCalled();
    });

    it('is refused for a workflow scenario', async () => {
      writeScenario('flow-text', { scope: 'workflow' });
      await expect(
        run(
          args(['ab', 'flow-text'], {
            model: 'opus',
            effort: 'high',
            'baseline-skill-file': writeSkill('demo-old', 'OLD'),
          }),
        ),
      ).rejects.toThrow(/--baseline-skill-file is refused for a workflow-scope scenario/);
      expect(evalLib.runWorkflowEval).not.toHaveBeenCalled();
    });
  });

  describe('the preflight gate is keyed on the baseline text (B-20)', () => {
    const preflight = (conditions = {}) =>
      runPreflight('gated', tempDir, {
        runTrial: () => ({ passed: false, score: 0 }),
        gradeResult: (r) => r,
        conditions,
      });
    const ab = (options, flags) => run(args(['ab', 'gated'], options, flags));
    let skill;
    let old;

    beforeEach(() => {
      writeScenario('gated', { extra: '' });
      skill = writeSkill('demo', 'NEW');
      old = writeSkill('demo-old', 'OLD');
    });

    it('a no-text preflight does not unlock a two-text A/B', async () => {
      preflight();
      await ab({ 'skill-file': skill });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);

      const { message } = await ab({ 'skill-file': skill, 'baseline-skill-file': old }).catch(
        (err) => err,
      );
      expect(message).toContain('No preflight record found for scenario "gated"');
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
    });

    it('a preflight for that baseline text unlocks it, and no other text', async () => {
      preflight({ baselineSkillHash: hashSkillText('OLD') });
      await ab({ 'skill-file': skill, 'baseline-skill-file': old });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);

      const other = writeSkill('demo-older', 'OLDER');
      await expect(ab({ 'skill-file': skill, 'baseline-skill-file': other })).rejects.toThrow(
        /No preflight record found/,
      );
      // The same text with its files staged is another baseline.
      await expect(
        ab({ 'skill-file': skill, 'baseline-skill-file': old }, { 'stage-skill-files': true }),
      ).rejects.toThrow(/No preflight record found/);
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
    });

    it('staging alone leaves a no-text baseline as it was, so its preflight still holds', async () => {
      preflight();
      await ab({ 'skill-file': skill }, { 'stage-skill-files': true });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
    });
  });

  describe('eval preflight runs the baseline the A/B will run (B-20)', () => {
    const BASE_LINE = /^Base directory for this skill: (.+)\n\nOLD\n\nA fixture\.$/;
    let skill;
    let old;
    let seen;

    beforeEach(() => {
      writeScenario('gated', { extra: '' });
      skill = writeSkill('demo', 'NEW');
      old = writeSkill('demo-old', 'OLD');
      fs.writeFileSync(path.join(tempDir, 'skills', 'demo-old', 'verify.sh'), 'echo old\n');
      seen = [];
      evalLib.runTrial.mockImplementation((scenario, _t, _k, options) => {
        const staged = scenario.context.match(BASE_LINE)?.[1];
        seen.push({
          context: scenario.context,
          options,
          staged,
          stagedFiles: staged ? fs.readdirSync(staged).sort() : null,
        });
        return { passed: false, score: 0 };
      });
      evalLib.gradeTrialResult.mockImplementation((r) => r);
    });

    const preflight = (options, flags) => run(args(['preflight', 'gated'], options, flags));
    const ab = (options, flags) => run(args(['ab', 'gated'], options, flags));
    const records = () => fs.readdirSync(path.join(tempDir, 'evals', 'preflight'));

    it('injects the baseline text and keys the record on its hash', async () => {
      await preflight({ 'baseline-skill-file': old });
      expect(seen).toHaveLength(3);
      for (const trial of seen) {
        expect(trial.context).toBe('OLD\n\nA fixture.');
        expect(trial.options.skillInjection).toEqual(
          expect.objectContaining({
            textHash: hashSkillText('OLD'),
            baselineHash: hashSkillText('OLD'),
            baseDir: null,
            staged: false,
          }),
        );
      }
      expect(records()).toEqual([
        expect.stringMatching(`-default-b${hashSkillText('OLD')}\\.json$`),
      ]);

      // That record unlocks the two-text A/B, and nothing else.
      await expect(ab({ 'skill-file': skill })).rejects.toThrow(/No preflight record found/);
      await ab({ 'skill-file': skill, 'baseline-skill-file': old });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
    });

    it('stages the baseline files with --stage-skill-files, a copy for each trial', async () => {
      await preflight({ 'baseline-skill-file': old }, { 'stage-skill-files': true });
      const [first] = seen;
      expect(first.staged.startsWith(os.tmpdir())).toBe(true);
      expect(first.staged).not.toContain('.eval-trials');
      // A copy of its own for each trial, gone once the trial has ended.
      expect(new Set(seen.map((trial) => trial.staged)).size).toBe(seen.length);
      for (const trial of seen) {
        expect(trial.stagedFiles).toEqual(['SKILL.md', 'verify.sh']);
        expect(trial.options.skillInjection).toEqual(
          expect.objectContaining({ baseDir: trial.staged, staged: true }),
        );
        // What each trial watches while it runs and is checked against once it ends.
        expect(trial.options.skillInjection.copies).toEqual([
          { dir: trial.staged, filesHash: first.options.skillInjection.filesHash },
        ]);
        expect(fs.existsSync(trial.staged)).toBe(false);
      }
      const oldDir = path.join(tempDir, 'skills', 'demo-old');
      expect(first.options.skillInjection.filesHash).toBe(digestSkillDir(oldDir));
      expect(first.options.skillInjection.baselineFilesHash).toBe(digestSkillDir(oldDir));
      expect(records()).toEqual([
        expect.stringMatching(
          `-default-b${hashSkillText('OLD')}-s${digestSkillDir(oldDir)}\\.json$`,
        ),
      ]);

      await expect(ab({ 'skill-file': skill, 'baseline-skill-file': old })).rejects.toThrow(
        /No preflight record found/,
      );
      await ab({ 'skill-file': skill, 'baseline-skill-file': old }, { 'stage-skill-files': true });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
    });

    it('refuses an A/B whose staged baseline files changed since the preflight', async () => {
      const staged = { 'stage-skill-files': true };
      const twoText = { 'skill-file': skill, 'baseline-skill-file': old };
      await preflight({ 'baseline-skill-file': old }, staged);
      await ab(twoText, staged);
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);

      // An identical copy elsewhere is the same baseline.
      fs.cpSync(path.join(tempDir, 'skills', 'demo-old'), path.join(tempDir, 'copy'), {
        recursive: true,
      });
      await ab({ ...twoText, 'baseline-skill-file': 'copy/SKILL.md' }, staged);
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(2);

      // SKILL.md untouched, one staged script edited: no preflight covers it.
      fs.writeFileSync(path.join(tempDir, 'skills', 'demo-old', 'verify.sh'), 'echo edited\n');
      const { message } = await ab(twoText, staged).catch((err) => err);
      expect(message).toContain('No preflight record found');
      expect(message).toMatch(/recorded under: .*with staged files [0-9a-f]{16}\./);
      expect(message).toContain(
        `Run: arcforge eval preflight gated --baseline-skill-file ${old} --stage-skill-files`,
      );
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(2);
    });

    it('removes the staged copy when a trial throws', async () => {
      evalLib.runTrial.mockImplementation((scenario) => {
        seen.push({ staged: scenario.context.match(BASE_LINE)[1] });
        throw new Error('spawn failed');
      });
      await expect(
        preflight({ 'baseline-skill-file': old }, { 'stage-skill-files': true }),
      ).rejects.toThrow('spawn failed');
      expect(fs.existsSync(seen[0].staged)).toBe(false);
    });

    it('runs the plain baseline without a baseline text, staging or not', async () => {
      await preflight({}, { 'stage-skill-files': true });
      for (const trial of seen) {
        expect(trial.context).toBe('A fixture.');
        expect(trial.options.skillInjection.baseDir).toBeNull();
        expect(trial.options.skillInjection.textHash).toBeNull();
        // Nothing was staged, so its rows record no staging.
        expect(trial.options.skillInjection.staged).toBe(false);
        expect(trial.options.skillInjection.copies).toEqual([]);
      }
      expect(records()).toEqual([expect.stringMatching(/^[0-9a-f]{16}-default\.json$/)]);
      await ab({ 'skill-file': skill }, { 'stage-skill-files': true });
      expect(evalLib.runSkillEval).toHaveBeenCalledTimes(1);
    });

    it('refuses the flags on a workflow scenario and a baseline file that is missing', async () => {
      writeScenario('flow', { scope: 'workflow' });
      await expect(
        run(
          args(['preflight', 'flow'], {
            model: 'opus',
            effort: 'high',
            'baseline-skill-file': old,
          }),
        ),
      ).rejects.toThrow(/eval preflight --baseline-skill-file is refused for a workflow-scope/);
      await expect(preflight({ 'baseline-skill-file': 'skills/gone/SKILL.md' })).rejects.toThrow(
        'skill file not found: skills/gone/SKILL.md',
      );
      const empty = writeSkill('demo-empty', '');
      await expect(preflight({ 'baseline-skill-file': empty })).rejects.toThrow(
        `--baseline-skill-file ${empty} is empty`,
      );
      expect(evalLib.runTrial).not.toHaveBeenCalled();
    });
  });
});
