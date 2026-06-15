#!/usr/bin/env node
/**
 * WT-6 acceptance: the non-epic Option 1 of arc-finishing, executed verbatim
 * from INSIDE a generic worktree, completes end-to-end with exit 0.
 *
 * The seam this guards (S1-2): git 2.52 exits 128 on `git checkout <base-branch>`
 * inside a linked worktree, so the merged skill's non-epic path must locate the
 * base via `worktree list --json` (kind:base) and merge into it with
 * `git -C <base> merge <feature-branch>` — never checking out the base in the
 * worktree. This test runs that sequence and asserts:
 *   1. `git checkout <base-branch>` inside the worktree fails (exit != 0).
 *   2. The base-checkout merge sequence succeeds (exit 0) and lands the commit.
 *
 * Isolation: a fresh temp git repo + a temp HOME so the generic worktree lands
 * under <tmpHOME>/.arcforge/worktrees/ and never touches the real home dir.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

console.log('Testing arc-finishing non-epic Option 1 from a generic worktree...\n');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-wt6-'));
const fakeHome = path.join(tmpRoot, 'home');
const repo = path.join(tmpRoot, 'repo');
fs.mkdirSync(fakeHome, { recursive: true });
fs.mkdirSync(repo, { recursive: true });

const env = { ...process.env, HOME: fakeHome, CLAUDE_PROJECT_DIR: repo };

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: 'pipe' });
}

function cli(args, cwd) {
  return execFileSync('node', [CLI_PATH, ...args], { cwd, encoding: 'utf8', env, stdio: 'pipe' });
}

try {
  // --- base repo with one commit on its default branch ---
  git(['init', '-q'], repo);
  git(['config', 'user.email', 'test@test.com'], repo);
  git(['config', 'user.name', 'Test'], repo);
  git(['commit', '-q', '--allow-empty', '-m', 'init'], repo);
  const baseBranch = git(['branch', '--show-current'], repo).trim();

  // --- generic worktree on a feature branch, via the CLI (the blessed path) ---
  const addJson = JSON.parse(
    cli(['worktree', 'add', 'wt6feat', '--branch', 'wt6feat', '--json'], repo),
  );
  const wtPath = addJson.path;
  assert.ok(wtPath && fs.existsSync(wtPath), 'generic worktree should be created at the JSON path');
  // The generic worktree must carry NO epic marker (it routes to the non-epic path).
  assert.ok(
    !fs.existsSync(path.join(wtPath, '.arcforge-epic')),
    'a generic worktree must not have an .arcforge-epic marker',
  );

  // --- feature commit inside the worktree ---
  fs.writeFileSync(path.join(wtPath, 'feature.txt'), 'feature work\n');
  git(['add', 'feature.txt'], wtPath);
  git(['commit', '-q', '-m', 'feat: add feature.txt'], wtPath);

  // === Non-epic Option 1, run verbatim FROM INSIDE the worktree ===
  const featureBranch = git(['branch', '--show-current'], wtPath).trim();
  assert.strictEqual(featureBranch, 'wt6feat');

  // Locate the base via `worktree list --json` (kind:base) — the skill's method.
  const listed = JSON.parse(cli(['worktree', 'list', '--json'], wtPath));
  const baseEntry = listed.worktrees.find((w) => w.kind === 'base') || listed.worktrees[0];
  const baseWorktree = baseEntry.path;
  assert.ok(baseWorktree, 'base worktree path must resolve from worktree list --json');

  // Red-flag command: `git checkout <base-branch>` inside a linked worktree must fail.
  let checkoutExit = 0;
  try {
    git(['checkout', baseBranch], wtPath);
  } catch (err) {
    checkoutExit = err.status || 1;
  }
  assert.notStrictEqual(
    checkoutExit,
    0,
    '`git checkout <base-branch>` inside a linked worktree must fail (the seam the skill avoids)',
  );

  // Correct path: merge into the base from the base checkout via `git -C`.
  // (No `git -C <base> pull` here — the test repo has no remote; the skill's
  //  pull is a no-op equivalent for a local-only repo.)
  git(['-C', baseWorktree, 'merge', featureBranch], wtPath);

  // The merge landed in the base.
  assert.ok(
    fs.existsSync(path.join(baseWorktree, 'feature.txt')),
    'the feature commit must land in the base checkout after the merge',
  );

  // Cleanup ordering: remove the generic worktree (cd-to-base first), THEN the branch.
  cli(['worktree', 'remove', 'wt6feat'], baseWorktree);
  assert.ok(!fs.existsSync(wtPath), 'the generic worktree directory must be removed');
  git(['-C', baseWorktree, 'branch', '-d', featureBranch], baseWorktree);

  console.log('  PASS: non-epic Option 1 completed end-to-end (exit 0); base checkout rejected.\n');
  console.log('All tests passed!');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
