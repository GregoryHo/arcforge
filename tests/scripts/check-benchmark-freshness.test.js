/**
 * check-benchmark-freshness.test.js — the freshness gate must compare against
 * the previous RELEASE tag, not whatever tag `git describe` finds first.
 *
 * Regression (P8): with gate-p7 nearest to HEAD, the unmatched describe walk
 * resolved prevTag to a same-day process tag — a base with zero eval-surface
 * delta, so the check passed vacuously and the benchmark timestamp was never
 * compared. The `--match 'v[0-9]*'` pin restores the v5.0.0-style base.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isBenchmarkStale } = require('../../scripts/check-benchmark-freshness');

describe('check-benchmark-freshness', () => {
  describe('previousTag release-tag pinning (via git --match semantics)', () => {
    let tmpRepo;

    beforeEach(() => {
      tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-'));
      const git = (args) =>
        execFileSync('git', args, { cwd: tmpRepo, encoding: 'utf8', stdio: 'pipe' });
      git(['init', '-q', '-b', 'main']);
      git([
        '-c',
        'user.email=t@t',
        '-c',
        'user.name=t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'a',
      ]);
      git(['tag', 'v1.0.0']);
      git([
        '-c',
        'user.email=t@t',
        '-c',
        'user.name=t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'b',
      ]);
      git(['tag', 'gate-p9']);
      git(['tag', 'rc-v2.0.0']);
      git([
        '-c',
        'user.email=t@t',
        '-c',
        'user.name=t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'c',
      ]);
    });

    afterEach(() => {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    it('the pinned describe walk skips process and rc tags and lands on the release tag', () => {
      const out = execFileSync(
        'git',
        ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'],
        { cwd: tmpRepo, encoding: 'utf8', stdio: 'pipe' },
      ).trim();
      expect(out).toBe('v1.0.0');
    });

    it('the unpinned walk would have resolved a non-release tag (the defect being guarded)', () => {
      const out = execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD'], {
        cwd: tmpRepo,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
      expect(out).not.toBe('v1.0.0');
    });

    it('the shipped script pins its describe walk to release tags', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'scripts', 'check-benchmark-freshness.js'),
        'utf8',
      );
      expect(src).toMatch(/--match',\s*'v\[0-9\]\*'/);
    });
  });

  describe('isBenchmarkStale', () => {
    it('passes a benchmark generated after the previous release when surface changed', () => {
      const r = isBenchmarkStale('2026-08-15T08:12:15Z', '2026-07-27T09:15:11+08:00', true);
      expect(r.stale).toBe(false);
    });

    it('flags a benchmark older than the previous release when surface changed', () => {
      const r = isBenchmarkStale('2026-07-01T00:00:00Z', '2026-07-27T09:15:11+08:00', true);
      expect(r.stale).toBe(true);
    });
  });
});
