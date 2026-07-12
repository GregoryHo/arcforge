const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildReviewPackage } = require('../../skills/arc-agent-driven/scripts/review-package');
const { buildTaskBrief } = require('../../skills/arc-agent-driven/scripts/task-brief');

let repoDir;

function git(args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function commit(file, contents, message) {
  fs.writeFileSync(path.join(repoDir, file), contents);
  git(['add', file]);
  git(['commit', '-q', '-m', message]);
  return git(['rev-parse', 'HEAD']);
}

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-review-'));
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe('buildReviewPackage', () => {
  it('captures every commit in a multi-commit range (not HEAD~1-truncated)', () => {
    const base = commit('one.txt', 'one\n', 'add file one');
    commit('two.txt', 'two\n', 'add file two');
    const head = commit('three.txt', 'three\n', 'add file three');

    const { outPath, commitCount } = buildReviewPackage({ base, head, cwd: repoDir });
    const pkg = fs.readFileSync(outPath, 'utf8');

    // base..head spans TWO commits. A HEAD~1 base would capture only the last,
    // so the presence of BOTH subjects proves the package is not truncated.
    expect(commitCount).toBe(2);
    expect(pkg).toContain('add file two');
    expect(pkg).toContain('add file three');
    // The earlier commit's file must appear in the diff too — HEAD~1 would drop it.
    expect(pkg).toContain('two.txt');
  });

  it('writes the three required sections', () => {
    const base = commit('a.txt', 'a\n', 'first');
    const head = commit('b.txt', 'b\n', 'second');

    const { outPath } = buildReviewPackage({ base, head, cwd: repoDir });
    const pkg = fs.readFileSync(outPath, 'utf8');

    expect(pkg).toContain('## Commits');
    expect(pkg).toContain('## Files changed');
    expect(pkg).toContain('## Diff');
  });

  it('names the package file by the resolved short SHA range', () => {
    const base = commit('a.txt', 'a\n', 'first');
    const head = commit('b.txt', 'b\n', 'second');

    const { outPath } = buildReviewPackage({ base, head, cwd: repoDir });
    expect(path.basename(outPath)).toBe(`review-${base.slice(0, 7)}..${head.slice(0, 7)}.md`);
  });

  it('creates a self-ignoring workspace so packages are never committed', () => {
    const base = commit('a.txt', 'a\n', 'first');
    const head = commit('b.txt', 'b\n', 'second');

    const { workspaceDir } = buildReviewPackage({ base, head, cwd: repoDir });
    const gitignore = fs.readFileSync(path.join(workspaceDir, '.gitignore'), 'utf8');
    expect(gitignore.trim()).toBe('*');

    // git status must not surface the workspace as an untracked path.
    const status = git(['status', '--porcelain']);
    expect(status).not.toContain('.arcforge');
  });

  it('rejects a missing BASE (no HEAD~1 default)', () => {
    const head = commit('a.txt', 'a\n', 'first');
    expect(() => buildReviewPackage({ base: '', head, cwd: repoDir })).toThrow(/HEAD~1/);
  });

  it('throws with context on an invalid BASE ref', () => {
    const head = commit('a.txt', 'a\n', 'first');
    expect(() => buildReviewPackage({ base: 'nope', head, cwd: repoDir })).toThrow(/BASE/);
  });
});

describe('buildTaskBrief', () => {
  it('writes task text, acceptance, and base SHA into the workspace', () => {
    const base = commit('a.txt', 'a\n', 'first');

    const { outPath } = buildTaskBrief({
      task: 'Implement the sync command',
      acceptance: 'Given X, when Y, then Z',
      base,
      number: '3',
      cwd: repoDir,
    });
    const brief = fs.readFileSync(outPath, 'utf8');

    expect(path.basename(outPath)).toBe('task-3-brief.md');
    expect(brief).toContain('Implement the sync command');
    expect(brief).toContain('Given X, when Y, then Z');
    expect(brief).toContain(base);
  });

  it('requires task text and base', () => {
    expect(() => buildTaskBrief({ task: '', base: 'abc', cwd: repoDir })).toThrow(/task/);
    expect(() => buildTaskBrief({ task: 'do it', base: '', cwd: repoDir })).toThrow(/base/);
  });
});
