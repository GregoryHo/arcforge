#!/usr/bin/env node

/**
 * check-eval-targets.js — dangling `## Target` linter for eval scenarios.
 *
 * Every scenario in evals/scenarios/ may declare a `## Target` naming the
 * skill/template/hook/script it exercises. Renames and merges can leave a
 * Target pointing at a path that no longer exists, and nothing else fails
 * statically on it — only `eval ab` errors at runtime when someone finally
 * runs the scenario. This check resolves every path-shaped Target token on
 * disk and fails the build if any dangles.
 *
 * Prose targets and bare skill names carry no filesystem promise, so only
 * tokens under a known component tree (skills/ templates/ hooks/ scripts/)
 * are checked.
 *
 * CLI tier: prints a human-readable report and exits 0/1.
 */

const fs = require('node:fs');
const path = require('node:path');

const { listScenarios, parseScenario } = require('./lib/eval-scenario');

const repoRoot = path.resolve(__dirname, '..');

const PATH_PREFIXES = /^(skills|templates|hooks|scripts)\//;

/** Extract the path-shaped tokens from a `## Target` value. */
function pathTargets(target) {
  return target
    .split(/[\s,]+/)
    .map((t) =>
      t
        .replace(/^[`([]+/, '')
        .replace(/[`).,;\]>]+$/, '')
        .trim(),
    )
    .filter((t) => PATH_PREFIXES.test(t));
}

function main() {
  const offenders = [];
  for (const file of listScenarios(repoRoot)) {
    const scenario = parseScenario(file, repoRoot);
    if (!scenario.target) continue;
    for (const target of pathTargets(scenario.target)) {
      if (!fs.existsSync(path.join(repoRoot, target))) {
        offenders.push({ scenario: path.basename(file), target });
      }
    }
  }

  console.log('eval-target linter — scanned evals/scenarios/\n');

  if (offenders.length > 0) {
    console.error(`Dangling eval targets (${offenders.length}):`);
    for (const o of offenders) {
      console.error(`  ${o.scenario} -> ${o.target}`);
    }
    process.exit(1);
  }

  console.log('No dangling eval targets.');
  process.exit(0);
}

main();
