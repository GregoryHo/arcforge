const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Mock utils.execCommand so gradeWithModel tests can intercept Claude calls.
// Default implementation delegates to the real function — only gradeWithModel
// tests override via mockReturnValueOnce.
jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn((...args) => actual.execCommand(...args)) };
});
const mockUtils = require('../../scripts/lib/utils');

const {
  parseScenario,
  buildTrialPrompt,
  listScenarios,
  appendResult,
  loadResults,
  passAtK,
  passAllK,
  computeDelta,
  generateBenchmark,
  getVerdict,
  ensureEvalsDir,
  gradeWithCode,
  gradeWithModel,
  gradeTrialResult,
  saveTranscript,
  runSkillEval,
  SCENARIOS_DIR,
  RESULTS_DIR,
  BENCHMARKS_DIR,
} = require('../../scripts/lib/eval');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-'));
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

const FULL_SCENARIO = `# Eval: tdd-compliance

## Scope
skill

## Scenario
Ask Claude to implement a function using TDD.

## Context
The project uses Jest for testing.

## Assertions
- [ ] Writes test before implementation
- [x] Test file exists
- [ ] All tests pass

## Grader
code

## Grader Config
npm run test:scripts
`;

describe('eval.js', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── parseScenario ────────────────────────────────────────────

  describe('parseScenario', () => {
    it('should parse a full scenario with all sections', () => {
      const filePath = writeScenario(tempDir, 'tdd.md', FULL_SCENARIO);
      const scenario = parseScenario(filePath);

      expect(scenario.name).toBe('tdd-compliance');
      expect(scenario.scope).toBe('skill');
      expect(scenario.scenario).toBe('Ask Claude to implement a function using TDD.');
      expect(scenario.context).toBe('The project uses Jest for testing.');
      expect(scenario.assertions).toEqual([
        'Writes test before implementation',
        'Test file exists',
        'All tests pass',
      ]);
      expect(scenario.grader).toBe('code');
      expect(scenario.graderConfig).toBe('npm run test:scripts');
    });

    it('should fall back to filename when no Eval header', () => {
      const content = '## Scope\nagent\n\n## Scenario\nDo something.\n';
      const filePath = writeScenario(tempDir, 'my-eval.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.name).toBe('my-eval');
    });

    it('should extract both checked and unchecked assertions', () => {
      const content = `# Eval: mixed
## Assertions
- [ ] unchecked item
- [x] checked item
- [ ] another unchecked
`;
      const filePath = writeScenario(tempDir, 'mixed.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.assertions).toHaveLength(3);
      expect(scenario.assertions[0]).toBe('unchecked item');
      expect(scenario.assertions[1]).toBe('checked item');
    });

    it('should use defaults for missing sections', () => {
      const content = '# Eval: minimal\n\n## Scenario\nJust a task.\n';
      const filePath = writeScenario(tempDir, 'minimal.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.name).toBe('minimal');
      expect(scenario.scope).toBe('skill');
      expect(scenario.context).toBe('');
      expect(scenario.assertions).toEqual([]);
      expect(scenario.grader).toBe('code');
      expect(scenario.graderConfig).toBe('');
    });

    it('should ignore non-assertion lines in assertions section', () => {
      const content = `# Eval: filtered
## Assertions
Some intro text.
- [ ] Real assertion
- Not a checkbox item
- [ ] Another assertion
Plain text at end.
`;
      const filePath = writeScenario(tempDir, 'filtered.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.assertions).toEqual(['Real assertion', 'Another assertion']);
    });
  });

  // ── buildTrialPrompt ─────────────────────────────────────────

  describe('buildTrialPrompt', () => {
    it('should include all sections when present', () => {
      const scenario = {
        context: 'Project uses Jest.',
        scenario: 'Write a function.',
        assertions: ['Tests pass', 'Code compiles'],
      };
      const prompt = buildTrialPrompt(scenario);

      expect(prompt).toContain('## Context');
      expect(prompt).toContain('Project uses Jest.');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('Write a function.');
      expect(prompt).toContain('## Requirements');
      expect(prompt).toContain('- Tests pass');
      expect(prompt).toContain('- Code compiles');
    });

    it('should omit context when empty', () => {
      const scenario = { context: '', scenario: 'Do something.', assertions: [] };
      const prompt = buildTrialPrompt(scenario);

      expect(prompt).not.toContain('## Context');
      expect(prompt).toContain('## Task');
    });

    it('should omit requirements when no assertions', () => {
      const scenario = { context: 'Some context.', scenario: 'Do something.', assertions: [] };
      const prompt = buildTrialPrompt(scenario);

      expect(prompt).not.toContain('## Requirements');
    });

    it('should list all assertions as requirements', () => {
      const scenario = {
        context: '',
        scenario: 'Task.',
        assertions: ['A', 'B', 'C'],
      };
      const prompt = buildTrialPrompt(scenario);
      const lines = prompt.split('\n');
      const reqLines = lines.filter((l) => l.startsWith('- '));

      expect(reqLines).toHaveLength(3);
    });
  });

  // ── listScenarios ─────────────────────────────────────────────

  describe('listScenarios', () => {
    it('should return empty array when scenarios dir does not exist', () => {
      const result = listScenarios(tempDir);
      expect(result).toEqual([]);
    });

    it('should return only .md files', () => {
      const scenariosDir = path.join(tempDir, SCENARIOS_DIR);
      fs.mkdirSync(scenariosDir, { recursive: true });
      fs.writeFileSync(path.join(scenariosDir, 'a.md'), '# Eval: a');
      fs.writeFileSync(path.join(scenariosDir, 'b.md'), '# Eval: b');
      fs.writeFileSync(path.join(scenariosDir, 'c.txt'), 'not a scenario');

      const result = listScenarios(tempDir);
      expect(result).toHaveLength(2);
      expect(result.every((f) => f.endsWith('.md'))).toBe(true);
    });

    it('should return full paths', () => {
      writeScenario(tempDir, 'test.md', '# Eval: test');
      const result = listScenarios(tempDir);

      expect(result).toHaveLength(1);
      expect(path.isAbsolute(result[0])).toBe(true);
      expect(result[0]).toContain(tempDir);
    });
  });

  // ── appendResult / loadResults ────────────────────────────────

  describe('appendResult and loadResults', () => {
    it('should roundtrip a single result', () => {
      const result = makeResult({ passed: true, score: 1.0 });
      appendResult(result, tempDir);

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].eval).toBe('test-eval');
      expect(loaded[0].passed).toBe(true);
      expect(loaded[0].score).toBe(1.0);
    });

    it('should append multiple results to same file', () => {
      appendResult(makeResult({ trial: 1 }), tempDir);
      appendResult(makeResult({ trial: 2 }), tempDir);
      appendResult(makeResult({ trial: 3 }), tempDir);

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded).toHaveLength(3);
      expect(loaded.map((r) => r.trial)).toEqual([1, 2, 3]);
    });

    it('should return empty when results dir does not exist', () => {
      const loaded = loadResults('nonexistent', tempDir);
      expect(loaded).toEqual([]);
    });

    it('should not cross-contaminate evals with similar name suffixes', () => {
      // "tdd" results should NOT include "advanced-tdd" results
      const tddResult = makeResult({ eval: 'tdd', score: 1.0, passed: true });
      const advResult = makeResult({ eval: 'advanced-tdd', score: 0.5 });

      appendResult(tddResult, tempDir);
      appendResult(advResult, tempDir);

      const tddLoaded = loadResults('tdd', tempDir);
      expect(tddLoaded).toHaveLength(1);
      expect(tddLoaded[0].eval).toBe('tdd');
    });

    it('should create results directory if missing', () => {
      const resultsDir = path.join(tempDir, RESULTS_DIR);
      expect(fs.existsSync(resultsDir)).toBe(false);

      appendResult(makeResult(), tempDir);
      expect(fs.existsSync(resultsDir)).toBe(true);
    });

    it('should name file using date and eval name', () => {
      appendResult(makeResult({ timestamp: '2026-03-17T10:00:00Z' }), tempDir);

      const resultsDir = path.join(tempDir, RESULTS_DIR);
      const files = fs.readdirSync(resultsDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('2026-03-17-test-eval.jsonl');
    });
  });

  // ── passAtK ──────────────────────────────────────────────────

  describe('passAtK', () => {
    it('should return true when at least one passes', () => {
      expect(passAtK([{ passed: false }, { passed: true }, { passed: false }])).toBe(true);
    });

    it('should return false when all fail', () => {
      expect(passAtK([{ passed: false }, { passed: false }])).toBe(false);
    });

    it('should return true when all pass', () => {
      expect(passAtK([{ passed: true }, { passed: true }])).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(passAtK([])).toBe(false);
    });
  });

  // ── passAllK ─────────────────────────────────────────────────

  describe('passAllK', () => {
    it('should return true when all pass', () => {
      expect(passAllK([{ passed: true }, { passed: true }])).toBe(true);
    });

    it('should return false when any fails', () => {
      expect(passAllK([{ passed: true }, { passed: false }])).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(passAllK([])).toBe(false);
    });
  });

  // ── computeDelta ─────────────────────────────────────────────

  describe('computeDelta', () => {
    it('should compute positive delta', () => {
      const baseline = [{ score: 0.4 }, { score: 0.6 }]; // avg 0.5
      const treatment = [{ score: 0.7 }, { score: 0.9 }]; // avg 0.8
      expect(computeDelta(baseline, treatment)).toBeCloseTo(0.3);
    });

    it('should compute negative delta', () => {
      const baseline = [{ score: 0.8 }];
      const treatment = [{ score: 0.5 }];
      expect(computeDelta(baseline, treatment)).toBeCloseTo(-0.3);
    });

    it('should return 0 for empty baseline', () => {
      expect(computeDelta([], [{ score: 1.0 }])).toBe(0);
    });

    it('should return 0 for empty treatment', () => {
      expect(computeDelta([{ score: 1.0 }], [])).toBe(0);
    });

    it('should return 0 for identical scores', () => {
      const data = [{ score: 0.7 }, { score: 0.7 }];
      expect(computeDelta(data, data)).toBeCloseTo(0);
    });
  });

  // ── getVerdict ────────────────────────────────────────────────

  describe('getVerdict', () => {
    it('should return SHIP for 100% pass rate', () => {
      expect(getVerdict([{ passed: true }, { passed: true }, { passed: true }])).toBe('SHIP');
    });

    it('should return NEEDS WORK for 80% pass rate', () => {
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: false },
      ];
      expect(getVerdict(results)).toBe('NEEDS WORK');
    });

    it('should return NEEDS WORK at exactly 60% boundary', () => {
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: false },
        { passed: false },
      ];
      expect(getVerdict(results)).toBe('NEEDS WORK');
    });

    it('should return BLOCKED for <60% pass rate', () => {
      const results = [
        { passed: true },
        { passed: false },
        { passed: false },
        { passed: false },
        { passed: false },
      ];
      expect(getVerdict(results)).toBe('BLOCKED');
    });

    it('should return BLOCKED for empty results', () => {
      expect(getVerdict([])).toBe('BLOCKED');
    });
  });

  // ── generateBenchmark ─────────────────────────────────────────

  describe('generateBenchmark', () => {
    it('should generate benchmark from scenarios and results', () => {
      writeScenario(tempDir, 'my-eval.md', '# Eval: my-eval\n\n## Scenario\nTest.\n');

      const resultsDir = path.join(tempDir, RESULTS_DIR);
      fs.mkdirSync(resultsDir, { recursive: true });
      const results = [
        makeResult({ eval: 'my-eval', trial: 1, passed: true, score: 1.0 }),
        makeResult({ eval: 'my-eval', trial: 2, passed: true, score: 0.8 }),
        makeResult({ eval: 'my-eval', trial: 3, passed: false, score: 0.2 }),
      ];
      const jsonl = `${results.map((r) => JSON.stringify(r)).join('\n')}\n`;
      fs.writeFileSync(path.join(resultsDir, '2026-03-17-my-eval.jsonl'), jsonl);

      const benchmark = generateBenchmark(tempDir);

      expect(benchmark.evals['my-eval']).toBeDefined();
      expect(benchmark.evals['my-eval'].trials).toBe(3);
      expect(benchmark.evals['my-eval'].pass_rate).toBeCloseTo(0.67, 1);
      expect(benchmark.evals['my-eval'].avg_score).toBeCloseTo(0.67, 1);
      expect(benchmark.evals['my-eval'].pass_at_k).toBe(true);
      expect(benchmark.evals['my-eval'].pass_all_k).toBe(false);
    });

    it('should skip scenarios with no results', () => {
      writeScenario(tempDir, 'empty-eval.md', '# Eval: empty-eval\n\n## Scenario\nNo runs.\n');

      const benchmark = generateBenchmark(tempDir);
      expect(benchmark.evals['empty-eval']).toBeUndefined();
    });

    it('should write latest.json', () => {
      writeScenario(tempDir, 'bench.md', '# Eval: bench\n\n## Scenario\nTest.\n');
      generateBenchmark(tempDir);

      const jsonPath = path.join(tempDir, BENCHMARKS_DIR, 'latest.json');
      expect(fs.existsSync(jsonPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      expect(data.generated).toBeDefined();
    });
  });

  // ── ensureEvalsDir ────────────────────────────────────────────

  describe('ensureEvalsDir', () => {
    it('should create all three subdirectories', () => {
      ensureEvalsDir(tempDir);

      expect(fs.existsSync(path.join(tempDir, SCENARIOS_DIR))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, RESULTS_DIR))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, BENCHMARKS_DIR))).toBe(true);
    });

    it('should be idempotent', () => {
      ensureEvalsDir(tempDir);
      ensureEvalsDir(tempDir);

      expect(fs.existsSync(path.join(tempDir, SCENARIOS_DIR))).toBe(true);
    });
  });

  // ── gradeWithCode ─────────────────────────────────────────────

  describe('gradeWithCode', () => {
    it('should return passed:true for successful command', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, ['node', '-e', 'process.exit(0)'], tempDir);

      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should return passed:false for failing command', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, ['node', '-e', 'process.exit(1)'], tempDir);

      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.0);
    });

    it('should not mutate the input result', () => {
      const result = makeResult();
      const original = { ...result };
      gradeWithCode(result, ['node', '-e', 'process.exit(0)'], tempDir);

      expect(result).toEqual(original);
    });

    it('should handle string command via shell', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'node -e "process.exit(0)"', tempDir);

      expect(graded.passed).toBe(true);
    });

    it('should handle shell features like && chaining', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'true && node -e "process.exit(0)"', tempDir);

      expect(graded.passed).toBe(true);
    });
  });

  // ── gradeWithModel ────────────────────────────────────────────

  describe('gradeWithModel', () => {
    const mockScenario = {
      name: 'test-eval',
      scope: 'agent',
      scenario: 'Do something.',
      context: '',
      assertions: ['Criterion A', 'Criterion B'],
      grader: 'model',
      graderConfig: 'Score based on completeness.',
    };

    it('should be exported as a function', () => {
      expect(typeof gradeWithModel).toBe('function');
    });

    it('should parse valid JSON grade and not mutate input', () => {
      const result = makeResult({ output: 'test output' });
      const original = { ...result };

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [0.9, 0.8], "overall": 0.85, "passed": true}',
        stderr: '',
        exitCode: 0,
      });

      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(result).toEqual(original);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(0.85);
    });

    it('should handle Claude failure gracefully', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0);
      expect(graded.error).toContain('failed to respond');
    });

    it('should handle unparseable response', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: 'I cannot grade this output because...',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.error).toContain('unparseable');
    });

    it('should extract JSON from mixed markdown response', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout:
          'Here is my grade:\n```json\n{"scores": [1.0, 0.6], "overall": 0.80, "passed": false}\n```',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.8);
    });
  });

  // ── saveTranscript ────────────────────────────────────────────

  describe('saveTranscript', () => {
    it('should save output to transcript file and return path', () => {
      const filePath = saveTranscript('my-eval', 1, 'full output text', tempDir);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('full output text');
      expect(filePath).toContain('my-eval-trial-1.txt');
    });

    it('should create transcripts subdirectory', () => {
      saveTranscript('test', 2, 'output', tempDir);
      const transcriptsDir = path.join(tempDir, RESULTS_DIR, 'transcripts');
      expect(fs.existsSync(transcriptsDir)).toBe(true);
    });
  });

  // ── gradeTrialResult ──────────────────────────────────────────

  describe('gradeTrialResult', () => {
    it('should dispatch to gradeWithCode for code grader', () => {
      const result = makeResult();
      const scenario = { grader: 'code', graderConfig: 'true' };
      const graded = gradeTrialResult(result, scenario, tempDir);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should dispatch to gradeWithModel for model grader', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [0.9], "overall": 0.9, "passed": true}',
        stderr: '',
        exitCode: 0,
      });
      const result = makeResult({ output: 'some output' });
      const scenario = {
        grader: 'model',
        graderConfig: 'Check quality.',
        assertions: ['Is good'],
      };
      const graded = gradeTrialResult(result, scenario, tempDir);
      expect(graded.passed).toBe(true);
    });

    it('should return human-pending for human grader', () => {
      const result = makeResult();
      const scenario = { grader: 'human', graderConfig: '' };
      const graded = gradeTrialResult(result, scenario, tempDir);
      expect(graded.grader).toBe('human-pending');
    });
  });

  // ── runSkillEval ──────────────────────────────────────────────

  describe('runSkillEval', () => {
    it('should be exported as a function', () => {
      expect(typeof runSkillEval).toBe('function');
    });
  });
});
