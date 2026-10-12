/**
 * eval-compare-no-analyzer.test.js - `arcforge eval compare --no-analyzer`.
 *
 * The analyzer is observed, not run: `compareWithModel` is spied so no `claude`
 * session is spawned. Result storage, pooling and the verdict run for real
 * against a temp project root.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const evalLib = require('../../scripts/lib/eval');
const graders = require('../../scripts/lib/eval-graders');
const { compareResults } = require('../../scripts/lib/eval-benchmark');
const { runEvalCommand } = require('../../scripts/cli/eval-command');

const SCENARIO = (name, grader) => `# Eval: ${name}

## Scope
agent

## Scenario
Do something.

## Context
A fixture.

## Assertions
- [ ] A1: It works

## Grader
${grader}
`;

const BANNER = '(Using eval-analyzer agent for qualitative analysis...)\n';
const SKIPPED = '(Analyzer skipped: --no-analyzer. The verdict below is the harness verdict.)\n';

function writeScenario(root, name, grader) {
  const dir = path.join(root, evalLib.SCENARIOS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), SCENARIO(name, grader));
}

function args(positional, flags = {}) {
  return { positional, options: {}, flags };
}

describe('eval compare --no-analyzer', () => {
  let tempDir;
  let logs;
  let analyzer;

  // Five trials per arm: the baseline fails every one, the treatment passes.
  function seed(name, grader) {
    writeScenario(tempDir, name, grader);
    for (let t = 1; t <= 5; t++) {
      const row = (condition, passed) => ({
        eval: `${name}-${condition}`,
        trial: t,
        k: 5,
        grader,
        passed,
        score: passed ? 1 : 0,
        timestamp: '2026-10-12T10:00:00.000Z',
        runId: '20261012-100000',
      });
      evalLib.appendResult(row('baseline', false), tempDir);
      evalLib.appendResult(row('treatment', true), tempDir);
    }
  }

  const compare = (name, flags) =>
    runEvalCommand(args(['compare', name], flags), { projectRoot: tempDir, asJson: false });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-compare-no-analyzer-'));
    logs = [];
    jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    analyzer = jest
      .spyOn(graders, 'compareWithModel')
      .mockReturnValue({ analysis: 'the treatment wrote the test first' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('never calls the analyzer for a model-graded scenario, and still prints the verdict', async () => {
    seed('skipped', 'model');

    await compare('skipped', { 'no-analyzer': true });

    expect(analyzer).not.toHaveBeenCalled();
    const out = logs.join('\n');
    expect(out).toContain('Verdict:   IMPROVED');
    expect(logs).toContain(SKIPPED);
    expect(logs).not.toContain(BANNER);
    expect(out).not.toContain('Analysis:');
  });

  it('runs the analyzer for a model-graded scenario without the flag', async () => {
    seed('analyzed', 'model');

    await compare('analyzed');

    expect(analyzer).toHaveBeenCalledTimes(1);
    const [scenario, baseline, treatment, projectRoot, metrics] = analyzer.mock.calls[0];
    expect(scenario.name).toBe('analyzed');
    expect(baseline).toHaveLength(5);
    expect(treatment).toHaveLength(5);
    expect(projectRoot).toBe(tempDir);
    expect(metrics.verdict).toBe('IMPROVED');
    const out = logs.join('\n');
    expect(logs).toContain(BANNER);
    expect(logs).not.toContain(SKIPPED);
    expect(out).toContain('Verdict:   IMPROVED');
    expect(out).toContain('Analysis: the treatment wrote the test first');
  });

  it('prints the same verdict with and without the flag', async () => {
    seed('same', 'model');
    const verdictLine = () => logs.find((line) => line.includes('Verdict:'));

    await compare('same');
    const analyzed = verdictLine();
    logs.length = 0;
    await compare('same', { 'no-analyzer': true });

    expect(verdictLine()).toBe(analyzed);
  });

  it('says nothing about the analyzer for a code-graded scenario, which never had one', async () => {
    seed('coded', 'code');

    await compare('coded', { 'no-analyzer': true });

    expect(analyzer).not.toHaveBeenCalled();
    expect(logs).not.toContain(SKIPPED);
    expect(logs).not.toContain(BANNER);
    expect(logs.join('\n')).toContain('Verdict:   IMPROVED');
  });

  describe('compareResults', () => {
    const rows = (passed) =>
      [1, 2, 3, 4, 5].map((trial) => ({ trial, passed, score: passed ? 1 : 0 }));
    const scenario = { name: 'lib', grader: 'model', assertions: ['A1: It works'] };

    it('skips the analyzer when skipAnalyzer is set and leaves the metrics unchanged', () => {
      const analyzed = compareResults(scenario, rows(false), rows(true), tempDir);
      const skipped = compareResults(scenario, rows(false), rows(true), tempDir, {
        skipAnalyzer: true,
      });

      expect(analyzer).toHaveBeenCalledTimes(1);
      expect(skipped.modelAnalysis).toBeUndefined();
      const { modelAnalysis, ...metrics } = analyzed;
      expect(modelAnalysis).toEqual({ analysis: 'the treatment wrote the test first' });
      expect(skipped).toEqual(metrics);
    });
  });
});
