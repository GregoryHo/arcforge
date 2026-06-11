/**
 * spec-resolution.js - Resolve which spec's dag.yaml a CLI invocation targets.
 *
 * CLI tier: ambiguity that cannot be resolved exits with a user-facing
 * message (see requireSpecId / resolveMergeOrCleanupSpec).
 */

const fs = require('node:fs');
const { listSpecDagPaths, readArcforgeMarker } = require('../lib/coordinator');
const { parseDagYaml } = require('../lib/yaml-parser');

/**
 * Resolve the spec id for a CLI invocation.
 *
 * Priority:
 *   1. Explicit --spec-id flag.
 *   2. `.arcforge-epic` marker in cwd (worktree wins — always scopes to
 *      the marker's spec_id).
 *   3. Single spec in `specs/*\/dag.yaml` → that spec.
 *   4. Multiple specs → return ambiguity signal; caller decides whether
 *      to aggregate or error-require-flag.
 *
 * @param {string} projectRoot
 * @param {string|undefined} explicitFlag - value of --spec-id
 * @returns {string|null|{ambiguous: true, candidates: string[]}}
 */
function resolveSpecId(projectRoot, explicitFlag) {
  if (explicitFlag) return explicitFlag;

  const marker = readArcforgeMarker(projectRoot);
  if (marker?.spec_id) return marker.spec_id;

  const candidates = listSpecDagPaths(projectRoot).map((s) => s.specId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return { ambiguous: true, candidates };
}

/** Discriminator for the ambiguous-spec result from resolveSpecId. */
function isAmbiguousSpec(spec) {
  return typeof spec === 'object' && spec !== null && spec.ambiguous === true;
}

/**
 * Error out with a clear message when --spec-id is required. Used by
 * commands that cannot aggregate (next, parallel, expand, loop) and by
 * the error branches of merge / cleanup when no --epic was provided.
 */
function requireSpecId(spec, commandName) {
  if (typeof spec === 'string') return spec;
  if (spec === null) {
    console.error(
      `Error: No spec found. ${commandName} needs either a --spec-id flag or a populated specs/*/dag.yaml.`,
    );
    process.exit(1);
  }
  // ambiguous
  console.error(
    `Error: Multiple specs found (${spec.candidates.join(', ')}). Rerun ${commandName} with --spec-id <id>.`,
  );
  process.exit(1);
}

/**
 * Build a reverse index { epicId → [specId...] } by reading each
 * `specs/*\/dag.yaml` exactly once. One-shot single-epic lookup uses
 * findSpecsByEpic; callers that need the index directly can call this.
 * @returns {Map<string, string[]>}
 */
function buildEpicSpecIndex(projectRoot) {
  const index = new Map();
  for (const { specId, dagPath } of listSpecDagPaths(projectRoot)) {
    let dag;
    try {
      dag = parseDagYaml(fs.readFileSync(dagPath, 'utf8'));
    } catch {
      continue;
    }
    for (const epic of dag.epics || []) {
      const bucket = index.get(epic.id) || [];
      bucket.push(specId);
      index.set(epic.id, bucket);
    }
  }
  return index;
}

/**
 * Reverse-lookup: find which specs contain a given epic id. One-shot
 * variant; reuses buildEpicSpecIndex internally so the two call sites
 * agree on semantics.
 * @returns {string[]} spec ids that contain the epic
 */
function findSpecsByEpic(projectRoot, epicId) {
  return buildEpicSpecIndex(projectRoot).get(epicId) || [];
}

/**
 * Resolve spec for merge / cleanup. These commands accept --spec-id OR
 * positional epic ids — an epic id uniquely identifies its parent spec
 * in most deployments, so we can reverse-look-up rather than forcing
 * the flag.
 */
function resolveMergeOrCleanupSpec(projectRoot, explicitFlag, positionalEpics, commandName) {
  const spec = resolveSpecId(projectRoot, explicitFlag);
  if (typeof spec === 'string') return spec;
  if (spec === null) {
    console.error(
      `Error: No spec found. ${commandName} needs either a --spec-id flag or a populated specs/*/dag.yaml.`,
    );
    process.exit(1);
  }
  // Ambiguous — try to narrow via positional epic ids.
  // Must INTERSECT: a valid parent spec contains ALL positional epics, not any.
  // Union would report false ambiguity when a unique epic id pins the spec and
  // a shared epic id happens to also live elsewhere.
  if (positionalEpics && positionalEpics.length > 0) {
    const perEpicMatches = positionalEpics.map((id) => new Set(findSpecsByEpic(projectRoot, id)));
    const missing = positionalEpics.filter((_id, i) => perEpicMatches[i].size === 0);
    if (missing.length > 0) {
      console.error(
        `Error: Epic(s) ${missing.join(', ')} not found in any spec. Pass --spec-id to be explicit.`,
      );
      process.exit(1);
    }
    const intersection = perEpicMatches.reduce((acc, s) => {
      const next = new Set();
      for (const x of acc) if (s.has(x)) next.add(x);
      return next;
    });
    if (intersection.size === 1) return [...intersection][0];
    if (intersection.size === 0) {
      console.error(
        `Error: Epic(s) ${positionalEpics.join(', ')} do not share a single spec. Pass --spec-id to disambiguate.`,
      );
      process.exit(1);
    }
    console.error(
      `Error: Epic(s) ${positionalEpics.join(', ')} span multiple specs (${[...intersection].join(', ')}). Pass --spec-id to disambiguate.`,
    );
    process.exit(1);
  }
  console.error(
    `Error: Multiple specs found (${spec.candidates.join(', ')}). Rerun ${commandName} with --spec-id <id> or pass epic ids as positional args.`,
  );
  process.exit(1);
}

module.exports = {
  resolveSpecId,
  isAmbiguousSpec,
  requireSpecId,
  resolveMergeOrCleanupSpec,
};
