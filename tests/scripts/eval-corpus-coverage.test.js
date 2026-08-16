/**
 * eval-corpus-coverage.test.js — the eval corpus is a contract with skills/core/.
 *
 * P7 pruned the corpus from 51 scenarios to the 19 that measure a v6 skill
 * (18 kept + the new writing-skills scenario). Nothing mechanical stopped
 * that prune from silently orphaning a core
 * skill, and nothing stopped the pre-P7 corpus from hiding scenarios in a
 * subdirectory the lister never reads. These assertions close both holes.
 */

const fs = require('node:fs');
const path = require('node:path');

const { listScenarios, parseScenario, SCENARIOS_DIR } = require('../../scripts/lib/eval-scenario');

const repoRoot = path.resolve(__dirname, '../..');
const scenariosDir = path.join(repoRoot, SCENARIOS_DIR);
const coreDir = path.join(repoRoot, 'skills', 'core');

const coreSkills = fs
  .readdirSync(coreDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const scenarioFiles = listScenarios(repoRoot);
const targets = scenarioFiles.map((f) => parseScenario(f, repoRoot).target || '');

describe('eval corpus coverage', () => {
  it('gives every shipped core skill at least one scenario Target', () => {
    // A scenario covers a skill when its `## Target` names that skill's spec.
    // The trailing `/SKILL.md` keeps the match collision-free between names
    // that prefix one another. `compacting`'s Target is `sessions`, so it
    // counts as sessions coverage — the scenario name is not the contract.
    const uncovered = coreSkills.filter(
      (name) => !targets.some((t) => t.includes(`skills/core/${name}/SKILL.md`)),
    );
    expect(uncovered).toEqual([]);
  });

  it('keeps a sanity floor of live scenarios so a broken lister cannot pass quietly', () => {
    // Without a floor, a glob that resolves to nothing makes every
    // per-skill assertion above vacuously true.
    expect(scenarioFiles.length).toBeGreaterThan(10);
  });

  it('has no subdirectory under evals/scenarios/', () => {
    // listScenarios() is a non-recursive readdir filtered to `.md`, so any
    // directory here is a scan blind spot: files inside it are never linted,
    // never targeted, never run. `retired/` sat there unscanned until P7.
    // Read the directory raw — going through listScenarios would filter the
    // very entries this assertion exists to catch.
    const subdirs = fs
      .readdirSync(scenariosDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(subdirs).toEqual([]);
  });
});
