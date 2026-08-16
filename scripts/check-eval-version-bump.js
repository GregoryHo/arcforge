#!/usr/bin/env node

/**
 * check-eval-version-bump.js — warn (never block) when a PR edits an eval
 * scenario's rubric without bumping its `## Version`.
 *
 * `loadResults` pools trials by version. Edit what the grader is asked to judge
 * (assertions, grader, grader config) while the version stays put, and the next
 * run's trials land in the same pool as trials graded under the old rubric —
 * a silently mixed pool that no downstream number reveals.
 *
 * A hard gate would false-fire: reflowing a sentence in `## Grader Config`, or
 * fixing an assertion's typo, changes the section text without changing what is
 * measured. So this emits a non-blocking GitHub annotation — a visible nudge a
 * reviewer can judge — the same tier as check-skill-eval-annotation.js.
 *
 * Prompt sections (`## Scenario`, `## Context`, `## Setup`) invalidate a pool
 * for the same reason; they are deliberately out of scope here.
 *
 * Always exits 0. Diffs BASE_REF...HEAD (BASE_REF defaults to origin/main).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseScenario } = require('./lib/eval-scenario');

const repoRoot = path.resolve(__dirname, '..');

const SCENARIO_FILE_RE = /^evals\/scenarios\/[^/]+\.md$/;

// The rubric: what the grader is told to judge. Read through the canonical
// parser rather than raw section text, so a whitespace-only edit is not drift.
const RUBRIC_FIELDS = [
  ['assertions', (s) => JSON.stringify(s.assertions || [])],
  ['grader', (s) => s.grader || ''],
  ['grader config', (s) => s.graderConfig || ''],
];

/**
 * Pure core: which rubric fields moved between two parsed scenarios, and did
 * `## Version` move with them?
 * @param {Object} before - Scenario parsed from the base revision
 * @param {Object} after - Scenario parsed from HEAD
 * @returns {{ changed: string[], versionBumped: boolean }}
 */
function rubricDrift(before, after) {
  const changed = RUBRIC_FIELDS.filter(([, read]) => read(before) !== read(after)).map(([n]) => n);
  return { changed, versionBumped: (before.version || '') !== (after.version || '') };
}

/** Parse scenario markdown text through the canonical parser. */
function parseScenarioText(text, basename) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-version-bump-'));
  try {
    const file = path.join(dir, basename);
    fs.writeFileSync(file, text);
    return parseScenario(file, repoRoot);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const base = process.env.BASE_REF || 'origin/main';
  // stderr is piped (not inherited): `git show` on a file that is new in this
  // diff throws an expected fatal that the catch below turns into a skip, and
  // letting it print would bury real failures in noise.
  const git = (args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

  let changed = [];
  try {
    changed = git(['diff', '--name-only', `${base}...HEAD`])
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    console.log(
      `Skipping eval version-bump check: could not diff against ${base} (${err.message})`,
    );
    process.exit(0);
  }

  let flagged = 0;
  for (const file of changed.filter((f) => SCENARIO_FILE_RE.test(f))) {
    // A scenario added or deleted in this diff has no pool to mix.
    if (!fs.existsSync(path.join(repoRoot, file))) continue;
    let baseText;
    try {
      baseText = git(['show', `${base}:${file}`]);
    } catch {
      continue;
    }

    const basename = path.basename(file);
    const drift = rubricDrift(
      parseScenarioText(baseText, basename),
      parseScenario(path.join(repoRoot, file), repoRoot),
    );
    if (drift.changed.length === 0 || drift.versionBumped) continue;

    flagged += 1;
    console.log(
      `::warning file=${file}::Rubric changed (${drift.changed.join(', ')}) without a ` +
        `## Version bump — new trials will pool with results graded under the old rubric. ` +
        `Bump ## Version, or ignore if the edit does not change what is measured.`,
    );
  }
  if (flagged === 0) {
    console.log('No eval scenario changed its rubric without a version bump.');
  }
  process.exit(0);
}

module.exports = { rubricDrift, parseScenarioText, SCENARIO_FILE_RE };

if (require.main === module) {
  main();
}
