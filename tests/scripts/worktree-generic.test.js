/**
 * worktree-generic.js — generic (non-epic) worktree engine (WT-2).
 *
 * Isolation: HOME is overridden to a temp dir per test (auto-diary.test.js
 * pattern) so canonical worktree paths derive under the test HOME, never
 * the real ~/.arcforge/worktrees. Two overrides are needed: process.env.HOME
 * covers CLI subprocesses, while an os.homedir() spy covers in-process
 * derivations (Jest sandboxes process.env, so mutating it does not reach
 * the real environment that os.homedir() reads). Repo and HOME dirs are
 * realpath'd so getWorktreePath derivation and git's printed paths live in
 * the same (symlink-free) space on macOS.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  addGenericWorktree,
  listWorktrees,
  removeGenericWorktree,
} = require('../../scripts/lib/worktree-generic');
const { Coordinator } = require('../../scripts/lib/coordinator');
const {
  getWorktreeRoot,
  getWorktreePath,
  parseWorktreePath,
} = require('../../scripts/lib/worktree-paths');
const { runGit, setupRepo, DEFAULT_SPEC_ID } = require('./coordinator-test-helpers');

const CLI = path.resolve(__dirname, '../../scripts/cli.js');

function runCli(args, cwd) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || err.message, exitCode: err.status };
  }
}

describe('worktree-generic', () => {
  const originalHome = process.env.HOME;
  let testHome;
  let root;

  beforeEach(() => {
    const realTmp = fs.realpathSync(os.tmpdir());
    testHome = fs.mkdtempSync(path.join(realTmp, 'wtg-home-'));
    process.env.HOME = testHome;
    jest.spyOn(os, 'homedir').mockReturnValue(testHome);
    root = fs.realpathSync(setupRepo({ prefix: 'wtg-repo-' }));
    runGit(['add', '.'], root);
    runGit(['commit', '-q', '-m', 'chore: add dag'], root);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(testHome, { recursive: true, force: true });
  });

  describe('add', () => {
    test('CLI round-trip: exit 0, JSON path under getWorktreeRoot(), parseable, branch checked out', () => {
      const result = runCli(['worktree', 'add', 't1', '--json'], root);
      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(parsed.path.startsWith(getWorktreeRoot() + path.sep)).toBe(true);
      expect(parsed.path).toBe(getWorktreePath(root, null, 't1'));

      const roundTrip = parseWorktreePath(parsed.path);
      expect(roundTrip).not.toBeNull();
      expect(roundTrip.epic).toBe('t1');

      expect(parsed.branch).toBe('t1');
      expect(parsed.branch_created).toBe(true);
      expect(runGit(['branch', '--show-current'], parsed.path).trim()).toBe('t1');
    });

    test('existing branch is checked out, not recreated', () => {
      runGit(['branch', 't2'], root);
      const res = addGenericWorktree({ projectRoot: root, name: 't2' });
      expect(res.branch_created).toBe(false);
      expect(runGit(['branch', '--show-current'], res.path).trim()).toBe('t2');
    });

    test('missing branch is created from --from ref', () => {
      runGit(['checkout', '-q', '-b', 'feature-base'], root);
      fs.writeFileSync(path.join(root, 'extra.txt'), 'extra\n');
      runGit(['add', 'extra.txt'], root);
      runGit(['commit', '-q', '-m', 'feat: extra'], root);
      runGit(['checkout', '-q', 'main'], root);

      const res = addGenericWorktree({ projectRoot: root, name: 't3', from: 'feature-base' });
      expect(res.branch_created).toBe(true);
      expect(fs.existsSync(path.join(res.path, 'extra.txt'))).toBe(true);
    });
  });

  describe('list', () => {
    test('annotates all four kinds: base, epic, generic, external', () => {
      new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
      addGenericWorktree({ projectRoot: root, name: 'experiment' });
      const extPath = path.join(testHome, 'external-wt');
      runGit(['worktree', 'add', '-b', 'ext-branch', extPath], root);

      const result = listWorktrees({ projectRoot: root });
      expect(result.count).toBe(4);

      const byKind = {};
      for (const wt of result.worktrees) byKind[wt.kind] = wt;
      expect(Object.keys(byKind).sort()).toEqual(['base', 'epic', 'external', 'generic']);

      expect(byKind.base.path).toBe(root);

      expect(byKind.epic.path).toBe(getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a'));
      expect(byKind.epic.epic).toBe('epic-a');
      expect(byKind.epic.spec_id).toBe(DEFAULT_SPEC_ID);

      expect(byKind.generic.path).toBe(getWorktreePath(root, null, 'experiment'));
      expect(byKind.generic.branch).toBe('experiment');
      expect(byKind.generic.epic).toBeUndefined();

      expect(byKind.external.path).toBe(extPath);
    });
  });

  describe('remove', () => {
    test('epic-marker worktree: CLI exits 1 with an arcforge cleanup redirect, tree untouched', () => {
      new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
      const epicPath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');

      const result = runCli(['worktree', 'remove', epicPath], root);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('arcforge cleanup');
      expect(fs.existsSync(epicPath)).toBe(true);
    });

    test('dirty worktree without --force: CLI exits 1, tree untouched', () => {
      const res = addGenericWorktree({ projectRoot: root, name: 't4' });
      fs.writeFileSync(path.join(res.path, 'dirty.txt'), 'uncommitted\n');

      const result = runCli(['worktree', 'remove', 't4'], root);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--force');
      expect(fs.existsSync(res.path)).toBe(true);
    });

    test('dirty worktree with --force: removed and pruned from git', () => {
      const res = addGenericWorktree({ projectRoot: root, name: 't5' });
      fs.writeFileSync(path.join(res.path, 'dirty.txt'), 'uncommitted\n');

      const out = removeGenericWorktree({ projectRoot: root, target: 't5', force: true });
      expect(out.removed).toBe(true);
      expect(fs.existsSync(res.path)).toBe(false);
      expect(runGit(['worktree', 'list', '--porcelain'], root)).not.toContain(res.path);
    });

    test('clean worktree removes without --force, prunes, and keeps the branch', () => {
      const res = addGenericWorktree({ projectRoot: root, name: 't6' });

      const out = removeGenericWorktree({ projectRoot: root, target: 't6' });
      expect(out.path).toBe(res.path);
      expect(fs.existsSync(res.path)).toBe(false);
      expect(runGit(['worktree', 'list', '--porcelain'], root)).not.toContain(res.path);
      expect(runGit(['branch', '--list', 't6'], root).trim()).not.toBe('');
    });

    test('refuses non-managed (external) paths', () => {
      const extPath = path.join(testHome, 'external-wt');
      runGit(['worktree', 'add', '-b', 'ext-branch', extPath], root);

      expect(() => removeGenericWorktree({ projectRoot: root, target: extPath })).toThrow(
        /Not an arcforge-managed worktree/,
      );
      expect(fs.existsSync(extPath)).toBe(true);
    });
  });
});
