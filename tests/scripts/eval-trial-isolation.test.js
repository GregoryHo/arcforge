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
