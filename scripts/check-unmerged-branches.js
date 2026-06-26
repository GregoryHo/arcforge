#!/usr/bin/env node

/**
 * check-unmerged-branches.js — fail fast on undisposed local branches.
 *
 * Before cutting a release, every local branch that still carries commits not
 * on `main` should be accounted for: either its work already landed (the PR is
 * MERGED, or the commits are reachable from `origin/main`), or it has an OPEN PR
 * tracking that work. A branch with commits and no disposition is a loose end —
 * unmerged work the releaser has forgotten about, or a stale branch that should
 * be deleted. This guard surfaces those before they silently miss the release.
 *
 * Classification per branch:
 *   MERGED-PR — a PR for this branch has state MERGED (catches squash merges,
 *               where the branch commits are NOT ancestors of main and so are
 *               invisible to `git branch --no-merged`).
 *   OPEN-PR   — no merged PR, but an OPEN PR tracks the branch (dispositioned).
 *   LANDED    — no merged/open PR, but the branch tip is reachable from
 *               origin/main (a real or fast-forward merge landed it remotely).
 *   NO-PR     — commits exist, nothing above applies. Release blocker: the
 *               branch must be landed or deleted before release.
 *
 * Exits 0 when every branch is dispositioned (MERGED-PR / OPEN-PR / LANDED).
 * Exits 1 when any NO-PR branch with commits exists.
 *
 * Degraded mode: if `gh` is absent, the script cannot read PR state, so it
 * cannot distinguish a squash-merged branch from an abandoned one. It prints
 * the unmerged branch list as a warning and exits 0 (list-only) rather than
 * blocking the release on information it cannot obtain.
 *
 * NOT A CI GATE. A fresh CI runner checks out a single ref, so
 * `git branch --no-merged main` sees no local branches and this check is
 * vacuously green — it would never catch anything. This guard is meaningful
 * ONLY in a releaser's working clone, which carries the accumulated local
 * branches. Invoke it manually as a release pre-flight step; do not wire it
 * into `npm test` or any CI workflow.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

/**
 * Run a command with array args (never shell string interpolation, per
 * .claude/rules/security.md). Returns trimmed stdout, or null on nonzero exit.
 */
function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** True if `gh` is installed and runnable. */
function hasGh() {
  return run('gh', ['--version']) !== null;
}

/**
 * Local branch names that still carry commits not on main, excluding the
 * current branch (the `* ` line — it is the release branch by construction and
 * legitimately has no PR yet) and any detached-HEAD line.
 */
function unmergedBranches() {
  const out = run('git', ['branch', '--no-merged', 'main']);
  if (!out) {
    return [];
  }
  const names = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('*')) {
      continue;
    }
    const name = line.replace(/^[+\s]+/, '').trim();
    if (!name || name.startsWith('(')) {
      continue;
    }
    names.push(name);
  }
  return names;
}

/**
 * True if the branch tip is reachable from origin/main — a real or
 * fast-forward merge landed it remotely. Skips silently if origin/main is
 * absent (offline clone with no fetched remote).
 */
function landedOnOrigin(branch) {
  const refExists = run('git', ['rev-parse', '--verify', '--quiet', 'origin/main']);
  if (refExists === null) {
    return false;
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', branch, 'origin/main'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify one branch into MERGED-PR / OPEN-PR / LANDED / NO-PR using PR state
 * first (the only signal that survives a squash merge), then origin/main
 * reachability as a fallback.
 */
function classify(branch) {
  const args = ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state'];
  const json = run('gh', args);
  let prs = [];
  if (json) {
    try {
      prs = JSON.parse(json);
    } catch {
      prs = [];
    }
  }
  if (prs.some((p) => p.state === 'MERGED')) {
    return 'MERGED-PR';
  }
  if (prs.some((p) => p.state === 'OPEN')) {
    return 'OPEN-PR';
  }
  if (landedOnOrigin(branch)) {
    return 'LANDED';
  }
  return 'NO-PR';
}

function main() {
  const branches = unmergedBranches();
  if (branches.length === 0) {
    console.log('No local branches carry unmerged commits. Nothing to disposition.');
    process.exit(0);
  }

  if (!hasGh()) {
    console.warn('Warning: `gh` not found — cannot read PR state to disposition branches.');
    console.warn('Listing unmerged local branches for manual review (list-only, not blocking):');
    for (const b of branches) {
      console.warn(`  - ${b}`);
    }
    console.warn('Install `gh` (GitHub CLI) for an authoritative MERGED/OPEN/NO-PR ruling.');
    process.exit(0);
  }

  // Refresh origin/main so the LANDED fallback does not false-flag a branch
  // merged on the remote. A failed fetch (offline) is non-fatal — warn and
  // fall back to whatever origin/main the clone already has.
  if (run('git', ['fetch', 'origin', 'main']) === null) {
    console.warn('Warning: `git fetch origin main` failed — origin/main may be stale.');
  }

  const rows = branches.map((branch) => ({ branch, status: classify(branch) }));
  const width = Math.max(...rows.map((r) => r.branch.length));
  const blockers = [];

  console.log('Unmerged local branch disposition\n');
  for (const { branch, status } of rows) {
    const ok = status !== 'NO-PR';
    const mark = ok ? 'OK ' : 'XX ';
    console.log(`  ${mark} ${branch.padEnd(width)}  ${status}`);
    if (!ok) {
      blockers.push(branch);
    }
  }
  console.log('');

  if (blockers.length > 0) {
    console.error(`Undisposed branches with commits (${blockers.length}):`);
    for (const b of blockers) {
      console.error(`  - ${b} — land it (open + merge a PR) or delete it before releasing`);
    }
    process.exit(1);
  }

  console.log('All unmerged branches are dispositioned (merged, open PR, or landed on origin).');
  process.exit(0);
}

main();
