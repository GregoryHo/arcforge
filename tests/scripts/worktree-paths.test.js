const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const {
  getWorktreeRoot,
  hashRepoPath,
  getWorktreePath,
  parseWorktreePath,
} = require('../../scripts/lib/worktree-paths');

describe('getWorktreeRoot', () => {
  it('returns ~/.arcforge-worktrees', () => {
    expect(getWorktreeRoot()).toBe(path.join(os.homedir(), '.arcforge-worktrees'));
  });

  it('honors a custom home directory override', () => {
    expect(getWorktreeRoot('/custom/home')).toBe(path.join('/custom/home', '.arcforge-worktrees'));
  });
});

describe('hashRepoPath', () => {
  it('returns first 6 chars of sha256 of the absolute path', () => {
    const absPath = '/Users/foo/projects/bar';
    const expected = crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 6);
    expect(hashRepoPath(absPath)).toBe(expected);
  });

  it('is deterministic for the same input', () => {
    const abs = '/tmp/example';
    expect(hashRepoPath(abs)).toBe(hashRepoPath(abs));
  });

  it('differs for different paths', () => {
    expect(hashRepoPath('/tmp/a')).not.toBe(hashRepoPath('/tmp/b'));
  });

  it('normalizes trailing slashes so /foo and /foo/ produce the same hash', () => {
    expect(hashRepoPath('/foo/bar')).toBe(hashRepoPath('/foo/bar/'));
  });

  it('handles CJK characters in paths', () => {
    const hash = hashRepoPath('/Users/foo/项目/bar');
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
  });

  it('handles paths with spaces', () => {
    const hash = hashRepoPath('/Users/foo/my project/bar');
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
  });

  it('requires an absolute path', () => {
    expect(() => hashRepoPath('relative/path')).toThrow(/absolute/i);
  });

  it('requires a string', () => {
    expect(() => hashRepoPath(null)).toThrow();
    expect(() => hashRepoPath(42)).toThrow();
  });
});

describe('getWorktreePath', () => {
  it('composes <root>/<name>-<hash>-<epic>', () => {
    const projectRoot = '/Users/foo/projects/bar';
    const result = getWorktreePath(projectRoot, 'epic-001');
    const hash = hashRepoPath(projectRoot);
    const expected = path.join(getWorktreeRoot(), `bar-${hash}-epic-001`);
    expect(result).toBe(expected);
  });

  it('uses the basename of the project root as the <name> segment', () => {
    const result = getWorktreePath('/Users/foo/projects/my-project', 'epic-42');
    expect(path.basename(result)).toMatch(/^my-project-[0-9a-f]{6}-epic-42$/);
  });

  it('strips a trailing slash from the project root before hashing', () => {
    const withSlash = getWorktreePath('/Users/foo/projects/bar/', 'epic-001');
    const withoutSlash = getWorktreePath('/Users/foo/projects/bar', 'epic-001');
    expect(withSlash).toBe(withoutSlash);
  });

  it('sanitizes project names containing spaces', () => {
    const result = getWorktreePath('/Users/foo/my project', 'epic-001');
    const base = path.basename(result);
    expect(base).not.toMatch(/ /);
    expect(base).toMatch(/^my-project-[0-9a-f]{6}-epic-001$/);
  });

  it('handles CJK project names', () => {
    const result = getWorktreePath('/Users/foo/项目', 'epic-001');
    const base = path.basename(result);
    expect(base).toMatch(/-[0-9a-f]{6}-epic-001$/);
  });

  it('honors a custom home directory override', () => {
    const result = getWorktreePath('/Users/foo/projects/bar', 'epic-001', '/custom/home');
    expect(result.startsWith('/custom/home/.arcforge-worktrees/')).toBe(true);
  });

  it('rejects a missing epic id', () => {
    expect(() => getWorktreePath('/Users/foo/bar', '')).toThrow();
    expect(() => getWorktreePath('/Users/foo/bar', null)).toThrow();
  });

  it('rejects a relative project root', () => {
    expect(() => getWorktreePath('foo/bar', 'epic-001')).toThrow(/absolute/i);
  });
});

describe('parseWorktreePath', () => {
  it('extracts project, hash, and epic components', () => {
    const projectRoot = '/Users/foo/projects/bar';
    const wt = getWorktreePath(projectRoot, 'epic-001');
    const parsed = parseWorktreePath(wt);
    expect(parsed.project).toBe('bar');
    expect(parsed.hash).toBe(hashRepoPath(projectRoot));
    expect(parsed.epic).toBe('epic-001');
  });

  it('handles epic ids containing hyphens', () => {
    const projectRoot = '/Users/foo/projects/bar';
    const wt = getWorktreePath(projectRoot, 'epic-001-auth-flow');
    const parsed = parseWorktreePath(wt);
    expect(parsed.epic).toBe('epic-001-auth-flow');
    expect(parsed.hash).toBe(hashRepoPath(projectRoot));
  });

  it('handles project names containing hyphens', () => {
    const projectRoot = '/Users/foo/projects/my-awesome-app';
    const wt = getWorktreePath(projectRoot, 'epic-001');
    const parsed = parseWorktreePath(wt);
    expect(parsed.project).toBe('my-awesome-app');
    expect(parsed.epic).toBe('epic-001');
  });

  it('accepts absolute path with trailing slash', () => {
    const projectRoot = '/Users/foo/projects/bar';
    const wt = `${getWorktreePath(projectRoot, 'epic-001')}/`;
    const parsed = parseWorktreePath(wt);
    expect(parsed.epic).toBe('epic-001');
  });

  it('returns null when path is not under the worktree root', () => {
    expect(parseWorktreePath('/some/unrelated/path')).toBeNull();
  });

  it('returns null when basename does not match the expected pattern', () => {
    const bad = path.join(getWorktreeRoot(), 'nope');
    expect(parseWorktreePath(bad)).toBeNull();
  });
});
