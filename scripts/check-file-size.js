#!/usr/bin/env node

/**
 * check-file-size.js — the 700-line hard limit from
 * `.claude/rules/coding-standards.md`, made mechanical (#174).
 *
 * Scans every `.js` file under scripts/, hooks/, and tests/. A file over the
 * limit fails unless ALLOWLIST grandfathers it. An allowlisted file must sit
 * exactly at its recorded count: growing past it fails, and so does shrinking
 * below it until the count is lowered to match, so the baseline moves down with
 * the file and never leaves headroom to regrow into. An entry whose file is gone
 * or back under the limit fails too, so it gets removed.
 *
 * CLI tier: prints a human-readable report and exits 0/1.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const HARD_LIMIT = 700;
const SCAN_DIRS = ['scripts', 'hooks', 'tests'];

// Files over the limit when the check landed, at their line count then. Lower
// a count when a file shrinks; delete the entry when it drops to the limit.
// Adding an entry is a maintainer decision, not a way to land a big file.
const ALLOWLIST = {
  'scripts/lib/learning-curator/activate.js': 846,
  'scripts/lib/utils.js': 778,
  'hooks/__tests__/observe.test.js': 1246,
  'tests/scripts/eval.test.js': 3385,
  'tests/scripts/check-product.test.js': 2433,
  'tests/scripts/learning.test.js': 1856,
  'tests/scripts/learning-dashboard.test.js': 1770,
  'tests/scripts/learning-curator-materialize.test.js': 1186,
  'tests/scripts/learning-curator-proposal-ingestor.test.js': 1111,
  'tests/scripts/learning-curator-activate.test.js': 1109,
  'tests/scripts/eval-dashboard.test.js': 938,
  'tests/scripts/eval-integration.test.js': 900,
  'tests/scripts/eval-stats.test.js': 835,
};

/** Line count as `wc -l` reports it: the number of newlines. */
function countLines(absPath) {
  const content = fs.readFileSync(absPath, 'utf8');
  let n = 0;
  for (const ch of content) if (ch === '\n') n++;
  return n;
}

/** Repo-relative paths of every scanned `.js` file under `root`. */
function listScannedFiles(root) {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(path.join(root, dir));
  return files;
}

/**
 * @param {Object<string, number>} counts - repo-relative path → line count
 * @param {Object<string, number>} allowlist - repo-relative path → recorded count
 * @returns {string[]} one message per violation
 */
function findViolations(counts, allowlist) {
  const violations = [];
  for (const [file, lines] of Object.entries(counts)) {
    const recorded = allowlist[file];
    if (recorded === undefined) {
      if (lines > HARD_LIMIT) {
        violations.push(`${file} has ${lines} lines, over the ${HARD_LIMIT}-line hard limit`);
      }
    } else if (lines > recorded) {
      violations.push(
        `${file} has ${lines} lines, grew past its allowlist entry, allowlisted at ${recorded}`,
      );
    } else if (lines <= HARD_LIMIT) {
      violations.push(
        `${file} has ${lines} lines, within the ${HARD_LIMIT}-line limit — remove it from the allowlist`,
      );
    } else if (lines < recorded) {
      // The ratchet is exact: a stale-high baseline would be headroom to regrow into.
      violations.push(
        `${file} has ${lines} lines — lower its allowlist entry from ${recorded} to ${lines}`,
      );
    }
  }
  for (const file of Object.keys(allowlist)) {
    if (!(file in counts)) violations.push(`${file} is allowlisted but does not exist`);
  }
  return violations;
}

function main() {
  const counts = Object.fromEntries(
    listScannedFiles(repoRoot).map((rel) => [rel, countLines(path.join(repoRoot, rel))]),
  );
  const violations = findViolations(counts, ALLOWLIST);

  console.log(
    `file-size check — scanned ${Object.keys(counts).length} .js files under ${SCAN_DIRS.join(', ')}\n`,
  );
  if (violations.length > 0) {
    console.error(`File-size violations (${violations.length}):`);
    for (const v of violations) console.error(`  ${v}`);
    console.error('\nSplit the file (see .claude/rules/coding-standards.md), or shrink it back.');
    process.exit(1);
  }
  console.log(
    `No file over ${HARD_LIMIT} lines outside the allowlist; every allowlisted file sits at its recorded count.`,
  );
  process.exit(0);
}

if (require.main === module) main();

module.exports = { HARD_LIMIT, ALLOWLIST, countLines, findViolations, listScannedFiles };
