const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  compactTimestamp,
  listProjectObservationFiles,
  quarantineFile,
  parseArgs,
} = require('../../scripts/dev/quarantine-observations');

const SCRIPT = path.join(__dirname, '../../scripts/dev/quarantine-observations.js');

describe('quarantine-observations', () => {
  let testRoot;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-obs-test-'));
  });

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  function seed(project, content = '{"event":"tool_start"}\n') {
    const dir = path.join(testRoot, project);
    fs.mkdirSync(dir, { recursive: true });
    const obsPath = path.join(dir, 'observations.jsonl');
    fs.writeFileSync(obsPath, content);
    return obsPath;
  }

  describe('helpers', () => {
    it('compactTimestamp returns UTC compact form ending in Z', () => {
      const ts = compactTimestamp(new Date('2026-05-20T13:45:30.123Z'));
      expect(ts).toBe('20260520T134530Z');
    });

    it('parseArgs defaults to dry-run', () => {
      expect(parseArgs([])).toEqual({ apply: false, root: expect.any(String) });
    });

    it('parseArgs respects --apply and --root', () => {
      expect(parseArgs(['--apply', '--root', '/tmp/x'])).toEqual({
        apply: true,
        root: '/tmp/x',
      });
    });

    it('listProjectObservationFiles finds observations.jsonl per project', () => {
      seed('proj-a');
      seed('proj-b');
      fs.mkdirSync(path.join(testRoot, 'empty-dir'));
      const found = listProjectObservationFiles(testRoot);
      const names = found.map((f) => f.project).sort();
      expect(names).toEqual(['proj-a', 'proj-b']);
    });

    it('quarantineFile renames and chmods 600', () => {
      const obsPath = seed('proj-a');
      const ts = compactTimestamp();
      const target = quarantineFile(obsPath, ts);
      expect(fs.existsSync(obsPath)).toBe(false);
      expect(fs.existsSync(target)).toBe(true);
      const mode = fs.statSync(target).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('CLI', () => {
    it('dry-run mode prints plan and does not touch files', () => {
      const obsPath = seed('proj-a');
      const result = execFileSync('node', [SCRIPT, '--root', testRoot], {
        encoding: 'utf8',
      });
      expect(result).toMatch(/DRY-RUN/);
      expect(result).toMatch(/proj-a/);
      expect(result).toMatch(/Re-run with --apply/);
      expect(fs.existsSync(obsPath)).toBe(true);
    });

    it('--apply renames files with chmod 600', () => {
      seed('proj-a');
      seed('proj-b');
      const result = execFileSync('node', [SCRIPT, '--root', testRoot, '--apply'], {
        encoding: 'utf8',
      });
      expect(result).toMatch(/APPLY/);
      expect(result).toMatch(/Quarantined 2\/2 files/);

      const projA = fs.readdirSync(path.join(testRoot, 'proj-a'));
      expect(projA.length).toBe(1);
      expect(projA[0]).toMatch(/^observations\.jsonl\.quarantine\.\d{8}T\d{6}Z$/);

      const target = path.join(testRoot, 'proj-a', projA[0]);
      const mode = fs.statSync(target).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('no observations dir → friendly message, exit 0', () => {
      const missing = path.join(testRoot, 'does-not-exist');
      const result = execFileSync('node', [SCRIPT, '--root', missing], { encoding: 'utf8' });
      expect(result).toMatch(/No observations\.jsonl found/);
    });
  });
});
