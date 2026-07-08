#!/usr/bin/env node
// skills/arc-agent-driven/scripts/sdd-workspace.js
//
// Shared workspace + git helpers for the arc-agent-driven per-task handoff
// scripts (review-package.js, task-brief.js). Single source of truth for the
// workspace location so the two scripts cannot drift to different directories.
//
// The workspace lives in the working tree at .arcforge/sdd/ (NOT under .git/,
// which Claude Code treats as a protected path and denies agent writes to). A
// self-ignoring .gitignore keeps handoff artifacts out of `git status` and out
// of accidental commits without touching any tracked file.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// A multi-commit `-U10` diff can far exceed execFileSync's 1 MB default
// maxBuffer; raise it so large review packages don't throw ENOBUFS.
const GIT_MAX_BUFFER = 100 * 1024 * 1024;

/**
 * Run a git command with array args (never a shell string) per security.md.
 * @param {string[]} args - git arguments.
 * @param {string} cwd - working directory for git.
 * @returns {string} trimmed stdout.
 */
function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: GIT_MAX_BUFFER,
  }).trimEnd();
}

/**
 * Resolve the git repository root containing cwd.
 * @param {string} cwd
 * @returns {string} absolute repo root.
 */
function repoRoot(cwd) {
  return runGit(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * Resolve a ref to its full commit SHA, throwing with context if invalid.
 * @param {string} ref
 * @param {string} cwd
 * @param {string} label - human label for error messages (e.g. 'BASE').
 * @returns {string} 40-char hex SHA.
 */
function resolveCommit(ref, cwd, label) {
  try {
    return runGit(['rev-parse', '--verify', `${ref}^{commit}`], cwd);
  } catch {
    throw new Error(`${label} is not a valid commit: ${ref}`);
  }
}

/**
 * Ensure the .arcforge/sdd/ workspace exists under the repo root and is
 * self-ignoring. Returns the absolute workspace directory.
 * @param {string} cwd
 * @returns {string} absolute workspace dir.
 */
function ensureWorkspace(cwd) {
  const dir = path.join(repoRoot(cwd), '.arcforge', 'sdd');
  fs.mkdirSync(dir, { recursive: true });
  // '*' ignores every file in this dir (including this .gitignore itself), so
  // handoff artifacts never enter git status or a commit.
  fs.writeFileSync(path.join(dir, '.gitignore'), '*\n');
  return dir;
}

module.exports = { runGit, repoRoot, resolveCommit, ensureWorkspace, GIT_MAX_BUFFER };
