const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Mock utils.execCommand for trial and grading interception.
jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn((...args) => actual.execCommand(...args)) };
});
const mockUtils = require('../../scripts/lib/utils');

const {
  gradeWithHuman,
  verdictFromDelta,
  runSkillEval,
  runWorkflowEval,
  gradeTrialResult,
  parseScenario,
  createTrialDir,
  cleanupTrialDir,
  runSetup,
  loadResults,
  appendResult,
  SCENARIOS_DIR,
  RESULTS_DIR,
} = require('../../scripts/lib/eval');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-int-'));
}

function writeScenario(dir, filename, content) {
  const scenariosDir = path.join(dir, SCENARIOS_DIR);
  fs.mkdirSync(scenariosDir, { recursive: true });
  const filePath = path.join(scenariosDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function makeResult(overrides = {}) {
  return {
    eval: 'test-eval',
    trial: 1,
    k: 3,
    passed: false,
    grader: 'code',
    score: 0,
    timestamp: '2026-03-17T10:00:00Z',
    ...overrides,
  };
}

/**
 * Create a mock readline interface that answers questions in sequence.
 */
function mockReadline(answers) {
  let idx = 0;
  return {
    question: (_prompt, cb) => {
      const answer = idx < answers.length ? answers[idx] : '';
      idx++;
      cb(answer);
    },
    close: jest.fn(),
  };
}

// ── verdictFromDelta ────────────────────────────────────────

describe('verdictFromDelta', () => {
  test('returns IMPROVED for delta > 0.15', () => {
    expect(verdictFromDelta(0.2)).toBe('IMPROVED');
    expect(verdictFromDelta(0.16)).toBe('IMPROVED');
  });

  test('returns INCONCLUSIVE for delta between -0.05 and 0.15', () => {
    expect(verdictFromDelta(0.15)).toBe('INCONCLUSIVE');
    expect(verdictFromDelta(0.0)).toBe('INCONCLUSIVE');
    expect(verdictFromDelta(-0.05)).toBe('INCONCLUSIVE');
  });

  test('returns REGRESSED for delta < -0.05', () => {
    expect(verdictFromDelta(-0.06)).toBe('REGRESSED');
    expect(verdictFromDelta(-0.5)).toBe('REGRESSED');
  });

  test('handles boundary at exactly 0.15 as INCONCLUSIVE', () => {
    expect(verdictFromDelta(0.15)).toBe('INCONCLUSIVE');
  });

  test('handles boundary at exactly -0.05 as INCONCLUSIVE', () => {
    expect(verdictFromDelta(-0.05)).toBe('INCONCLUSIVE');
  });
});

// ── gradeWithHuman ──────────────────────────────────────────

describe('gradeWithHuman', () => {
  test('returns graded result with provided score and pass', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const rl = mockReadline(['0.85', 'y', 'looks good']);
    const graded = await gradeWithHuman(result, rl);

    expect(graded.score).toBe(0.85);
    expect(graded.passed).toBe(true);
    expect(graded.grader).toBe('human');
    expect(graded.notes).toBe('looks good');
  });

  test('defaults passed to true when score >= 0.7 and empty input', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const rl = mockReadline(['0.80', '', '']);
    const graded = await gradeWithHuman(result, rl);

    expect(graded.passed).toBe(true);
  });

  test('defaults passed to false when score < 0.7 and empty input', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const rl = mockReadline(['0.50', '', '']);
    const graded = await gradeWithHuman(result, rl);

    expect(graded.passed).toBe(false);
  });

  test('does not mutate input result', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const original = { ...result };
    const rl = mockReadline(['0.90', 'y', '']);
    await gradeWithHuman(result, rl);

    expect(result).toEqual(original);
  });

  test('omits notes field when empty', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const rl = mockReadline(['0.70', 'y', '']);
    const graded = await gradeWithHuman(result, rl);

    expect(graded.notes).toBeUndefined();
  });

  test('rounds score to 2 decimal places', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const rl = mockReadline(['0.777', 'y', '']);
    const graded = await gradeWithHuman(result, rl);

    expect(graded.score).toBe(0.78);
  });

  test('accepts n for passed override', async () => {
    const result = makeResult({ grader: 'human-pending' });
    const rl = mockReadline(['0.90', 'n', '']);
    const graded = await gradeWithHuman(result, rl);

    expect(graded.score).toBe(0.9);
    expect(graded.passed).toBe(false);
  });
});

// ── runSkillEval A/B flow ───────────────────────────────────

// Mock response for `claude plugin list --json` (used by buildIsolationSettings)
const pluginListResponse = { stdout: '[]', stderr: '', exitCode: 0 };

describe('runSkillEval A/B flow', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, RESULTS_DIR), { recursive: true });
    mockUtils.execCommand.mockReset();
    // First call in runSkillEval is buildIsolationSettings → claude plugin list --json
    mockUtils.execCommand.mockReturnValueOnce(pluginListResponse);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const scenarioContent = [
    '# Eval: test-ab',
    '',
    '## Scope',
    'skill',
    '',
    '## Scenario',
    'Write a fibonacci function.',
    '',
    '## Context',
    'Empty directory.',
    '',
    '## Assertions',
    '- [ ] Tests exist',
    '- [ ] Implementation works',
    '',
    '## Grader',
    'code',
    '',
    '## Grader Config',
    'true',
  ].join('\n');

  test('should run k baseline and k treatment trials', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    // 2 baseline trials (runTrial) + 2 code grades + 2 treatment trials + 2 code grades
    const trialOutput = { stdout: 'output', stderr: '', exitCode: 0 };
    const gradePass = { stdout: '', stderr: '', exitCode: 0 };
    for (let i = 0; i < 4; i++) {
      mockUtils.execCommand.mockReturnValueOnce(trialOutput); // runTrial
      mockUtils.execCommand.mockReturnValueOnce(gradePass); // gradeWithCode
    }

    const result = runSkillEval(scenario, 2, {
      projectRoot: tmpDir,
      skillInstruction: 'Always write tests first.',
    });

    expect(result.baseline).toHaveLength(2);
    expect(result.treatment).toHaveLength(2);
    expect(typeof result.delta).toBe('number');
  });

  test('should compute delta between baseline and treatment', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    // Baseline: fail (score 0), Treatment: pass (score 1)
    const trialOutput = { stdout: 'output', stderr: '', exitCode: 0 };
    // Baseline trials: grade fails
    mockUtils.execCommand.mockReturnValueOnce(trialOutput);
    mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: 'fail', exitCode: 1 });
    // Treatment trials: grade passes
    mockUtils.execCommand.mockReturnValueOnce(trialOutput);
    mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: '', exitCode: 0 });

    const result = runSkillEval(scenario, 1, {
      projectRoot: tmpDir,
      skillInstruction: 'Use TDD.',
    });

    expect(result.baseline[0].score).toBe(0);
    expect(result.treatment[0].score).toBe(1);
    expect(result.delta).toBe(1.0);
  });

  test('should store results in JSONL with label suffixes', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    const trialOutput = { stdout: 'output', stderr: '', exitCode: 0 };
    const gradePass = { stdout: '', stderr: '', exitCode: 0 };
    for (let i = 0; i < 4; i++) {
      mockUtils.execCommand.mockReturnValueOnce(trialOutput);
      mockUtils.execCommand.mockReturnValueOnce(gradePass);
    }

    runSkillEval(scenario, 2, { projectRoot: tmpDir, skillInstruction: 'TDD.' });

    const baselineResults = loadResults('test-ab-baseline', tmpDir);
    const treatmentResults = loadResults('test-ab-treatment', tmpDir);
    expect(baselineResults).toHaveLength(2);
    expect(treatmentResults).toHaveLength(2);
  });

  test('should call onTrialComplete callback for each trial', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    const trialOutput = { stdout: 'output', stderr: '', exitCode: 0 };
    const gradePass = { stdout: '', stderr: '', exitCode: 0 };
    for (let i = 0; i < 4; i++) {
      mockUtils.execCommand.mockReturnValueOnce(trialOutput);
      mockUtils.execCommand.mockReturnValueOnce(gradePass);
    }

    const callback = jest.fn();
    runSkillEval(scenario, 2, {
      projectRoot: tmpDir,
      skillInstruction: 'TDD.',
      onTrialComplete: callback,
    });

    expect(callback).toHaveBeenCalledTimes(4); // 2 baseline + 2 treatment
    expect(callback.mock.calls[0][0]).toBe('baseline');
    expect(callback.mock.calls[0][1]).toBe(1);
    expect(callback.mock.calls[2][0]).toBe('treatment');
    expect(callback.mock.calls[2][1]).toBe(1);
  });

  test('should prepend skillInstruction to treatment context', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    const calls = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs, opts) => {
      if (cmd === 'claude') {
        calls.push(opts.input || (cmdArgs?.includes('-p') ? 'claude-call' : ''));
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runSkillEval(scenario, 1, {
      projectRoot: tmpDir,
      skillInstruction: 'SKILL_MARKER_TEXT',
    });

    // First claude call = baseline (no skill instruction)
    // Second claude call = treatment (should contain skill instruction)
    const baselinePrompt = calls[0];
    const treatmentPrompt = calls[1];
    expect(baselinePrompt).not.toContain('SKILL_MARKER_TEXT');
    expect(treatmentPrompt).toContain('SKILL_MARKER_TEXT');
  });

  test('should interleave baseline and treatment when interleave=true', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    const callOrder = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs, opts) => {
      if (cmd === 'claude') {
        const hasSkill = (opts.input || '').includes('SKILL_MARKER');
        callOrder.push(hasSkill ? 'treatment' : 'baseline');
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runSkillEval(scenario, 2, {
      projectRoot: tmpDir,
      skillInstruction: 'SKILL_MARKER',
      interleave: true,
    });

    // Interleaved: B1, T1, B2, T2
    expect(callOrder).toEqual(['baseline', 'treatment', 'baseline', 'treatment']);
  });

  test('should call onTrialComplete in interleaved order', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    const trialOutput = { stdout: 'output', stderr: '', exitCode: 0 };
    const gradePass = { stdout: '', stderr: '', exitCode: 0 };
    for (let i = 0; i < 4; i++) {
      mockUtils.execCommand.mockReturnValueOnce(trialOutput);
      mockUtils.execCommand.mockReturnValueOnce(gradePass);
    }

    const callback = jest.fn();
    runSkillEval(scenario, 2, {
      projectRoot: tmpDir,
      skillInstruction: 'TDD.',
      interleave: true,
      onTrialComplete: callback,
    });

    expect(callback).toHaveBeenCalledTimes(4);
    // Interleaved order: baseline-1, treatment-1, baseline-2, treatment-2
    expect(callback.mock.calls[0][0]).toBe('baseline');
    expect(callback.mock.calls[0][1]).toBe(1);
    expect(callback.mock.calls[1][0]).toBe('treatment');
    expect(callback.mock.calls[1][1]).toBe(1);
    expect(callback.mock.calls[2][0]).toBe('baseline');
    expect(callback.mock.calls[2][1]).toBe(2);
    expect(callback.mock.calls[3][0]).toBe('treatment');
    expect(callback.mock.calls[3][1]).toBe(2);
  });

  test('should preserve sequential order when interleave=false', () => {
    writeScenario(tmpDir, 'test-ab.md', scenarioContent);
    const { parseScenario } = require('../../scripts/lib/eval');
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'test-ab.md'));

    const callOrder = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs, opts) => {
      if (cmd === 'claude') {
        const hasSkill = (opts.input || '').includes('SKILL_MARKER');
        callOrder.push(hasSkill ? 'treatment' : 'baseline');
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runSkillEval(scenario, 2, {
      projectRoot: tmpDir,
      skillInstruction: 'SKILL_MARKER',
      interleave: false,
    });

    // Sequential: B1, B2, T1, T2
    expect(callOrder).toEqual(['baseline', 'baseline', 'treatment', 'treatment']);
  });
});

// ── Trial isolation ─────────────────────────────────────────

describe('trial isolation', () => {
  describe('parseScenario setup field', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('extracts setup section from scenario', () => {
      const content = [
        '# Eval: iso-test',
        '',
        '## Scenario',
        'Do something.',
        '',
        '## Setup',
        'mkdir -p src && echo "hello" > src/main.js',
        '',
        '## Grader',
        'code',
      ].join('\n');
      const filePath = writeScenario(tmpDir, 'iso-test.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.setup).toBe('mkdir -p src && echo "hello" > src/main.js');
    });

    test('defaults setup to empty string when missing', () => {
      const content = '# Eval: no-setup\n\n## Scenario\nTask.\n';
      const filePath = writeScenario(tmpDir, 'no-setup.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.setup).toBe('');
    });
  });

  describe('createTrialDir', () => {
    test('creates directory under .eval-trials/ when projectRoot given', () => {
      const projectRoot = makeTempDir();
      const dir = createTrialDir('test-eval', 1, projectRoot);
      try {
        expect(dir).toContain('.eval-trials');
        expect(fs.existsSync(dir)).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(projectRoot, { recursive: true, force: true });
      }
    });

    test('includes eval name and trial number in prefix', () => {
      const projectRoot = makeTempDir();
      const dir = createTrialDir('my-eval', 3, projectRoot);
      try {
        expect(path.basename(dir)).toMatch(/^my-eval-t3-/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(projectRoot, { recursive: true, force: true });
      }
    });
  });

  describe('cleanupTrialDir', () => {
    test('removes temp directory', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
      fs.writeFileSync(path.join(dir, 'file.txt'), 'data');
      cleanupTrialDir(dir);

      expect(fs.existsSync(dir)).toBe(false);
    });

    test('ignores null/undefined', () => {
      expect(() => cleanupTrialDir(null)).not.toThrow();
      expect(() => cleanupTrialDir(undefined)).not.toThrow();
    });

    test('ignores paths outside tmpdir', () => {
      // Should not attempt to remove non-temp paths
      expect(() => cleanupTrialDir('/some/other/path')).not.toThrow();
    });
  });

  describe('runSetup', () => {
    afterEach(() => {
      mockUtils.execCommand.mockReset();
      mockUtils.execCommand.mockImplementation((...args) => {
        const actual = jest.requireActual('../../scripts/lib/utils');
        return actual.execCommand(...args);
      });
    });

    test('executes command in trial directory via sh -c', () => {
      mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const dir = '/tmp/fake-trial-dir';
      runSetup('mkdir -p src', dir);

      expect(mockUtils.execCommand).toHaveBeenCalledWith(
        'sh',
        ['-c', 'mkdir -p src'],
        expect.objectContaining({ cwd: dir }),
      );
    });

    test('throws on setup failure', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '',
        stderr: 'command not found',
        exitCode: 1,
      });

      expect(() => runSetup('bad-command', '/tmp/dir')).toThrow('Setup failed');
    });
  });

  describe('appendResult storage truncation', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('truncates large output for storage', () => {
      const bigOutput = 'x'.repeat(60000);
      const result = makeResult({ output: bigOutput });
      appendResult(result, tmpDir);

      const loaded = loadResults('test-eval', tmpDir);
      expect(loaded[0].output.length).toBeLessThan(bigOutput.length);
      expect(loaded[0].output).toContain('[truncated for storage]');
    });

    test('does not truncate normal-sized output', () => {
      const result = makeResult({ output: 'normal output' });
      appendResult(result, tmpDir);

      const loaded = loadResults('test-eval', tmpDir);
      expect(loaded[0].output).toBe('normal output');
    });
  });
});

// ── Model grader integration ────────────────────────────────

describe('model grader integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    mockUtils.execCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('gradeTrialResult dispatches to gradeWithModel for model grader', () => {
    const scenario = {
      name: 'model-test',
      scope: 'agent',
      grader: 'model',
      graderConfig: 'Check quality.',
      assertions: ['Output is correct', 'Format is valid'],
    };
    const result = makeResult({ output: 'some output', grader: 'model' });

    mockUtils.execCommand.mockReturnValueOnce({
      stdout: '{"scores": [0.9, 0.8], "overall": 0.85, "passed": true}',
      stderr: '',
      exitCode: 0,
    });

    const graded = gradeTrialResult(result, scenario, tmpDir);
    expect(graded.score).toBe(0.85);
    expect(graded.passed).toBe(true);
  });

  test('model grader prompt includes all assertions as numbered rubric', () => {
    const scenario = {
      name: 'rubric-test',
      scope: 'agent',
      grader: 'model',
      graderConfig: 'Grade carefully.',
      assertions: ['First criterion', 'Second criterion', 'Third criterion'],
    };
    const result = makeResult({ output: 'test output', grader: 'model' });

    mockUtils.execCommand.mockReturnValueOnce({
      stdout: '{"scores": [1, 1, 1], "overall": 1.0, "passed": true}',
      stderr: '',
      exitCode: 0,
    });

    gradeTrialResult(result, scenario, tmpDir);

    // Verify the prompt sent to Claude contains assertions
    const claudeCall = mockUtils.execCommand.mock.calls[0];
    const prompt = claudeCall[2].input;
    expect(prompt).toContain('1. First criterion');
    expect(prompt).toContain('2. Second criterion');
    expect(prompt).toContain('3. Third criterion');
  });

  test('model grader prompt includes graderConfig and trial output', () => {
    const scenario = {
      name: 'config-test',
      scope: 'agent',
      grader: 'model',
      graderConfig: 'CUSTOM_GUIDELINE_TEXT',
      assertions: ['Check output'],
    };
    const result = makeResult({ output: 'TRIAL_OUTPUT_CONTENT', grader: 'model' });

    mockUtils.execCommand.mockReturnValueOnce({
      stdout: '{"scores": [0.7], "overall": 0.7, "passed": true}',
      stderr: '',
      exitCode: 0,
    });

    gradeTrialResult(result, scenario, tmpDir);

    const prompt = mockUtils.execCommand.mock.calls[0][2].input;
    expect(prompt).toContain('CUSTOM_GUIDELINE_TEXT');
    expect(prompt).toContain('TRIAL_OUTPUT_CONTENT');
  });

  test('model grader prompt includes trial directory artifacts when available', () => {
    const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-model-'));
    fs.writeFileSync(path.join(trialDir, 'output.js'), 'ARTIFACT_CONTENT_MARKER');
    try {
      const scenario = {
        name: 'artifact-test',
        scope: 'agent',
        grader: 'model',
        graderConfig: 'Check artifacts.',
        assertions: ['File exists'],
      };
      const result = makeResult({ output: 'some output', grader: 'model', trialDir });

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [1.0], "overall": 1.0, "passed": true}',
        stderr: '',
        exitCode: 0,
      });

      gradeTrialResult(result, scenario, tmpDir);

      const prompt = mockUtils.execCommand.mock.calls[0][2].input;
      expect(prompt).toContain('Trial Directory Artifacts');
      expect(prompt).toContain('output.js');
      expect(prompt).toContain('ARTIFACT_CONTENT_MARKER');
    } finally {
      fs.rmSync(trialDir, { recursive: true, force: true });
    }
  });

  test('model grader works without trial directory', () => {
    const scenario = {
      name: 'no-trial-dir',
      scope: 'agent',
      grader: 'model',
      graderConfig: 'Check.',
      assertions: ['Works'],
    };
    const result = makeResult({ output: 'output', grader: 'model' });

    mockUtils.execCommand.mockReturnValueOnce({
      stdout: '{"scores": [0.8], "overall": 0.8, "passed": true}',
      stderr: '',
      exitCode: 0,
    });

    const graded = gradeTrialResult(result, scenario, tmpDir);
    expect(graded.passed).toBe(true);

    const prompt = mockUtils.execCommand.mock.calls[0][2].input;
    expect(prompt).not.toContain('Trial Directory Artifacts');
  });
});

// ── runWorkflowEval A/B flow ──────────────────────────────

describe('runWorkflowEval A/B flow', () => {
  let tmpDir;

  const scenarioContent = [
    '# Eval: workflow-ab-test',
    '',
    '## Scope',
    'workflow',
    '',
    '## Scenario',
    'Debug a failing test.',
    '',
    '## Context',
    'The test file has a typo.',
    '',
    '## Assertions',
    '- [ ] Fixes the bug',
    '',
    '## Grader',
    'code',
    '',
    '## Grader Config',
    'echo pass',
  ].join('\n');

  beforeEach(() => {
    jest.restoreAllMocks();
    tmpDir = makeTempDir();
    // Default: all execCommand calls succeed
    mockUtils.execCommand.mockReturnValue({ stdout: 'ok', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should run k baseline and k treatment trials', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const { baseline, treatment } = runWorkflowEval(scenario, 2, {
      projectRoot: tmpDir,
    });

    expect(baseline).toHaveLength(2);
    expect(treatment).toHaveLength(2);
  });

  test('should compute delta between baseline and treatment', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const { delta } = runWorkflowEval(scenario, 1, { projectRoot: tmpDir });

    expect(typeof delta).toBe('number');
  });

  test('baseline uses --strict-mcp-config, treatment does not', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const trialCalls = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs) => {
      if (cmd === 'claude' && cmdArgs.includes('-p')) {
        trialCalls.push({ args: [...cmdArgs] });
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runWorkflowEval(scenario, 1, { projectRoot: tmpDir });

    // First trial = baseline (should have --strict-mcp-config)
    expect(trialCalls[0].args).toContain('--strict-mcp-config');
    // Second trial = treatment (should NOT have --strict-mcp-config)
    expect(trialCalls[1].args).not.toContain('--strict-mcp-config');
  });

  test('both conditions use identical prompts', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const prompts = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs, opts) => {
      if (cmd === 'claude' && cmdArgs.includes('-p')) {
        prompts.push(opts.input);
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runWorkflowEval(scenario, 1, { projectRoot: tmpDir });

    // Both baseline and treatment should get the same prompt
    expect(prompts[0]).toBe(prompts[1]);
  });

  test('should store results with label suffixes in JSONL', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    runWorkflowEval(scenario, 1, { projectRoot: tmpDir });

    const baselineResults = loadResults('workflow-ab-test-baseline', tmpDir);
    const treatmentResults = loadResults('workflow-ab-test-treatment', tmpDir);
    expect(baselineResults.length).toBeGreaterThan(0);
    expect(treatmentResults.length).toBeGreaterThan(0);
  });

  test('should call onTrialComplete callback for each trial', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const callback = jest.fn();
    runWorkflowEval(scenario, 2, {
      projectRoot: tmpDir,
      onTrialComplete: callback,
    });

    expect(callback).toHaveBeenCalledTimes(4);
    expect(callback.mock.calls[0][0]).toBe('baseline');
    expect(callback.mock.calls[2][0]).toBe('treatment');
  });

  test('should interleave baseline and treatment when interleave=true', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const trialOrder = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs) => {
      if (cmd === 'claude' && cmdArgs.includes('-p')) {
        trialOrder.push(cmdArgs.includes('--strict-mcp-config') ? 'baseline' : 'treatment');
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runWorkflowEval(scenario, 2, {
      projectRoot: tmpDir,
      interleave: true,
    });

    // Interleaved: B1, T1, B2, T2
    expect(trialOrder).toEqual(['baseline', 'treatment', 'baseline', 'treatment']);
  });

  test('should preserve sequential order when interleave=false', () => {
    writeScenario(tmpDir, 'workflow-ab-test.md', scenarioContent);
    const scenario = parseScenario(path.join(tmpDir, SCENARIOS_DIR, 'workflow-ab-test.md'));

    const trialOrder = [];
    mockUtils.execCommand.mockImplementation((cmd, cmdArgs) => {
      if (cmd === 'claude' && cmdArgs.includes('-p')) {
        trialOrder.push(cmdArgs.includes('--strict-mcp-config') ? 'baseline' : 'treatment');
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    runWorkflowEval(scenario, 2, {
      projectRoot: tmpDir,
      interleave: false,
    });

    // Sequential: B1, B2, T1, T2
    expect(trialOrder).toEqual(['baseline', 'baseline', 'treatment', 'treatment']);
  });
});
