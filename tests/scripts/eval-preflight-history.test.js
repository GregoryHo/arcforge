/**
 * Tests for eval-preflight.js: a rerun under the same key moves the record it
 * replaces into evals/preflight/history/, and never loses the new one.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  computeScenarioHash,
  preflightFilename,
  runPreflight,
  checkPreflightGate,
  PREFLIGHT_DIR,
  PREFLIGHT_HISTORY_DIR,
} = require('../../scripts/lib/eval-preflight');

const SCENARIO_CONTENT =
  '# Eval: test-scenario\n\n## Scope\nskill\n\n## Assertions\n- [ ] does something\n';

function writeScenario(dir, name, content) {
  const scenariosDir = path.join(dir, 'evals', 'scenarios');
  fs.mkdirSync(scenariosDir, { recursive: true });
  fs.writeFileSync(path.join(scenariosDir, `${name}.md`), content);
}

function writePreflightFile(dir, hash, data) {
  const preflightDir = path.join(dir, PREFLIGHT_DIR);
  fs.mkdirSync(preflightDir, { recursive: true });
  fs.writeFileSync(path.join(preflightDir, preflightFilename(hash)), JSON.stringify(data));
}

describe('a rerun keeps the record it replaces in history/', () => {
  let tempDir;
  let hash;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-preflight-history-'));
    writeScenario(tempDir, 'test-scenario', SCENARIO_CONTENT);
    hash = computeScenarioHash(SCENARIO_CONTENT);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const historyDir = () => path.join(tempDir, PREFLIGHT_DIR, PREFLIGHT_HISTORY_DIR);

  test('a second write moves the first record into history under its timestamp', () => {
    const preflightAt = (passed) =>
      runPreflight('test-scenario', tempDir, {
        runTrial: () => ({ passed, score: passed ? 1 : 0 }),
        gradeResult: (r) => r,
      });
    const first = preflightAt(true);
    expect(first.verdict).toBe('BLOCK');
    const second = preflightAt(false);
    expect(second.verdict).toBe('PASS');

    const base = preflightFilename(hash).replace(/\.json$/, '');
    const archived = `${base}.${first.timestamp.replace(/[:.]/g, '-')}.json`;
    expect(fs.readdirSync(historyDir())).toEqual([archived]);
    const kept = JSON.parse(fs.readFileSync(path.join(historyDir(), archived), 'utf8'));
    expect(kept.verdict).toBe('BLOCK');
    const current = path.join(tempDir, PREFLIGHT_DIR, preflightFilename(hash));
    expect(JSON.parse(fs.readFileSync(current, 'utf8')).verdict).toBe('PASS');
  });

  test('a record without a timestamp is archived under its mtime', () => {
    writePreflightFile(tempDir, hash, { verdict: 'BLOCK' });
    const current = path.join(tempDir, PREFLIGHT_DIR, preflightFilename(hash));
    const mtime = new Date('2026-01-02T03:04:05.678Z');
    fs.utimesSync(current, mtime, mtime);
    runPreflight('test-scenario', tempDir, {
      runTrial: () => ({ passed: false, score: 0 }),
      gradeResult: (r) => r,
    });
    const base = preflightFilename(hash).replace(/\.json$/, '');
    expect(fs.readdirSync(historyDir())).toEqual([`${base}.2026-01-02T03-04-05-678Z.json`]);
  });

  const preflightAgain = () =>
    runPreflight('test-scenario', tempDir, {
      runTrial: () => ({ passed: false, score: 0 }),
      gradeResult: (r) => r,
    });
  const currentRecord = () =>
    JSON.parse(fs.readFileSync(path.join(tempDir, PREFLIGHT_DIR, preflightFilename(hash)), 'utf8'));

  test('a hand-edited timestamp with "/" is archived under a sanitized name', () => {
    writePreflightFile(tempDir, hash, { verdict: 'BLOCK', timestamp: '../x/2026 01:02.z' });
    const outcome = preflightAgain();
    expect(currentRecord().timestamp).toBe(outcome.timestamp);
    const base = preflightFilename(hash).replace(/\.json$/, '');
    expect(fs.readdirSync(historyDir())).toEqual([`${base}.---x-2026-01-02-z.json`]);
  });

  test('an archive name already taken gets a suffix, and nothing is overwritten', () => {
    const stamp = '2026-01-01T00:00:00.000Z';
    const base = preflightFilename(hash).replace(/\.json$/, '');
    const taken = `${base}.2026-01-01T00-00-00-000Z.json`;
    fs.mkdirSync(historyDir(), { recursive: true });
    fs.writeFileSync(path.join(historyDir(), taken), JSON.stringify({ verdict: 'PASS' }));
    writePreflightFile(tempDir, hash, { verdict: 'BLOCK', timestamp: stamp });
    preflightAgain();
    expect(fs.readdirSync(historyDir()).sort()).toEqual(
      [taken, `${base}.2026-01-01T00-00-00-000Z-1.json`].sort(),
    );
    const read = (f) => JSON.parse(fs.readFileSync(path.join(historyDir(), f), 'utf8')).verdict;
    expect(read(taken)).toBe('PASS');
    expect(read(`${base}.2026-01-01T00-00-00-000Z-1.json`)).toBe('BLOCK');
  });

  test('an archive failure is reported and the new record is still written', () => {
    writePreflightFile(tempDir, hash, { verdict: 'BLOCK', timestamp: '2026-01-01T00:00:00Z' });
    fs.writeFileSync(historyDir(), 'not a directory');
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const outcome = preflightAgain();
      expect(currentRecord().timestamp).toBe(outcome.timestamp);
      expect(stderr).toHaveBeenCalledWith(
        expect.stringMatching(/^preflight: could not archive .*; overwriting$/),
      );
    } finally {
      stderr.mockRestore();
    }
  });

  test('the gate reads the current record, not one in history', () => {
    writePreflightFile(tempDir, hash, { verdict: 'PASS' });
    fs.mkdirSync(historyDir(), { recursive: true });
    const base = preflightFilename(hash).replace(/\.json$/, '');
    fs.writeFileSync(
      path.join(historyDir(), `${base}.2026-01-01T00-00-00-000Z.json`),
      JSON.stringify({ verdict: 'BLOCK', reason: 'old' }),
    );
    expect(checkPreflightGate('test-scenario', tempDir)).toBeNull();
  });

  test('the missing-preflight message lists no history entry', () => {
    writePreflightFile(tempDir, hash, { verdict: 'PASS', max_turns: 10 });
    fs.mkdirSync(historyDir(), { recursive: true });
    const base = preflightFilename(hash).replace(/\.json$/, '');
    fs.writeFileSync(
      path.join(historyDir(), `${base}-t5.2026-01-01T00-00-00-000Z.json`),
      JSON.stringify({ verdict: 'PASS', max_turns: 5 }),
    );
    const message = checkPreflightGate('test-scenario', tempDir, { conditions: { maxTurns: 20 } });
    expect(message).toMatch(/recorded under: [^\n]*10/);
    expect(message).not.toMatch(/history/);
    expect(message).not.toMatch(/recorded under: [^\n]*\b5\b/);
  });
});
