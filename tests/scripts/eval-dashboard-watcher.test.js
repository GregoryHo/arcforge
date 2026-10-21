/**
 * eval-dashboard-watcher.test.js - the live view's file watcher broadcasts
 * result rows only. A run directory's raw/ (each trial's stream-json stdout)
 * and transcripts/ hold `.jsonl` files that are not rows; none reaches the SSE
 * stream, by either the recursive fs.watch path or the polling fallback.
 */

const fs = require('node:fs');
const path = require('node:path');

const { setupWatchers, sseClients } = require('../../scripts/lib/eval-dashboard/eval-dashboard');
const { RESULTS_DIR } = require('../../scripts/lib/eval');
const { makeTempDir } = require('./eval-dashboard-fixtures');

const ROW = { eval: 'scen-baseline', trial: 1, score: 1 };
const RAW = { type: 'assistant', message: { content: [] } };

describe('setupWatchers — result files only', () => {
  let tempDir;
  let resultsDir;
  let client;
  let watcher;

  beforeEach(() => {
    jest.useFakeTimers();
    tempDir = makeTempDir();
    resultsDir = path.join(tempDir, RESULTS_DIR);
    client = { write: jest.fn() };
    sseClients.add(client);
  });

  afterEach(() => {
    watcher?.close();
    sseClients.delete(client);
    jest.restoreAllMocks();
    jest.useRealTimers();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Write a run with one row, plus a raw and a transcript `.jsonl`; return the relative paths. */
  function writeRun(scenario = 'scen') {
    const runDir = path.join(resultsDir, scenario, '20261021-120000-ab12');
    fs.mkdirSync(path.join(runDir, 'raw'), { recursive: true });
    fs.mkdirSync(path.join(runDir, 'transcripts'), { recursive: true });
    const files = {
      row: path.join(runDir, 'baseline.jsonl'),
      raw: path.join(runDir, 'raw', 'baseline-trial-1.jsonl'),
      transcript: path.join(runDir, 'transcripts', 'stray.jsonl'),
    };
    fs.writeFileSync(files.row, `${JSON.stringify(ROW)}\n`);
    fs.writeFileSync(files.raw, `${JSON.stringify(RAW)}\n`);
    fs.writeFileSync(files.transcript, `${JSON.stringify(RAW)}\n`);
    return Object.values(files).map((f) => path.relative(resultsDir, f));
  }

  const broadcastRows = () =>
    client.write.mock.calls
      .map(([msg]) => msg)
      .filter((msg) => msg.startsWith('event: trial-complete'))
      .map((msg) => JSON.parse(msg.split('data: ')[1]));

  it('ignores raw/ and transcripts/ on the recursive fs.watch path', () => {
    fs.mkdirSync(resultsDir, { recursive: true });
    let onChange;
    jest.spyOn(fs, 'watch').mockImplementation((_dir, _opts, cb) => {
      onChange = cb;
      return { close() {} };
    });
    watcher = setupWatchers(tempDir);
    for (const rel of writeRun()) onChange('change', rel);
    jest.advanceTimersByTime(500);
    expect(broadcastRows()).toEqual([ROW]);
  });

  it('ignores raw/ and transcripts/ on the polling fallback', () => {
    fs.mkdirSync(resultsDir, { recursive: true });
    jest.spyOn(fs, 'watch').mockImplementation(() => {
      throw new Error('recursive option not supported on this platform');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    watcher = setupWatchers(tempDir);
    writeRun();
    jest.advanceTimersByTime(5000 + 500);
    expect(broadcastRows()).toEqual([ROW]);
  });

  it('still watches a scenario that is itself called raw', () => {
    fs.mkdirSync(resultsDir, { recursive: true });
    let onChange;
    jest.spyOn(fs, 'watch').mockImplementation((_dir, _opts, cb) => {
      onChange = cb;
      return { close() {} };
    });
    watcher = setupWatchers(tempDir);
    for (const rel of writeRun('raw')) onChange('change', rel);
    jest.advanceTimersByTime(500);
    expect(broadcastRows()).toEqual([ROW]);
  });
});
