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
const { snapshotTree, diffSnapshots } = require('../../scripts/lib/eval-trial-guard');

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
