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
    const settings = JSON.parse(buildIsolationSettings({ excludeClaudeMd: false }));
    expect(settings.outputStyle).toBe('default');
    expect(settings).not.toHaveProperty('disableAllHooks');
  });

  it('skips user-level settings, hooks included, in a plugin-dir trial', () => {
    runTrial(SCENARIO, 1, 1, { projectRoot: tempDir, pluginDir: tempDir, isolated: false });
    const args = trialArgs();
    expect(args).toContain('--setting-sources');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('project,local');
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

describe('runSkillEval with a plugin dir measures routing, not an injected body (B-1)', () => {
  const { runSkillEval } = require('../../scripts/lib/eval');
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-plugin-'));
    mockUtils.execCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('refuses a skill body and a plugin dir together', () => {
    expect(() =>
      runSkillEval(SCENARIO, 1, {
        projectRoot: tempDir,
        skillInstruction: 'x',
        pluginDir: tempDir,
      }),
    ).toThrow(/exclusive/);
  });

  it('runs the plugin-dir treatment under plugin-dir settings, so its hooks load', () => {
    const settingsByArm = {};
    stubExec((opts) => {
      const arm = opts.input.includes('## Task') && opts.cwd;
      settingsByArm[arm] = JSON.parse(
        fs.readFileSync(path.join(opts.cwd, '.claude', 'settings.json'), 'utf8'),
      );
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
    runSkillEval(SCENARIO, 1, { projectRoot: tempDir, pluginDir: tempDir });
    const [baseline, treatment] = Object.values(settingsByArm);
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
  let rows;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parity-'));
    pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parity-plugin-'));
    mockUtils.execCommand.mockReset();
    argvs = [];
    stubExec((opts) => {
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
  }

  const collect = (_label, _t, row) => rows.push(row);

  it('skill scope with --plugin-dir, no model or effort given', () => {
    runSkillEval(SCENARIO, 1, { projectRoot: tempDir, pluginDir, onTrialComplete: collect });
    expect(argvs).toHaveLength(2);
    expectOnlyInjectionDiffers(argvs);
    expect(argvs[0]).toContain('--setting-sources');
    expect(argvs[0]).toContain('--dangerously-skip-permissions');
    expect(argvs[0][argvs[0].indexOf('--max-turns') + 1]).toBe('10');
  });

  it('skill scope with --plugin-dir, model, effort and max turns given', () => {
    runSkillEval(SCENARIO, 1, {
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
    runSkillEval(SCENARIO, 1, { projectRoot: tempDir, pluginDir, onTrialComplete: collect });
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
