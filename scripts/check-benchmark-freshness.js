#!/usr/bin/env node

/**
 * check-benchmark-freshness.js — fail a release if its eval benchmark is stale.
 *
 * arc-releasing's Iron Law: any release that touched eval-backed surface must
 * regenerate a fresh benchmark before tagging. `release.yml` already enforces
 * version-sync and tag-match, but nothing checked benchmark freshness — it was a
 * hand-run step in the skill. This wires it.
 *
 * The check is deterministic: `evals/benchmarks/latest.json` carries a `generated`
 * ISO timestamp. If the surface that the benchmark measures changed since the
 * previous release tag, the benchmark must have been regenerated AFTER that tag.
 *
 * Scoped to avoid false-failing a doc-only release: if no eval-backed file changed
 * between the previous tag and HEAD, the check passes regardless of benchmark age.
 * First release (no previous tag) passes — there's nothing to compare against.
 *
 * Contributor-only (runs in release.yml on `v*` tags); the blast radius is the
 * arcforge release itself. Exits 0 (fresh / not applicable) or 1 (stale).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const BENCHMARK_FILE = 'evals/benchmarks/latest.json';

// Paths whose change means the benchmark's subject changed and must be re-run.
const EVAL_BACKED_PREFIXES = ['skills/', 'evals/scenarios/', 'evals/fixtures/'];

/**
 * Pure core: given the benchmark's generated time, the previous tag's commit
 * time, and whether eval-backed surface changed, decide if the benchmark is stale.
 * @param {string|null} generatedISO - `.generated` from latest.json (null if absent)
 * @param {string|null} prevTagISO - previous release tag commit time (null = first release)
 * @param {boolean} evalSurfaceChanged
 * @returns {{ stale: boolean, reason: string }}
 */
function isBenchmarkStale(generatedISO, prevTagISO, evalSurfaceChanged) {
  if (!prevTagISO) {
    return { stale: false, reason: 'first release — no previous tag to compare against' };
  }
  if (!evalSurfaceChanged) {
    return { stale: false, reason: 'no eval-backed surface changed since the previous release' };
  }
  const generated = generatedISO ? Date.parse(generatedISO) : NaN;
  if (Number.isNaN(generated)) {
    return { stale: true, reason: 'benchmark has no parseable `generated` timestamp' };
  }
  const prevTag = Date.parse(prevTagISO);
  if (generated <= prevTag) {
    return {
      stale: true,
      reason: `benchmark generated ${generatedISO} is not newer than the previous release (${prevTagISO})`,
    };
  }
  return {
    stale: false,
    reason: `benchmark generated ${generatedISO} is newer than the previous release`,
  };
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function readGeneratedISO() {
  const abs = path.join(repoRoot, BENCHMARK_FILE);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8')).generated || null;
  } catch {
    return null;
  }
}

/** Most recent tag strictly before the current release tag, or null on first release. */
function previousTag(currentTag) {
  try {
    const ref = currentTag ? `${currentTag}^` : 'HEAD^';
    return git(['describe', '--tags', '--abbrev=0', ref]) || null;
  } catch {
    return null;
  }
}

function evalSurfaceChangedSince(prevTag) {
  let changed;
  try {
    changed = git(['diff', '--name-only', prevTag, 'HEAD']).split('\n').filter(Boolean);
  } catch {
    // If the diff can't be computed, fail safe toward enforcing (treat as changed).
    return true;
  }
  return changed.some((f) => EVAL_BACKED_PREFIXES.some((p) => f.startsWith(p)));
}

function main() {
  const currentTag = process.env.GITHUB_REF_NAME || null;
  const prevTag = previousTag(currentTag);
  const generatedISO = readGeneratedISO();
  const prevTagISO = prevTag ? git(['log', '-1', '--format=%cI', prevTag]) : null;
  const evalSurfaceChanged = prevTag ? evalSurfaceChangedSince(prevTag) : false;

  const { stale, reason } = isBenchmarkStale(generatedISO, prevTagISO, evalSurfaceChanged);

  console.log('Benchmark freshness check');
  console.log(`  previous tag:   ${prevTag || '(none — first release)'}`);
  console.log(`  benchmark gen:  ${generatedISO || '(missing)'}`);
  console.log(`  eval surface:   ${evalSurfaceChanged ? 'changed' : 'unchanged'}`);
  console.log('');

  if (stale) {
    console.error(
      `::error::Stale benchmark — ${reason}. Regenerate the benchmark before releasing.`,
    );
    process.exit(1);
  }
  console.log(`OK — ${reason}.`);
  process.exit(0);
}

module.exports = { isBenchmarkStale, EVAL_BACKED_PREFIXES };

if (require.main === module) {
  main();
}
