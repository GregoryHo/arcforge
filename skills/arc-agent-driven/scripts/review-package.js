#!/usr/bin/env node
// skills/arc-agent-driven/scripts/review-package.js
//
// Build a review package — commit list + `git diff --stat` + `git diff -U10` —
// for the BASE..HEAD range, written to a single file the reviewer reads in ONE
// call (no re-running git, no crawling the codebase).
//
// Using the per-task BASE recorded BEFORE the implementer ran (never HEAD~1)
// keeps a multi-commit task intact — HEAD~1 would truncate the package to the
// last commit only.
//
// Usage: review-package.js <BASE> <HEAD> [OUTFILE]
//   env fallback: SDD_BASE, SDD_HEAD, SDD_OUT
// Output file (default): <repo>/.arcforge/sdd/review-<base7>..<head7>.md
// Prints the written package path to stdout (the controller passes it as
// {DIFF_FILE} to the reviewer).

const fs = require('node:fs');
const { runGit, resolveCommit, resolveOutPath } = require('./sdd-workspace');

/**
 * Build the review package and write it to disk.
 * @param {object} opts
 * @param {string} opts.base - BASE ref (required; no HEAD~1 default).
 * @param {string} opts.head - HEAD ref (required).
 * @param {string} [opts.out] - explicit output file path.
 * @param {string} [opts.cwd] - working directory (defaults to process.cwd()).
 * @returns {{ outPath: string, workspaceDir: string, commitCount: number }}
 */
function buildReviewPackage({ base, head, out, cwd = process.cwd() }) {
  if (!base || !base.trim()) {
    throw new Error(
      'BASE is required — never default to HEAD~1 (it truncates a multi-commit task ' +
        'to the last commit). Record the pre-implementer BASE and pass it explicitly.',
    );
  }
  if (!head || !head.trim()) {
    throw new Error('HEAD is required.');
  }

  const baseSha = resolveCommit(base, cwd, 'BASE');
  const headSha = resolveCommit(head, cwd, 'HEAD');
  const range = `${baseSha}..${headSha}`;

  const commits = runGit(['log', '--oneline', range], cwd);
  const stat = runGit(['diff', '--stat', range], cwd);
  const diff = runGit(['diff', '-U10', range], cwd);
  const commitCount = commits ? commits.split('\n').length : 0;

  // Filename is built from the RESOLVED hex SHAs (not the raw refs), so a ref
  // like `feature/x` can never inject a path separator, and the name is stable.
  const { outPath, workspaceDir } = resolveOutPath({
    out,
    cwd,
    defaultName: `review-${baseSha.slice(0, 7)}..${headSha.slice(0, 7)}.md`,
  });

  const body = [
    `# Review package: ${base}..${head}`,
    '',
    'Read this file once. Do not re-run git or crawl the codebase — everything under review is below.',
    '',
    '## Commits',
    '',
    commits || '(none)',
    '',
    '## Files changed',
    '',
    stat || '(none)',
    '',
    '## Diff',
    '',
    diff || '(empty)',
    '',
  ].join('\n');

  fs.writeFileSync(outPath, body);
  return { outPath, workspaceDir, commitCount };
}

function main(argv) {
  const base = argv[0] || process.env.SDD_BASE;
  const head = argv[1] || process.env.SDD_HEAD;
  const out = argv[2] || process.env.SDD_OUT;

  const { outPath, commitCount } = buildReviewPackage({ base, head, out });
  // Commit count → stderr (diagnostic); stdout stays a bare, parseable path.
  process.stderr.write(`review package: ${commitCount} commit(s)\n`);
  process.stdout.write(`${outPath}\n`);
}

module.exports = { buildReviewPackage };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}
