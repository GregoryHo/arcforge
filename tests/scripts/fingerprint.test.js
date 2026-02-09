// tests/scripts/fingerprint.test.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  STOP_WORDS,
  buildTriggerFingerprint,
  jaccardSimilarity,
  findSimilarInstincts
} = require('../../scripts/lib/fingerprint');

describe('fingerprint', () => {
  describe('buildTriggerFingerprint', () => {
    it('tokenizes and removes stop words', () => {
      const fp = buildTriggerFingerprint('when modifying code files');
      expect(fp).toEqual(new Set(['code', 'files', 'modifying']));
    });

    it('normalizes case to lowercase', () => {
      const fp = buildTriggerFingerprint('Always Use TypeScript');
      for (const token of fp) {
        expect(token).toBe(token.toLowerCase());
      }
      expect(fp.has('always')).toBe(true);
      expect(fp.has('use')).toBe(true);
      expect(fp.has('typescript')).toBe(true);
    });

    it('splits on punctuation and special characters', () => {
      const fp = buildTriggerFingerprint('error-handling; retry logic');
      expect(fp).toEqual(new Set(['error', 'handling', 'logic', 'retry']));
    });

    it('removes common stop words', () => {
      const fp = buildTriggerFingerprint('the code is in a file and it was broken');
      expect(fp.has('the')).toBe(false);
      expect(fp.has('is')).toBe(false);
      expect(fp.has('in')).toBe(false);
      expect(fp.has('a')).toBe(false);
      expect(fp.has('and')).toBe(false);
      expect(fp.has('it')).toBe(false);
      expect(fp.has('was')).toBe(false);
      // Non-stop words should remain
      expect(fp.has('code')).toBe(true);
      expect(fp.has('file')).toBe(true);
      expect(fp.has('broken')).toBe(true);
    });

    it('returns empty Set for empty string', () => {
      const fp = buildTriggerFingerprint('');
      expect(fp.size).toBe(0);
    });

    it('returns empty Set for null', () => {
      expect(buildTriggerFingerprint(null).size).toBe(0);
    });

    it('returns empty Set for undefined', () => {
      expect(buildTriggerFingerprint(undefined).size).toBe(0);
    });

    it('handles a single meaningful word', () => {
      const fp = buildTriggerFingerprint('debugging');
      expect(fp.size).toBe(1);
      expect(fp.has('debugging')).toBe(true);
    });
  });

  describe('jaccardSimilarity', () => {
    it('returns 1.0 for identical sets', () => {
      const s = new Set(['a', 'b', 'c']);
      expect(jaccardSimilarity(s, s)).toBe(1.0);
    });

    it('returns 0.0 for disjoint sets', () => {
      const a = new Set(['a', 'b']);
      const b = new Set(['c', 'd']);
      expect(jaccardSimilarity(a, b)).toBe(0.0);
    });

    it('returns correct value for partial overlap', () => {
      const a = new Set(['a', 'b', 'c']);
      const b = new Set(['b', 'c', 'd']);
      // intersection = {b, c} = 2, union = {a, b, c, d} = 4
      expect(jaccardSimilarity(a, b)).toBe(0.5);
    });

    it('returns 0.0 when one set is empty', () => {
      const empty = new Set();
      const full = new Set(['a', 'b']);
      expect(jaccardSimilarity(empty, full)).toBe(0.0);
      expect(jaccardSimilarity(full, empty)).toBe(0.0);
    });

    it('returns 1.0 when both sets are empty', () => {
      expect(jaccardSimilarity(new Set(), new Set())).toBe(1.0);
    });
  });

  describe('findSimilarInstincts', () => {
    let testDir;

    beforeEach(() => {
      testDir = path.join(os.tmpdir(), 'fingerprint-test-' + Date.now());
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    function writeInstinct(filename, trigger, extras = {}) {
      const fmLines = [
        '---',
        `id: ${filename.replace('.md', '')}`,
        `trigger: "${trigger}"`,
        'confidence: 0.50'
      ];
      for (const [k, v] of Object.entries(extras)) {
        fmLines.push(`${k}: ${v}`);
      }
      fmLines.push('---', '', '# Instinct', '');
      fs.writeFileSync(path.join(testDir, filename), fmLines.join('\n'), 'utf-8');
    }

    it('finds instincts with similar triggers above threshold', () => {
      writeInstinct('grep-first.md', 'always grep codebase before editing source files');
      writeInstinct('test-first.md', 'always run tests before pushing changes');
      writeInstinct('unrelated.md', 'prefer dark theme terminal colors');

      // Query similar to grep-first
      const results = findSimilarInstincts(
        'grep the codebase before editing files',
        testDir,
        0.3
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      const grepMatch = results.find(r => r.file === 'grep-first.md');
      expect(grepMatch).toBeDefined();
      expect(grepMatch.similarity).toBeGreaterThan(0.3);
    });

    it('returns empty array for non-existent directory', () => {
      const results = findSimilarInstincts(
        'some trigger text here now',
        '/nonexistent/path/xyz'
      );
      expect(results).toEqual([]);
    });

    it('respects threshold — high threshold filters more', () => {
      writeInstinct('partial-match.md', 'review code changes before committing them');
      writeInstinct('weak-match.md', 'check linting output after saving files');

      const lowThreshold = findSimilarInstincts(
        'review all code changes before committing anything',
        testDir,
        0.2
      );

      const highThreshold = findSimilarInstincts(
        'review all code changes before committing anything',
        testDir,
        0.9
      );

      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it('returns empty when fingerprint has fewer than 3 tokens', () => {
      writeInstinct('some-instinct.md', 'always grep codebase before editing files');

      // "use tools" -> after stop-word removal only 'tools' remains (< 3)
      const results = findSimilarInstincts('use tools', testDir);
      expect(results).toEqual([]);
    });

    it('sorts results by similarity descending', () => {
      writeInstinct('exact.md', 'always grep codebase before editing source files');
      writeInstinct('partial.md', 'grep codebase for patterns regularly');
      writeInstinct('weak.md', 'editing source files requires careful review');

      const results = findSimilarInstincts(
        'always grep codebase before editing source files',
        testDir,
        0.1
      );

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });
  });
});
