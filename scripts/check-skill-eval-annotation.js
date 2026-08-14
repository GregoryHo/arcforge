#!/usr/bin/env node

/**
 * check-skill-eval-annotation.js — warn (never block) when a PR changes a skill's
 * spec without a matching eval/benchmark update.
 *
 * A behavioral skill edit is supposed to ship with eval evidence. A hard CI gate
 * can't enforce that precisely: there is no mechanical way to tell a behavioral
 * SKILL.md edit from a typo/metadata edit (the carve-out), so a blocking check
 * would false-fire. This emits a non-blocking GitHub annotation instead — a
 * visible nudge a reviewer can judge.
 *
 * Always exits 0. Diffs BASE_REF...HEAD (BASE_REF defaults to origin/main).
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

/** Does the changed-file set carry eval evidence for skill `name`? */
function hasEvidence(name, changed) {
  const underscore = name.replace(/-/g, '_');
  return changed.some(
    (f) =>
      f === `tests/skills/test_skill_${underscore}.py` ||
      (f.startsWith('evals/results/') && f.includes(name)) ||
      f.startsWith('evals/benchmarks/'),
  );
}

// Shipped skills live one bucket deep: `skills/<bucket>/<name>/SKILL.md` (P6.5).
// The bucket is matched generically rather than pinned to `core`, so a skill
// edited while parked in another bucket still gets the nudge.
const SKILL_SPEC_RE = /^skills\/[^/]+\/([^/]+)\/SKILL\.md$/;

/**
 * Pure core: from a changed-file list, return the skill names whose SKILL.md
 * changed without any matching eval/test/benchmark evidence in the same diff.
 * @param {string[]} changed
 * @returns {string[]}
 */
function skillsNeedingEval(changed) {
  const names = changed
    .map((f) => f.match(SKILL_SPEC_RE))
    .filter(Boolean)
    .map((m) => m[1]);
  return names.filter((name) => !hasEvidence(name, changed));
}

function main() {
  const base = process.env.BASE_REF || 'origin/main';
  let changed = [];
  try {
    changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    console.log(`Skipping skill-eval annotation: could not diff against ${base} (${err.message})`);
    process.exit(0);
  }

  const flagged = skillsNeedingEval(changed);
  // Annotate the file that actually changed — the bucket segment is part of the
  // path GitHub needs to anchor the warning.
  const specPath = (name) =>
    changed.find((f) => (f.match(SKILL_SPEC_RE) || [])[1] === name) || `${name}/SKILL.md`;
  for (const name of flagged) {
    console.log(
      `::warning file=${specPath(name)}::SKILL.md changed without a matching eval/benchmark ` +
        `update. If this was a behavioral change, re-run the eval before shipping. ` +
        `Ignore for typo/metadata-only edits.`,
    );
  }
  if (flagged.length === 0) {
    console.log('No skill spec changed without matching eval evidence.');
  }
  process.exit(0);
}

module.exports = { skillsNeedingEval, hasEvidence };

if (require.main === module) {
  main();
}
