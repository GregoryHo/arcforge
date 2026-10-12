/**
 * eval-row-stamp.test.js - every result row and preflight record says which
 * scenario text and which Node.js it ran from (`scenario_hash`,
 * `node_version`), and neither is a pooling condition (B-8 unchanged).
 *
 * Doubles as the schema test for the row and the preflight record: the key
 * sets below are exact. The `claude` subprocess is stubbed; no session is
 * spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const {
  RESULTS_DIR,
  SCENARIOS_DIR,
  findScenario,
  loadResults,
  runSkillEval,
  runTrial,
  stampRow,
} = require('../../scripts/lib/eval');
const { rawRowsForScenario } = require('../../scripts/lib/eval-benchmark');
const { CONDITION_FIELDS, pairArms, splitPools } = require('../../scripts/lib/eval-pools');
const {
  computeScenarioHash,
  checkPreflightGate,
  gradePreflightTrial,
  preflightFilename,
  runPreflight,
  PREFLIGHT_DIR,
  PREFLIGHT_LABEL,
} = require('../../scripts/lib/eval-preflight');

const NAME = 'stamped';
const RUN_ID = '20261012-110000-ef56';
const SCENARIO_TEXT = `# Eval: ${NAME}

## Scope
skill

## Scenario
Do it.

## Assertions
- [ ] A1: It works

## Grader
code

## Grader Config
true

## Version
2
`;
const DONE_STREAM = [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } }),
  JSON.stringify({ type: 'result', result: 'Done' }),
].join('\n');

/** What runTrial builds for a scored trial, plus the grader's and the stamp's fields. */
const ROW_KEYS = [
  'actions',
  'api_duration_ms',
  'duration_ms',
  'effort',
  'eval',
  'grader',
  'input_tokens',
  'isolation',
  'k',
  'maxTurns',
  'model',
  'node_version',
  'output',
  'output_tokens',
  'passed',
  'pluginDir',
  'runId',
  'scenario_hash',
  'score',
  'timestamp',
  'transcript',
  'trial',
  'trialDir',
  'trialTimeoutMs',
  'version',
];

const RECORD_KEYS = [
  'effort',
  'k',
  'max_turns',
  'model',
  'node_version',
  'pass_rate',
  'plugin_dir',
  'reason',
  'scenario_hash',
  'scenario_name',
  'timestamp',
  'trial_timeout_ms',
  'verdict',
];

describe('rows and preflight records carry scenario_hash and node_version', () => {
  let tempDir;
  let scenarioFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-row-stamp-'));
    scenarioFile = path.join(tempDir, SCENARIOS_DIR, `${NAME}.md`);
    fs.mkdirSync(path.dirname(scenarioFile), { recursive: true });
    fs.writeFileSync(scenarioFile, SCENARIO_TEXT);
    mockUtils.execCommand.mockReset();
    mockUtils.execCommand.mockImplementation((cmd, args) => {
      if (cmd === 'claude' && args[0] === 'plugin')
        return { stdout: '[]', stderr: '', exitCode: 0 };
      return { stdout: cmd === 'claude' ? DONE_STREAM : '', stderr: '', exitCode: 0 };
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const HASH = computeScenarioHash(SCENARIO_TEXT);
  /** Every trial hits the ceiling: an infra error, never a score. */
  const killEveryTrial = () => {
    const error = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT', status: 143 });
    mockUtils.execCommand.mockImplementation((cmd, args) => {
      if (cmd === 'claude' && args[0] === 'plugin')
        return { stdout: '[]', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 143, error };
    });
  };
  const runAb = (k = 2) =>
    runSkillEval(findScenario(NAME, tempDir), k, {
      projectRoot: tempDir,
      skillInstruction: 'Use the skill.',
      model: 'opus',
      effort: 'high',
      runId: RUN_ID,
    });
  const runPreflightTrials = (conditions = {}) => {
    const scenario = findScenario(NAME, tempDir);
    return runPreflight(NAME, tempDir, {
      runTrial: (t, k) =>
        runTrial(scenario, t, k, {
          projectRoot: tempDir,
          model: 'opus',
          runId: RUN_ID,
          isolated: true,
          label: PREFLIGHT_LABEL,
        }),
      gradeResult: (row) => gradePreflightTrial(row, scenario, tempDir),
      model: 'opus',
      conditions,
    });
  };

  describe('stampRow', () => {
    it('adds the version, the scenario hash and the running Node version', () => {
      const row = { eval: 'x', passed: true };
      const stamped = stampRow(row, { version: '4', scenarioHash: 'abc' });
      expect(stamped).toEqual({
        eval: 'x',
        passed: true,
        version: '4',
        scenario_hash: 'abc',
        node_version: process.version,
      });
      expect(row).toEqual({ eval: 'x', passed: true });
    });

    it('leaves out what the scenario does not have', () => {
      expect(stampRow({ eval: 'x' }, {})).toEqual({ eval: 'x', node_version: process.version });
    });
  });

  describe('scenario parsing', () => {
    it('carries the hash of the file it parsed, the one preflight files its record under', () => {
      expect(HASH).toMatch(/^[0-9a-f]{16}$/);
      expect(findScenario(NAME, tempDir).scenarioHash).toBe(HASH);
    });
  });

  describe('an A/B run', () => {
    it('stamps every row of both arms, with exactly the documented keys', () => {
      runAb();
      const rows = [
        ...loadResults(`${NAME}-baseline`, tempDir),
        ...loadResults(`${NAME}-treatment`, tempDir),
      ];
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
        expect(row.scenario_hash).toBe(HASH);
        expect(row.node_version).toBe(process.version);
        expect(row.version).toBe('2');
      }
    });

    it('stamps infra-error rows too', () => {
      killEveryTrial();
      runAb(1);
      const [row] = loadResults(`${NAME}-baseline`, tempDir);
      expect(row.infraError).toBe(true);
      expect(row).toMatchObject({ scenario_hash: HASH, node_version: process.version });
    });

    it('takes the hash once per run, from the scenario as parsed, not per trial', () => {
      const scenario = findScenario(NAME, tempDir);
      // The file moves on after the run parsed it; no trial re-reads it.
      fs.appendFileSync(scenarioFile, '\nEdited after the run parsed it.\n');
      runSkillEval(scenario, 2, { projectRoot: tempDir, runId: RUN_ID });
      const rows = [
        ...loadResults(`${NAME}-baseline`, tempDir),
        ...loadResults(`${NAME}-treatment`, tempDir),
      ];
      expect(rows.map((r) => r.scenario_hash)).toEqual([HASH, HASH, HASH, HASH]);
      expect(findScenario(NAME, tempDir).scenarioHash).not.toBe(HASH);
    });
  });

  describe('a preflight', () => {
    it('writes rows of the same shape as an A/B row, carrying the hash of its record', () => {
      const record = runPreflightTrials();
      const rows = loadResults(`${NAME}-preflight`, tempDir);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
        expect(row.scenario_hash).toBe(record.scenario_hash);
        expect(row.node_version).toBe(process.version);
      }
      expect(record.scenario_hash).toBe(HASH);
    });

    it('writes a record with exactly the documented keys, on disk as returned', () => {
      const record = runPreflightTrials();
      expect(Object.keys(record).sort()).toEqual(RECORD_KEYS);
      expect(record).toMatchObject({
        scenario_hash: HASH,
        scenario_name: NAME,
        model: 'opus',
        max_turns: null,
        plugin_dir: false,
        effort: null,
        trial_timeout_ms: 900000,
        node_version: process.version,
        pass_rate: 1,
        k: 3,
        verdict: 'BLOCK',
      });
      const file = path.join(tempDir, PREFLIGHT_DIR, preflightFilename(HASH, 'opus'));
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(record);
    });

    it('an errored preflight records the same keys plus the error count', () => {
      killEveryTrial();
      const record = runPreflightTrials();
      expect(Object.keys(record).sort()).toEqual([...RECORD_KEYS, 'errored'].sort());
      expect(record).toMatchObject({ pass_rate: null, errored: 3, verdict: 'BLOCK' });
      expect(record.node_version).toBe(process.version);
    });

    it('keeps the Node version out of the record file name', () => {
      runPreflightTrials({ maxTurns: 10, effort: 'high' });
      expect(fs.readdirSync(path.join(tempDir, PREFLIGHT_DIR))).toEqual([
        `${HASH}-opus-t10-ehigh.json`,
      ]);
    });
  });

  describe('neither is a pooling condition', () => {
    it('a PASS recorded under another Node version still unlocks the A/B', () => {
      const file = path.join(tempDir, PREFLIGHT_DIR, preflightFilename(HASH, 'opus'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const record = { scenario_hash: HASH, verdict: 'PASS', node_version: 'v18.0.0' };
      fs.writeFileSync(file, JSON.stringify(record));
      expect(checkPreflightGate(NAME, tempDir, { model: 'opus' })).toBeNull();
      // And one written before the field existed.
      fs.writeFileSync(file, JSON.stringify({ scenario_hash: HASH, verdict: 'PASS' }));
      expect(checkPreflightGate(NAME, tempDir, { model: 'opus' })).toBeNull();
    });

    it('rows from two Node versions, or with and without the fields, stay one pool', () => {
      expect(CONDITION_FIELDS).not.toContain('node_version');
      expect(CONDITION_FIELDS).not.toContain('scenario_hash');
      const row = (extra) => ({
        passed: true,
        score: 1,
        timestamp: '2026-10-12T11:00:00.000Z',
        model: 'opus',
        effort: 'high',
        trialTimeoutMs: 900000,
        maxTurns: null,
        pluginDir: false,
        isolation: 'isolated',
        ...extra,
      });
      const mixed = [
        row({}), // 6.4.0 row: neither field
        row({ node_version: 'v22.0.0', scenario_hash: 'aaaa' }),
        row({ node_version: 'v24.13.1', scenario_hash: 'bbbb' }),
      ];
      const pools = splitPools(mixed);
      expect(pools.current).toHaveLength(3);
      expect(pools.others).toEqual([]);
      const paired = pairArms(mixed, [row({ node_version: 'v26.0.0', scenario_hash: 'cccc' })]);
      expect(paired.baseline).toHaveLength(3);
      expect(paired.treatment).toHaveLength(1);
      expect(paired.unpaired).toEqual([]);
    });
  });

  describe('the raw benchmark export', () => {
    it('carries both fields, null for a row that predates them', () => {
      runAb(1);
      const oldRow = {
        ...loadResults(`${NAME}-baseline`, tempDir)[0],
        runId: '20261001-000000-old1',
      };
      delete oldRow.scenario_hash;
      delete oldRow.node_version;
      const oldDir = path.join(tempDir, RESULTS_DIR, NAME, oldRow.runId);
      fs.mkdirSync(oldDir, { recursive: true });
      fs.writeFileSync(path.join(oldDir, 'baseline.jsonl'), `${JSON.stringify(oldRow)}\n`);

      const raw = rawRowsForScenario(findScenario(NAME, tempDir), tempDir);
      const stamps = raw.map((r) => [r.run_id, r.scenario_hash, r.node_version]);
      expect(stamps).toEqual(
        expect.arrayContaining([
          ['20261001-000000-old1', null, null],
          [RUN_ID, HASH, process.version],
        ]),
      );
    });
  });
});
