const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  HARD_LIMIT,
  ALLOWLIST,
  countLines,
  findViolations,
  listScannedFiles,
} = require('../../scripts/check-file-size');
const { REPO_ROOT } = require('./skill-tree');

describe('check:file-size', () => {
  describe('findViolations', () => {
    const allow = { 'scripts/lib/big.js': 900 };

    it('passes files at or under the hard limit', () => {
      expect(findViolations({ 'scripts/a.js': HARD_LIMIT }, {})).toEqual([]);
    });

    it('fails an unlisted file over the hard limit', () => {
      const v = findViolations({ 'tests/scripts/a.test.js': HARD_LIMIT + 1 }, {});
      expect(v).toHaveLength(1);
      expect(v[0]).toMatch(/tests\/scripts\/a\.test\.js has 701 lines.*700-line hard limit/);
    });

    it('lets a listed file shrink', () => {
      expect(findViolations({ 'scripts/lib/big.js': 850 }, allow)).toEqual([]);
    });

    it('fails a listed file that grew past its recorded count', () => {
      const v = findViolations({ 'scripts/lib/big.js': 901 }, allow);
      expect(v).toHaveLength(1);
      expect(v[0]).toMatch(/scripts\/lib\/big\.js has 901 lines.*allowlisted at 900/);
    });

    it('fails a listed file that is back under the limit, so the entry is removed', () => {
      const v = findViolations({ 'scripts/lib/big.js': 700 }, allow);
      expect(v).toHaveLength(1);
      expect(v[0]).toMatch(/remove it from the allowlist/);
    });

    it('fails a listed file that no longer exists', () => {
      const v = findViolations({}, allow);
      expect(v).toHaveLength(1);
      expect(v[0]).toMatch(/scripts\/lib\/big\.js is allowlisted but does not exist/);
    });
  });

  describe('scan', () => {
    let tmp;
    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'file-size-'));
    });
    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    function write(rel, content) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }

    it('scans .js under scripts/, hooks/, tests/ and skips everything else', () => {
      write('scripts/lib/a.js', 'x\n');
      write('hooks/h/b.js', 'x\n');
      write('tests/scripts/c.test.js', 'x\n');
      write('skills/core/s/d.js', 'x\n');
      write('scripts/e.md', 'x\n');
      write('tests/node_modules/f.js', 'x\n');
      write('tests/.cache/g.js', 'x\n');
      expect(listScannedFiles(tmp).sort()).toEqual([
        'hooks/h/b.js',
        'scripts/lib/a.js',
        'tests/scripts/c.test.js',
      ]);
    });

    it('counts lines as wc -l does', () => {
      write('scripts/a.js', 'one\ntwo\n');
      write('scripts/b.js', 'one\ntwo');
      expect(countLines(path.join(tmp, 'scripts/a.js'))).toBe(2);
      expect(countLines(path.join(tmp, 'scripts/b.js'))).toBe(1);
    });
  });

  it('the repo passes against its own allowlist', () => {
    const counts = Object.fromEntries(
      listScannedFiles(REPO_ROOT).map((rel) => [rel, countLines(path.join(REPO_ROOT, rel))]),
    );
    expect(findViolations(counts, ALLOWLIST)).toEqual([]);
  });
});
