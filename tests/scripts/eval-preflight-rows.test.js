/**
 * eval-preflight-rows.test.js - preflight trials are on record as result rows,
 * under their own condition, and no A/B reader ever picks them up.
 *
 * The exclusion fixture is poisoned on purpose: every preflight row passes and
 * every baseline row fails, under identical run conditions. A reader that mixed
 * the two would show a baseline above zero.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  RESULTS_DIR,
  SCENARIOS_DIR,
  appendResult,
  loadResults,
  loadResultPools,
  parseEvalName,
  parseScenario,
  repoCommit,
  runTrial,
  saveTranscript,
} = require('../../scripts/lib/eval');
const { pairArms } = require('../../scripts/lib/eval-pools');
const {
  comparisonFromAbResults,
  generateBenchmark,
  rawRowsForScenario,
} = require('../../scripts/lib/eval-benchmark');
const { getGradingPath } = require('../../scripts/lib/eval-grader-io');
const { createRouter } = require('../../scripts/lib/eval-dashboard/eval-dashboard');
const {
  runPreflight,
  gradePreflightTrial,
  PREFLIGHT_K,
  PREFLIGHT_LABEL,
} = require('../../scripts/lib/eval-preflight');
const { callRouter } = require('./eval-dashboard-fixtures');

const NAME = 'rows';
const RUN_ID = '20261012-090000-ab12';
const SCENARIO = `# Eval: ${NAME}\n\n## Scope\nskill\n\n## Scenario\nDo it.\n\n## Grader\ncode\n`;

const CONDITIONS = {
  model: 'opus',
  effort: 'high',
  trialTimeoutMs: 900000,
  maxTurns: null,
  pluginDir: false,
  isolation: 'isolated',
};

function trialRow(evalName, trial, extra = {}) {
  return {
    eval: evalName,
    trial,
    k: PREFLIGHT_K,
    passed: false,
    score: 0,
    grader: 'code',
    timestamp: `2026-10-12T09:0${trial}:00.000Z`,
    runId: RUN_ID,
    ...CONDITIONS,
    ...extra,
  };
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('preflight result rows', () => {
  let tempDir;
  let runDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-preflight-rows-'));
    const scenariosDir = path.join(tempDir, SCENARIOS_DIR);
    fs.mkdirSync(scenariosDir, { recursive: true });
    fs.writeFileSync(path.join(scenariosDir, `${NAME}.md`), SCENARIO);
    runDir = path.join(tempDir, RESULTS_DIR, NAME, RUN_ID);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const preflight = (runTrial, gradeResult = (r) => r) =>
    runPreflight(NAME, tempDir, { runTrial, gradeResult, model: 'opus' });

  describe('runPreflight writes them', () => {
    it('one row per trial, in preflight.jsonl beside the run transcripts', () => {
      preflight((t) => trialRow(`${NAME}-${PREFLIGHT_LABEL}`, t, { passed: t === 1, score: 1 }));

      expect(fs.readdirSync(runDir)).toEqual(['preflight.jsonl']);
      const rows = readJsonl(path.join(runDir, 'preflight.jsonl'));
      expect(rows.map((r) => r.trial)).toEqual([1, 2, 3]);
      expect(rows.map((r) => r.passed)).toEqual([true, false, false]);
      for (const row of rows) {
        expect(row.eval).toBe(`${NAME}-preflight`);
        expect(row.runId).toBe(RUN_ID);
        expect(row).toMatchObject(CONDITIONS);
      }
    });

    it('records the graded row, not the ungraded one', () => {
      preflight(
        (t) => trialRow(`${NAME}-preflight`, t),
        (raw) => ({ ...raw, passed: true, score: 1, evidence: ['graded'] }),
      );
      const rows = readJsonl(path.join(runDir, 'preflight.jsonl'));
      expect(rows.every((r) => r.passed && r.evidence[0] === 'graded')).toBe(true);
    });

    it('stamps the scenario version, as an A/B row carries it', () => {
      fs.writeFileSync(
        path.join(tempDir, SCENARIOS_DIR, `${NAME}.md`),
        `${SCENARIO}\n## Version\n3\n`,
      );
      expect(parseScenario(path.join(tempDir, SCENARIOS_DIR, `${NAME}.md`)).version).toBe('3');
      preflight((t) => trialRow(`${NAME}-preflight`, t));
      const rows = readJsonl(path.join(runDir, 'preflight.jsonl'));
      expect(rows.map((r) => r.version)).toEqual(['3', '3', '3']);
    });

    it('labels the row itself, so a mislabelled runner cannot write into an arm', () => {
      preflight((t) => trialRow(`${NAME}-baseline`, t, { passed: true, score: 1 }));

      expect(fs.readdirSync(runDir)).toEqual(['preflight.jsonl']);
      expect(loadResults(`${NAME}-baseline`, tempDir)).toEqual([]);
      expect(loadResults(NAME, tempDir)).toEqual([]);
    });

    it('records errored trials too, and still blocks', () => {
      const record = preflight((t) =>
        trialRow(`${NAME}-preflight`, t, { infraError: true, errorType: 'setup_failed' }),
      );
      expect(record.verdict).toBe('BLOCK');
      const rows = readJsonl(path.join(runDir, 'preflight.jsonl'));
      expect(rows.map((r) => r.errorType)).toEqual([
        'setup_failed',
        'setup_failed',
        'setup_failed',
      ]);
    });

    it('keeps the row of the trial that wrote the repository, then stops the run', () => {
      const runTrial = jest.fn((t) =>
        trialRow(`${NAME}-preflight`, t, {
          infraError: true,
          errorType: 'trial_wrote_repo',
          error: 'Trial wrote outside its directory: README.md',
        }),
      );
      expect(() => preflight(runTrial)).toThrow('preflight trial 1 wrote outside its directory');
      expect(runTrial).toHaveBeenCalledTimes(1);
      const rows = readJsonl(path.join(runDir, 'preflight.jsonl'));
      expect(rows).toHaveLength(1);
      expect(rows[0].errorType).toBe('trial_wrote_repo');
    });
  });

  describe('gradePreflightTrial', () => {
    it('returns an infra error ungraded and removes its trial directory', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-preflight-trial-'));
      const raw = trialRow(`${NAME}-preflight`, 1, { infraError: true, trialDir });
      const scenario = parseScenario(path.join(tempDir, SCENARIOS_DIR, `${NAME}.md`));
      expect(gradePreflightTrial(raw, scenario, tempDir)).toBe(raw);
      expect(fs.existsSync(trialDir)).toBe(false);
    });
  });

  describe('the preflight condition has its own storage', () => {
    it('parseEvalName reads the suffix as a condition of the same scenario', () => {
      expect(parseEvalName('my-eval-preflight')).toEqual({
        scenarioName: 'my-eval',
        condition: 'preflight',
      });
      expect(parseEvalName('preflight-eval').condition).toBe('results');
    });

    it('transcripts and grading files land under the scenario, not a "-preflight" twin', () => {
      const transcript = saveTranscript(`${NAME}-preflight`, 2, 'out', tempDir, RUN_ID);
      expect(transcript).toBe(path.join(runDir, 'transcripts', 'preflight-trial-2.txt'));
      const grading = getGradingPath(trialRow(`${NAME}-preflight`, 2), tempDir);
      expect(grading).toBe(path.join(runDir, 'grading', 'preflight-trial-2.json'));
    });
  });

  describe('repoCommit, against real git', () => {
    it('is the HEAD of the checkout it is asked about', () => {
      expect(repoCommit(path.resolve(__dirname, '../..'))).toMatch(/^[0-9a-f]{40}$/);
    });

    it('is null for a directory outside any repository', () => {
      expect(repoCommit(tempDir)).toBeNull();
    });
  });

  describe('a scenario may not be named like a condition', () => {
    // `eval run release-preflight` would be filed as release/<runId>/preflight.jsonl.
    it.each([
      'preflight',
      'baseline',
      'treatment',
    ])('runTrial refuses a name ending in -%s before any session or row', (suffix) => {
      const scenario = { name: `release-${suffix}`, scenario: 'Do it.', grader: 'code' };
      expect(() => runTrial(scenario, 1, 1, { projectRoot: tempDir })).toThrow(
        `Scenario name "release-${suffix}" ends in the reserved suffix "-${suffix}"`,
      );
      expect(fs.existsSync(path.join(tempDir, RESULTS_DIR))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, '.eval-trials'))).toBe(false);
    });
  });

  describe('no A/B reader picks them up', () => {
    const AB_RUN = '20261012-100000-cd34';
    const abRow = (arm, trial, passed) =>
      trialRow(`${NAME}-${arm}`, trial, {
        runId: AB_RUN,
        passed,
        score: passed ? 1 : 0,
        timestamp: `2026-10-12T10:0${trial}:00.000Z`,
      });
    let scenario;

    beforeEach(() => {
      // Preflight: 3/3 pass. Baseline: 0/3. Treatment: 3/3. Same conditions.
      for (let t = 1; t <= 3; t++) {
        appendResult(trialRow(`${NAME}-preflight`, t, { passed: true, score: 1 }), tempDir);
        // A preflight row written into the A/B run directory is still not an arm.
        appendResult(
          trialRow(`${NAME}-preflight`, t, { runId: AB_RUN, passed: true, score: 1 }),
          tempDir,
        );
        appendResult(abRow('baseline', t, false), tempDir);
        appendResult(abRow('treatment', t, true), tempDir);
      }
      scenario = parseScenario(path.join(tempDir, SCENARIOS_DIR, `${NAME}.md`));
    });

    it('loadResults returns preflight rows only under the preflight name', () => {
      expect(loadResults(`${NAME}-preflight`, tempDir)).toHaveLength(6);
      const baseline = loadResults(`${NAME}-baseline`, tempDir);
      const treatment = loadResults(`${NAME}-treatment`, tempDir);
      expect(baseline.map((r) => r.eval)).toEqual(Array(3).fill(`${NAME}-baseline`));
      expect(treatment.map((r) => r.eval)).toEqual(Array(3).fill(`${NAME}-treatment`));
      expect(loadResults(NAME, tempDir)).toEqual([]);
      expect(loadResultPools(NAME, tempDir).current).toEqual([]);
    });

    it('pairArms pairs the two arms and leaves nothing unpaired', () => {
      const paired = pairArms(
        loadResults(`${NAME}-baseline`, tempDir),
        loadResults(`${NAME}-treatment`, tempDir),
      );
      expect(paired.error).toBeUndefined();
      expect(paired.baseline).toHaveLength(3);
      expect(paired.baseline.every((r) => !r.passed)).toBe(true);
      expect(paired.treatment).toHaveLength(3);
      expect(paired.unpaired).toEqual([]);
    });

    it('the benchmark comparison judges baseline 0/3 against treatment 3/3', () => {
      const comparison = comparisonFromAbResults(scenario, tempDir, {});
      expect(comparison.baseline).toMatchObject({ count: 3, passRate: 0 });
      expect(comparison.treatment).toMatchObject({ count: 3, passRate: 1 });
      expect(comparison.delta).toBe(1);
      expect(comparison.other_pools).toBeUndefined();
    });

    it('the benchmark snapshot and its raw export carry no preflight row', () => {
      const raw = rawRowsForScenario(scenario, tempDir);
      expect(raw.map((r) => r.condition).sort()).toEqual([
        ...Array(3).fill('baseline'),
        ...Array(3).fill('treatment'),
      ]);
      const snapshot = generateBenchmark(tempDir);
      expect(snapshot.evals[NAME].trials).toBe(3);
      expect(JSON.stringify(snapshot)).not.toContain('preflight');
    });

    it('the dashboard compares the arms alone and lists preflight as its own condition', () => {
      const router = createRouter(tempDir, '');
      const compare = callRouter(router, `/api/compare/${NAME}`).json();
      expect(compare.baseline.stats).toMatchObject({ count: 3, passRate: 0 });
      expect(compare.treatment.stats).toMatchObject({ count: 3, passRate: 1 });
      expect(compare.otherPools).toEqual([]);

      const [listed] = callRouter(router, '/api/scenarios').json().scenarios;
      expect(listed).toMatchObject({ resultCount: 3, passRate: 1, otherPools: [] });

      const { runs } = callRouter(router, `/api/runs/${NAME}`).json();
      const preflightRun = runs.find((r) => r.runId === RUN_ID);
      expect(preflightRun.conditions).toEqual(['preflight']);
      const abRun = runs.find((r) => r.runId === AB_RUN);
      expect(abRun.stats.baseline).toMatchObject({ count: 3, passRate: 0 });
      expect(abRun.stats.preflight).toMatchObject({ count: 3, passRate: 1 });

      const viewed = callRouter(router, `/api/results/${NAME}-preflight`).json();
      expect(viewed.results).toHaveLength(6);
    });
  });
});
