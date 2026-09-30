/**
 * eval-trial-isolation.test.js - What a trial session inherits, and what it may
 * touch (B-7). The `claude` subprocess is stubbed; no session is spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const { buildIsolationSettings, runTrial } = require('../../scripts/lib/eval');
const {
  snapshotTree,
  diffSnapshots,
  watchForWrites,
} = require('../../scripts/lib/eval-trial-guard');

const DONE_STREAM = [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } }),
  JSON.stringify({ type: 'result', result: 'Done' }),
].join('\n');
const SCENARIO = {
  name: 'isolation',
  scenario: 'Test.',
  context: '',
  assertions: [],
  grader: 'code',
  graderConfig: 'true',
};

/** Stub every exec: the plugin list answers [], the trial answers `onTrial`. */
function stubExec(onTrial = () => ({ stdout: DONE_STREAM, stderr: '', exitCode: 0 })) {
  mockUtils.execCommand.mockImplementation((cmd, args, opts) => {
    if (cmd === 'claude' && args[0] === 'plugin') return { stdout: '[]', stderr: '', exitCode: 0 };
    if (cmd === 'claude') return onTrial(opts);
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

function trialArgs() {
  return mockUtils.execCommand.mock.calls.find((c) => c[0] === 'claude' && c[1].includes('-p'))[1];
}

describe('trial isolation keeps the operator user config out (B-7, #170)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-isolation-'));
    mockUtils.execCommand.mockReset();
    stubExec();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('pins the output style and disables every hook under full isolation', () => {
    const settings = JSON.parse(buildIsolationSettings());
    expect(settings.outputStyle).toBe('default');
    expect(settings.disableAllHooks).toBe(true);
  });

  it('pins them even when the plugin list is unavailable', () => {
    mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: 'nope', exitCode: 1 });
    const settings = JSON.parse(buildIsolationSettings());
    expect(settings.outputStyle).toBe('default');
    expect(settings.disableAllHooks).toBe(true);
  });

  it('pins the output style for plugin-dir trials but leaves the plugin its hooks', () => {
    const settings = JSON.parse(buildIsolationSettings({ forPluginDir: true }));
    expect(settings.outputStyle).toBe('default');
    expect(settings).not.toHaveProperty('disableAllHooks');
    // Trial dirs sit under <projectRoot>/.eval-trials/, so without this the
    // plugin arm would read the project's own CLAUDE.md and rules.
    expect(settings.claudeMdExcludes).toEqual(
      JSON.parse(buildIsolationSettings()).claudeMdExcludes,
    );
  });

  it('skips user-level settings, hooks included, in a plugin-dir trial', () => {
    runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, pluginDir: tempDir, isolated: false });
    const args = trialArgs();
    expect(args).toContain('--setting-sources');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('project,local');
  });

  it('records user-settings for a trial that reads the user settings file', () => {
    const row = runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, isolated: false });
    expect([row.model, row.effort]).toEqual(['user-settings', 'user-settings']);
    const pinned = runTrial(SCENARIO, 1, 1, {
      projectRoot: tempDir,
      isolated: false,
      model: 'opus',
      effort: 'high',
    });
    expect([pinned.model, pinned.effort]).toEqual(['opus', 'high']);
  });

  it('leaves a --no-isolate trial reading the surrounding config', () => {
    runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, isolated: false });
    expect(trialArgs()).not.toContain('--setting-sources');
  });
});

describe('a trial that writes outside its directory is an instrument failure (eval-10)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-escape-'));
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.writeFileSync(path.join(tempDir, 'src', 'template.html'), '<p>shipped</p>');
    mockUtils.execCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('gives a plugin-dir trial the same stay-in-your-directory advisory', () => {
    stubExec();
    runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, pluginDir: tempDir, isolated: false });
    const args = trialArgs();
    const advisory = args[args.indexOf('--append-system-prompt') + 1];
    expect(advisory).toContain('do not read, search, or access files outside this directory');
  });

  it('flags a trial that edited a file in the repository it ran from', () => {
    stubExec(() => {
      fs.writeFileSync(path.join(tempDir, 'src', 'template.html'), '<p>edited by the trial</p>');
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    const result = runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, pluginDir: tempDir });
    expect(result.infraError).toBe(true);
    expect(result.errorType).toBe('trial_wrote_repo');
    expect(result.error).toContain(path.join('src', 'template.html'));
  });

  it('flags an isolated trial that created a file in the repository', () => {
    stubExec(() => {
      fs.writeFileSync(path.join(tempDir, 'stray.txt'), 'x');
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    const result = runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, isolated: true });
    expect(result.errorType).toBe('trial_wrote_repo');
  });

  it('watches a plugin dir that lives outside the project root', () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-plugin-'));
    try {
      stubExec(() => {
        fs.writeFileSync(path.join(pluginDir, 'SKILL.md'), 'rewritten');
        return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
      });
      const result = runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, pluginDir });
      expect(result.errorType).toBe('trial_wrote_repo');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  it('does not flag writes inside the trial directory', () => {
    stubExec((opts) => {
      fs.writeFileSync(path.join(opts.cwd, 'answer.md'), 'work product');
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    const result = runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, pluginDir: tempDir });
    expect(result.infraError).toBeUndefined();
  });
});

describe('skill scope takes no plugin dir (B-1, #197)', () => {
  const { runSkillEval, runWorkflowEval } = require('../../scripts/lib/eval');
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-plugin-'));
    mockUtils.execCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('refuses a plugin dir, with or without a skill body', () => {
    expect(() => runSkillEval(SCENARIO, 1, { projectRoot: tempDir, pluginDir: tempDir })).toThrow(
      /workflow scope/,
    );
    expect(() =>
      runSkillEval(SCENARIO, 1, {
        projectRoot: tempDir,
        skillInstruction: 'x',
        pluginDir: tempDir,
      }),
    ).toThrow(/workflow scope/);
    expect(mockUtils.execCommand).not.toHaveBeenCalled();
  });

  it('runs a workflow plugin-dir treatment under plugin-dir settings, so its hooks load', () => {
    const settingsByArm = [];
    stubExec((opts) => {
      settingsByArm.push(
        JSON.parse(fs.readFileSync(path.join(opts.cwd, '.claude', 'settings.json'), 'utf8')),
      );
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    runWorkflowEval({ ...SCENARIO, scope: 'workflow', pluginDir: tempDir }, 1, {
      projectRoot: tempDir,
    });
    const [baseline, treatment] = settingsByArm;
    expect(baseline.disableAllHooks).toBe(true);
    expect(treatment).not.toHaveProperty('disableAllHooks');
    expect(treatment.outputStyle).toBe('default');
  });
});

describe('both arms of a comparison run the same claude argv but for the injection', () => {
  const { runSkillEval, runWorkflowEval } = require('../../scripts/lib/eval');
  let tempDir;
  let pluginDir;
  let argvs;
  let settings;
  let rows;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parity-'));
    pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parity-plugin-'));
    mockUtils.execCommand.mockReset();
    argvs = [];
    settings = [];
    stubExec((opts) => {
      settings.push(
        JSON.parse(fs.readFileSync(path.join(opts.cwd, '.claude', 'settings.json'), 'utf8')),
      );
      // The advisory names each trial's own directory; that is not an arm difference.
      const args = mockUtils.execCommand.mock.calls.at(-1)[1];
      argvs.push(args.map((a) => a.split(opts.cwd).join('<TRIAL_DIR>')));
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    rows = [];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(pluginDir, { recursive: true, force: true });
  });

  /** The treatment's argv with the injection removed must equal the baseline's. */
  function expectOnlyInjectionDiffers([baseline, treatment]) {
    const at = treatment.indexOf('--plugin-dir');
    expect(at).toBeGreaterThan(-1);
    expect(treatment[at + 1]).toBe(path.resolve(pluginDir));
    const withoutInjection = [...treatment.slice(0, at), ...treatment.slice(at + 2)];
    expect(withoutInjection).toEqual(baseline);
    // Settings files too. The one allowed difference is disableAllHooks: the
    // baseline loads no plugin, so turning every hook off costs it nothing,
    // while the treatment must keep the plugin's hooks, which are part of what
    // is under test. (User-level hooks are out of both arms already, through
    // --setting-sources.)
    const [bSettings, tSettings] = settings;
    expect(bSettings.disableAllHooks).toBe(true);
    expect(tSettings).not.toHaveProperty('disableAllHooks');
    const { disableAllHooks: _allowed, ...bRest } = bSettings;
    expect(tSettings).toEqual(bRest);
  }

  const collect = (_label, _t, row) => rows.push(row);

  it('workflow scope with a plugin dir, no model or effort given', () => {
    runWorkflowEval({ ...SCENARIO, scope: 'workflow' }, 1, {
      projectRoot: tempDir,
      pluginDir,
      onTrialComplete: collect,
    });
    expect(argvs).toHaveLength(2);
    expectOnlyInjectionDiffers(argvs);
    expect(argvs[0]).toContain('--setting-sources');
    expect(argvs[0]).toContain('--dangerously-skip-permissions');
    expect(argvs[0][argvs[0].indexOf('--max-turns') + 1]).toBe('10');
  });

  it('workflow scope with a plugin dir, model, effort and max turns given', () => {
    runWorkflowEval({ ...SCENARIO, scope: 'workflow' }, 1, {
      projectRoot: tempDir,
      pluginDir,
      model: 'opus',
      effort: 'high',
      maxTurns: 7,
    });
    expectOnlyInjectionDiffers(argvs);
    expect(argvs[0]).toEqual(expect.arrayContaining(['--model', 'opus', '--effort', 'high']));
    expect(argvs[0][argvs[0].indexOf('--max-turns') + 1]).toBe('7');
  });

  it('workflow scope with a plugin dir', () => {
    runWorkflowEval({ ...SCENARIO, scope: 'workflow', pluginDir }, 1, {
      projectRoot: tempDir,
      onTrialComplete: collect,
    });
    expectOnlyInjectionDiffers(argvs);
  });

  it('skill scope with an injected body: argv identical, the body is in the prompt', () => {
    runSkillEval(SCENARIO, 1, { projectRoot: tempDir, skillInstruction: 'BODY' });
    expect(argvs[0]).toEqual(argvs[1]);
  });

  it('records the model and effort every row ran with, default when none was passed', () => {
    runWorkflowEval({ ...SCENARIO, scope: 'workflow', pluginDir }, 1, {
      projectRoot: tempDir,
      onTrialComplete: collect,
    });
    expect(rows.map((r) => [r.model, r.effort])).toEqual([
      ['default', 'default'],
      ['default', 'default'],
    ]);
  });

  it('refuses a full-toolkit workflow A/B that does not pin both model and effort', () => {
    const scenario = { ...SCENARIO, scope: 'workflow' };
    expect(() => runWorkflowEval(scenario, 1, { projectRoot: tempDir })).toThrow(/--model/);
    expect(() => runWorkflowEval(scenario, 1, { projectRoot: tempDir, model: 'opus' })).toThrow(
      /--effort/,
    );
    expect(argvs).toHaveLength(0);
  });
});

describe('the baseline of a plugin-dir comparison watches the plugin it does not load', () => {
  const { runSkillEval, runWorkflowEval } = require('../../scripts/lib/eval');
  let tempDir;
  let plugin;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-baseline-watch-'));
    // A plugin checkout nested in the project: its own .git makes the project
    // walk skip it, so only an explicit watch can see it.
    plugin = path.join(tempDir, 'vendor', 'plugin');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, '.git'), 'gitdir: elsewhere\n');
    fs.writeFileSync(path.join(plugin, 'SKILL.md'), 'original');
    mockUtils.execCommand.mockReset();
    let trial = 0;
    stubExec(() => {
      trial++;
      // Trial 1 is the baseline (arms run back to back): it edits the plugin.
      if (trial === 1) fs.writeFileSync(path.join(plugin, 'SKILL.md'), 'edited by the baseline');
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // The write is recorded on the baseline row, and the run stops there, so the
  // treatment never loads the edited plugin.
  const baselineRow = () =>
    require('../../scripts/lib/eval').loadResults('isolation-baseline', tempDir)[0];
  const trialCalls = () =>
    mockUtils.execCommand.mock.calls.filter((c) => c[0] === 'claude' && c[1].includes('-p'));

  it('records a baseline write into the plugin as trial_wrote_repo (workflow scope)', () => {
    expect(() =>
      runWorkflowEval({ ...SCENARIO, scope: 'workflow', pluginDir: plugin }, 1, {
        projectRoot: tempDir,
        runId: 'r1',
      }),
    ).toThrow(/baseline trial 1 wrote outside its directory/);
    expect(baselineRow().errorType).toBe('trial_wrote_repo');
    expect(trialCalls()).toHaveLength(1);
  });
});

describe('a detected repository write stops the run', () => {
  const { runSkillEval, loadResults } = require('../../scripts/lib/eval');
  const { runPreflight } = require('../../scripts/lib/eval-preflight');
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-stop-'));
    mockUtils.execCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('aborts an A/B after the trial that wrote, before the next trial starts', () => {
    stubExec(() => {
      fs.writeFileSync(path.join(tempDir, 'stray.txt'), 'x');
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    expect(() =>
      runSkillEval(SCENARIO, 2, { projectRoot: tempDir, skillInstruction: 'BODY', runId: 'r1' }),
    ).toThrow(/baseline trial 1 wrote outside its directory: .*stray\.txt.*reset/s);
    const trials = mockUtils.execCommand.mock.calls.filter(
      (c) => c[0] === 'claude' && c[1].includes('-p'),
    );
    expect(trials).toHaveLength(1);
    // The offending row is on disk, still an infra error.
    const [row] = loadResults('isolation-baseline', tempDir);
    expect(row.errorType).toBe('trial_wrote_repo');
    expect(row.infraError).toBe(true);
  });

  it('aborts a preflight after the trial that wrote', () => {
    const scenariosDir = path.join(tempDir, 'evals', 'scenarios');
    fs.mkdirSync(scenariosDir, { recursive: true });
    fs.writeFileSync(path.join(scenariosDir, 'pf.md'), '# Eval: pf\n\n## Scope\nskill\n');
    const runTrialStub = jest.fn(() => ({
      trial: 1,
      infraError: true,
      errorType: 'trial_wrote_repo',
      error: 'Trial wrote outside its directory: /repo/x',
    }));
    expect(() =>
      runPreflight('pf', tempDir, { runTrial: runTrialStub, gradeResult: (r) => r }),
    ).toThrow(/preflight trial 1 wrote outside its directory/);
    expect(runTrialStub).toHaveBeenCalledTimes(1);
  });
});

describe('eval-trial-guard snapshots', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('skips its own output, trial dirs, dependencies and nested repositories', () => {
    for (const rel of [
      'keep.txt',
      'evals/results/x/row.jsonl',
      '.eval-trials/t1/a.txt',
      'node_modules/p/index.js',
      '.claude/worktrees/other/.git',
      '.claude/worktrees/other/file.js',
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), 'x');
    }
    const { files, complete } = snapshotTree(root);
    expect(complete).toBe(true);
    expect([...files.keys()]).toEqual(['keep.txt']);
  });

  it('marks a snapshot past the walk budget incomplete', () => {
    for (const name of ['a', 'b', 'c']) fs.writeFileSync(path.join(root, name), 'x');
    expect(snapshotTree(root, 2).complete).toBe(false);
    expect(snapshotTree(root, 3).complete).toBe(true);
  });

  it('fails a trial closed when the repository was too large to check', () => {
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      jest.isolateModules(() => {
        jest.doMock('../../scripts/lib/eval-trial-guard', () => ({
          watchForWrites: () => () => ({
            changed: [],
            incomplete: [{ root: '/huge/repo', seen: 50000 }],
          }),
        }));
        const { runTrial: isolatedRunTrial } = require('../../scripts/lib/eval-trial');
        // This registry has its own copy of the mocked utils.
        require('../../scripts/lib/utils').execCommand.mockReturnValue({
          stdout: DONE_STREAM,
          stderr: '',
          exitCode: 0,
        });
        const result = isolatedRunTrial(SCENARIO, 1, 1, { projectRoot: root, isolated: false });
        expect(result.repoCheck).toBe('skipped');
        expect(result.infraError).toBe(true);
        expect(result.errorType).toBe('repo_check_skipped');
      });
      const printed = errSpy.mock.calls.join('');
      expect(printed).toContain('/huge/repo is too large for the write check');
      expect(printed).toContain('50000');
    } finally {
      jest.dontMock('../../scripts/lib/eval-trial-guard');
      errSpy.mockRestore();
    }
  });

  it('detects a permission-only change, which leaves size and mtime alone', () => {
    const hook = path.join(root, 'hook.sh');
    fs.writeFileSync(hook, 'echo hi\n');
    fs.chmodSync(hook, 0o644);
    const writes = watchForWrites([root]);
    fs.chmodSync(hook, 0o755);
    expect(writes().changed).toEqual([path.join(path.resolve(root), 'hook.sh')]);
  });

  it('reports how many entries it saw when a root is past the budget', () => {
    for (const name of ['a', 'b', 'c']) fs.writeFileSync(path.join(root, name), 'x');
    const { incomplete } = watchForWrites([root], { maxEntries: 2 })();
    expect(incomplete).toEqual([{ root: path.resolve(root), seen: 2 }]);
  });

  it('watches a plugin checkout nested in the project that the outer walk skips', () => {
    const plugin = path.join(root, 'vendor', 'plugin');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, '.git'), 'gitdir: elsewhere\n');
    fs.writeFileSync(path.join(plugin, 'SKILL.md'), 'original');
    const writes = watchForWrites([root, plugin]);
    fs.writeFileSync(path.join(plugin, 'SKILL.md'), 'edited by the trial');
    expect(writes().changed).toEqual([path.join(path.resolve(plugin), 'SKILL.md')]);
  });

  it('reports a write once when a watched plugin dir is inside the project walk', () => {
    const plugin = path.join(root, 'plugin');
    fs.mkdirSync(plugin);
    const writes = watchForWrites([root, plugin]);
    fs.writeFileSync(path.join(plugin, 'new.md'), 'x');
    expect(writes().changed).toEqual([path.join(path.resolve(plugin), 'new.md')]);
  });

  it('reports added, changed and removed paths', () => {
    const before = new Map([
      ['same', '1:1'],
      ['edited', '1:1'],
      ['gone', '1:1'],
    ]);
    const after = new Map([
      ['same', '1:1'],
      ['edited', '2:1'],
      ['new', '1:1'],
    ]);
    expect(diffSnapshots(before, after)).toEqual(['edited', 'gone', 'new']);
  });
});
