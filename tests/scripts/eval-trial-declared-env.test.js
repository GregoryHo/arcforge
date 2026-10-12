/**
 * eval-trial-declared-env.test.js - A scenario's `## Environment` reaches both
 * arms and Setup alike, and every row records it (B-7). The `claude` subprocess
 * is stubbed; no session is spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const { runTrial, runSkillEval, runWorkflowEval } = require('../../scripts/lib/eval');

const DONE_STREAM = [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } }),
  JSON.stringify({ type: 'result', result: 'Done' }),
].join('\n');
const SETUP = 'echo fixture';
/* biome-ignore-start lint/suspicious/noTemplateCurlyInString: scenario placeholders, not JS templates */
const ENVIRONMENT = [
  'PATH+=${PROJECT_ROOT}/bin',
  'PATH^=${TRIAL_DIR}/fakebin',
  'UV_CACHE_DIR=${TRIAL_DIR}/.cache/uv',
];
/* biome-ignore-end lint/suspicious/noTemplateCurlyInString: scenario placeholders, not JS templates */
const SCENARIO = {
  name: 'declared',
  scenario: 'Test.',
  context: '',
  assertions: [],
  grader: 'code',
  graderConfig: 'true',
  setup: SETUP,
  environment: ENVIRONMENT,
};

describe('a declared trial environment (## Environment)', () => {
  let tempDir;
  let pluginDir;
  let rows;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-declared-'));
    pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-declared-plugin-'));
    rows = [];
    mockUtils.execCommand.mockReset();
    mockUtils.execCommand.mockImplementation((cmd, args) => {
      if (cmd === 'claude' && args[0] === 'plugin')
        return { stdout: '[]', stderr: '', exitCode: 0 };
      if (cmd === 'claude') return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(pluginDir, { recursive: true, force: true });
  });

  const envs = (isWanted) =>
    mockUtils.execCommand.mock.calls
      .filter(isWanted)
      .map((c) => ({ env: c[2].env, cwd: c[2].cwd }));
  const sessionEnvs = () => envs((c) => c[0] === 'claude' && c[1].includes('-p'));
  const setupEnvs = () => envs((c) => c[0] === 'sh' && c[1][1] === SETUP);
  const portable = ({ env, cwd }) =>
    Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v.split(cwd).join('<TRIAL_DIR>')]));
  const collect = (_label, _t, row) => rows.push(row);

  it('adds the declared directories and cache variable to the session', () => {
    runTrial(SCENARIO, 1, 1, { projectRoot: tempDir });
    const [{ env, cwd }] = sessionEnvs();
    const entries = env.PATH.split(path.delimiter);
    expect(entries[0]).toBe(path.join(cwd, 'fakebin'));
    expect(entries.at(-1)).toBe(path.join(path.resolve(tempDir), 'bin'));
    expect(env.UV_CACHE_DIR).toBe(path.join(cwd, '.cache', 'uv'));
  });

  it('gives Setup the declared environment too', () => {
    runTrial(SCENARIO, 1, 1, { projectRoot: tempDir });
    const [setup] = setupEnvs();
    const [session] = sessionEnvs();
    const { PROJECT_ROOT: _root, TRIAL_DIR: _dir, ...rest } = setup.env;
    expect(rest).toEqual(session.env);
    expect(setup.env.UV_CACHE_DIR).toBe(path.join(setup.cwd, '.cache', 'uv'));
  });

  it('applies it identically to both arms of a skill A/B', () => {
    runSkillEval(SCENARIO, 1, {
      projectRoot: tempDir,
      skillInstruction: 'BODY',
      onTrialComplete: collect,
    });
    const [baseline, treatment] = sessionEnvs().map(portable);
    expect(treatment).toEqual(baseline);
    expect(baseline.UV_CACHE_DIR).toBe('<TRIAL_DIR>/.cache/uv');
    const [baselineSetup, treatmentSetup] = setupEnvs().map(portable);
    expect(treatmentSetup).toEqual(baselineSetup);
    expect(rows.map((r) => r.environment)).toEqual([ENVIRONMENT, ENVIRONMENT]);
  });

  it('applies it identically to both arms of a plugin-dir workflow A/B', () => {
    runWorkflowEval({ ...SCENARIO, scope: 'workflow', pluginDir }, 1, {
      projectRoot: tempDir,
      onTrialComplete: collect,
    });
    const [baseline, treatment] = sessionEnvs().map(portable);
    expect(treatment).toEqual(baseline);
    expect(rows.map((r) => r.environment)).toEqual([ENVIRONMENT, ENVIRONMENT]);
  });

  it('records the declaration as written on the row, and [] when there is none', () => {
    const declared = runTrial(SCENARIO, 1, 1, { projectRoot: tempDir });
    expect(declared.environment).toEqual(ENVIRONMENT);
    const { environment: _none, ...plain } = SCENARIO;
    expect(runTrial(plain, 1, 1, { projectRoot: tempDir }).environment).toEqual([]);
  });

  it('records it on an infra-error row as well', () => {
    const row = runTrial(SCENARIO, 1, 1, {
      projectRoot: tempDir,
      pluginDir: path.join(tempDir, 'no-such-plugin'),
    });
    expect(row.errorType).toBe('plugin_dir_missing');
    expect(row.environment).toEqual(ENVIRONMENT);
  });

  it('refuses a bad declaration before the fixture or the session exists', () => {
    const bad = { ...SCENARIO, environment: ['HOME=/tmp/elsewhere'] };
    expect(() => runTrial(bad, 1, 1, { projectRoot: tempDir })).toThrow(
      /Scenario declared has a bad ## Environment line: "HOME=\/tmp\/elsewhere"/,
    );
    expect(mockUtils.execCommand).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tempDir, '.eval-trials'))).toBe(false);
  });
});
