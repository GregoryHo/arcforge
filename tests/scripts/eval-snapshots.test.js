/**
 * eval-snapshots.test.js - benchmark snapshot history (#242): a second
 * `eval report` on the same day keeps the first snapshot, and `eval history`
 * lists every date-stamped snapshot in the order it was generated.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { BENCHMARKS_DIR, SCENARIOS_DIR } = require('../../scripts/lib/eval');
const { generateBenchmark, listSnapshots } = require('../../scripts/lib/eval-benchmark');

const BENCHMARK_LIB = path.resolve(__dirname, '../../scripts/lib/eval-benchmark.js');
const { runEvalCommand } = require('../../scripts/cli/eval-command');

function writeSnapshot(dir, name, generated) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ generated, evals: { a: {} } }));
}

describe('benchmark snapshots', () => {
  let tempDir;
  let benchDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-snapshots-'));
    benchDir = path.join(tempDir, BENCHMARKS_DIR);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('a second report on the same day', () => {
    beforeEach(() => {
      const scenariosDir = path.join(tempDir, SCENARIOS_DIR);
      fs.mkdirSync(scenariosDir, { recursive: true });
      fs.writeFileSync(path.join(scenariosDir, 'snap.md'), '# Eval: snap\n\n## Scenario\nTest.\n');
      jest.useFakeTimers({ now: new Date('2026-10-02T09:00:00.000Z') });
      generateBenchmark(tempDir);
      jest.setSystemTime(new Date('2026-10-02T15:00:00.000Z'));
      generateBenchmark(tempDir);
    });

    it('keeps both aggregate snapshots', () => {
      const generated = ['2026-10-02.json', '2026-10-02-2.json'].map(
        (f) => JSON.parse(fs.readFileSync(path.join(benchDir, f), 'utf8')).generated,
      );
      expect(generated).toEqual(['2026-10-02T09:00:00.000Z', '2026-10-02T15:00:00.000Z']);
    });

    it('keeps both raw exports under the same names', () => {
      const generated = ['2026-10-02.json', '2026-10-02-2.json'].map(
        (f) => JSON.parse(fs.readFileSync(path.join(benchDir, 'raw', f), 'utf8')).generated,
      );
      expect(generated).toEqual(['2026-10-02T09:00:00.000Z', '2026-10-02T15:00:00.000Z']);
    });

    it('points latest.json at the newer report', () => {
      const latest = JSON.parse(fs.readFileSync(path.join(benchDir, 'latest.json'), 'utf8'));
      expect(latest.generated).toBe('2026-10-02T15:00:00.000Z');
    });
  });

  describe('reports that land together', () => {
    beforeEach(() => {
      const scenariosDir = path.join(tempDir, SCENARIOS_DIR);
      fs.mkdirSync(scenariosDir, { recursive: true });
      fs.writeFileSync(path.join(scenariosDir, 'snap.md'), '# Eval: snap\n\n## Scenario\nTest.\n');
    });

    const dated = (dir) => fs.readdirSync(dir).filter((f) => /^\d{4}-/.test(f));

    it('keeps every snapshot when four reports run at once', async () => {
      const script = `require(${JSON.stringify(BENCHMARK_LIB)}).generateBenchmark(process.argv[1])`;
      await Promise.all(
        [1, 2, 3, 4].map(() => promisify(execFile)(process.execPath, ['-e', script, tempDir])),
      );

      expect([dated(benchDir).length, dated(path.join(benchDir, 'raw')).length]).toEqual([4, 4]);
    });

    it('moves the aggregate and raw pair on together when only the raw name is taken', () => {
      jest.useFakeTimers({ now: new Date('2026-10-02T09:00:00.000Z') });
      writeSnapshot(path.join(benchDir, 'raw'), '2026-10-02.json', '2026-10-02T08:00:00.000Z');

      generateBenchmark(tempDir);

      expect(dated(benchDir)).toEqual(['2026-10-02-2.json']);
    });
  });

  describe('listSnapshots', () => {
    it('refuses a snapshot whose generated is not a timestamp with a zone', () => {
      writeSnapshot(benchDir, '2026-10-01.json', '2026-10-01 23:00:00');

      expect(() => listSnapshots(tempDir)).toThrow('2026-10-01.json');
    });

    it('refuses a snapshot whose evals is not an object of scenarios', () => {
      fs.mkdirSync(benchDir, { recursive: true });
      fs.writeFileSync(
        path.join(benchDir, '2026-10-01.json'),
        JSON.stringify({ generated: '2026-10-01T12:00:00.000Z', evals: [] }),
      );

      expect(() => listSnapshots(tempDir)).toThrow('2026-10-01.json');
    });

    it('orders by instant, not by the text of the timestamp', () => {
      writeSnapshot(benchDir, '2026-10-01.json', '2026-10-01T12:00:00.000Z');
      writeSnapshot(benchDir, '2026-10-01-tz.json', '2026-10-01T13:00:00+08:00');

      expect(listSnapshots(tempDir).map((s) => s.name)).toEqual(['2026-10-01-tz', '2026-10-01']);
    });

    it('breaks a tie between counters by number', () => {
      for (const n of ['10', '2']) {
        writeSnapshot(benchDir, `2026-10-02-${n}.json`, '2026-10-02T09:00:00.000Z');
      }

      expect(listSnapshots(tempDir).map((s) => s.name)).toEqual(['2026-10-02-2', '2026-10-02-10']);
    });
  });

  describe('eval history', () => {
    it('lists every date-stamped snapshot in the order it was generated', async () => {
      writeSnapshot(benchDir, '2026-10-02-2.json', '2026-10-02T15:00:00.000Z');
      writeSnapshot(benchDir, '2026-10-02.json', '2026-10-02T09:00:00.000Z');
      writeSnapshot(benchDir, '2026-10-01.json', '2026-10-01T09:13:37.259Z');
      writeSnapshot(benchDir, '2026-10-01-v6.1.1.json', '2026-10-01T01:16:02.561Z');
      writeSnapshot(benchDir, 'latest.json', '2026-10-02T15:00:00.000Z');
      writeSnapshot(path.join(benchDir, 'raw'), '2026-10-02.json', '2026-10-02T09:00:00.000Z');
      fs.writeFileSync(path.join(benchDir, 'README.md'), '# Eval Benchmarks\n');
      const logs = [];
      jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

      await runEvalCommand(
        { positional: ['history'], options: {}, flags: {} },
        { projectRoot: tempDir, asJson: false },
      );

      expect(logs).toEqual([
        '  2026-10-01-v6.1.1 — 1 evals',
        '  2026-10-01 — 1 evals',
        '  2026-10-02 — 1 evals',
        '  2026-10-02-2 — 1 evals',
      ]);
    });

    it('names a date-stamped file that is not a snapshot instead of listing it', async () => {
      fs.mkdirSync(benchDir, { recursive: true });
      fs.writeFileSync(path.join(benchDir, '2026-10-02-notes.json'), '{"rows": []}');

      await expect(
        runEvalCommand(
          { positional: ['history'], options: {}, flags: {} },
          { projectRoot: tempDir, asJson: false },
        ),
      ).rejects.toThrow('2026-10-02-notes.json');
    });
  });
});
