const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonFile, writeJsonFile, getArcforgeHome } = require('./utils');

/**
 * learning.js — the learning opt-in and the paths that follow from it.
 *
 * Candidates are NOT here. They live in one canonical store owned by
 * `learning-curator/queue-writer.js`, reviewed through
 * `learning-dashboard.js`, and reached from the CLI by
 * `scripts/cli/learn-command.js`. This module used to carry a second,
 * project-scoped queue with its own schema, statuses and artifact renderers;
 * nothing ever wrote to it.
 */

const VALID_SCOPES = new Set(['project', 'global']);

/**
 * Resolve the global arcforge root.
 *
 * An explicit homeDir (tests) keeps the historical `<home>/.arcforge` shape;
 * otherwise go through the shared resolver so ARCFORGE_HOME redirects the whole
 * tree. Byte-identical to `~/.arcforge` when ARCFORGE_HOME is unset.
 */
function arcforgeRoot(homeDir) {
  return homeDir ? path.join(homeDir, '.arcforge') : getArcforgeHome();
}

function getProjectId(projectRoot = process.cwd()) {
  return crypto.createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 16);
}

function assertScope(scope) {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`scope must be one of: ${[...VALID_SCOPES].join(', ')}`);
  }
}

function getLearningConfigPath({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  if (scope === 'global') return path.join(arcforgeRoot(homeDir), 'learning', 'config.json');
  return path.join(projectRoot, '.arcforge', 'learning', 'config.json');
}

function getObservationPath({ projectRoot = process.cwd(), homeDir } = {}) {
  return path.join(
    arcforgeRoot(homeDir),
    'observations',
    path.basename(projectRoot),
    'observations.jsonl',
  );
}

function defaultScopeConfig(scope) {
  return { scope, enabled: false };
}

function readScopeConfig({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  const raw = readJsonFile(getLearningConfigPath({ scope, projectRoot, homeDir }), null);
  if (!raw || typeof raw !== 'object') return defaultScopeConfig(scope);
  return { ...defaultScopeConfig(scope), ...raw, scope, enabled: raw.enabled === true };
}

function readLearningConfig({ projectRoot = process.cwd(), homeDir } = {}) {
  return {
    project: readScopeConfig({ scope: 'project', projectRoot, homeDir }),
    global: readScopeConfig({ scope: 'global', projectRoot, homeDir }),
  };
}

function isLearningEnabled({ scope = 'project', projectRoot = process.cwd(), homeDir } = {}) {
  return readScopeConfig({ scope, projectRoot, homeDir }).enabled === true;
}

/**
 * True when learning is enabled in EITHER scope.
 *
 * The one question every capture path asks: a user who opted in globally must
 * not have to opt in again per project, and a project opt-in must work without
 * the global one. Enabling is scoped (`--project` / `--global`); *being*
 * enabled is not, so consent lives in one predicate instead of a disjunction
 * re-derived at each call site.
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root whose scoped config to read.
 * @param {string} [opts.homeDir] - Override for the global config's home.
 * @returns {boolean}
 */
function isLearningEnabledAnyScope({ projectRoot = process.cwd(), homeDir } = {}) {
  return (
    isLearningEnabled({ scope: 'project', projectRoot, homeDir }) ||
    isLearningEnabled({ scope: 'global', projectRoot, homeDir })
  );
}

/**
 * Timestamp at which the learning opt-in took effect, in epoch ms.
 *
 * `isLearningEnabledAnyScope` answers "may we capture now"; this answers "since
 * when", which is what any healthcheck over accumulated artifacts needs. With
 * learning off, diary drafts keep their unfilled sections by design (D-009), so
 * every stub from that period is expected. A check that only asked "is learning
 * on" would report the whole backlog the moment a user opted in — moving the
 * false alarm to the opt-in boundary instead of removing it.
 *
 * The source is `updated_at`, which `setLearningEnabled` writes and nothing
 * else in the engine touches. It stamps a state CHANGE, not a write, so
 * re-running `learn enable` on an already-enabled scope leaves the floor where
 * the real opt-in put it. A config without it (hand-written) falls back to the
 * file's mtime, and a write that changes nothing persists that mtime as the
 * field, so the fallback is computed once rather than re-derived on every read
 * — a write moves the mtime, so re-deriving would drag the floor forward with
 * it. (A write that DOES change the state stamps the transition, as always.) A
 * config that cannot be stat'd returns 0, so an unreadable timestamp warns
 * about everything rather than going quiet on a real failure. When both scopes
 * are enabled the EARLIEST wins — that is the moment enrichment first became
 * authorized.
 *
 * Accepted cost: a disable moves the floor forward, so drafts left stale
 * before it stop being reported. That includes the overlapping case — global
 * on at T1, project on at T2, global off at T3 — where any-scope authorization
 * never lapsed yet the floor becomes T2: a scope's `updated_at` records its
 * latest transition, so the disable overwrites the enable it replaced and T1 is
 * not recoverable from state. A missed warning is the cheaper failure than a
 * permanent one about intended behavior, and an idempotent re-enable preserves
 * the stamp, so only a real consent toggle moves the floor.
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root whose scoped config to read.
 * @param {string} [opts.homeDir] - Override for the global config's home.
 * @returns {number|null} Epoch ms, or null when learning is off in both scopes.
 */
function learningEnabledSince({ projectRoot = process.cwd(), homeDir } = {}) {
  let earliest = null;
  for (const scope of ['project', 'global']) {
    const config = readScopeConfig({ scope, projectRoot, homeDir });
    if (config.enabled !== true) continue;
    const at = scopeEnabledAt(config, getLearningConfigPath({ scope, projectRoot, homeDir }));
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

/** When one enabled scope was last written. See learningEnabledSince. */
function scopeEnabledAt(config, configPath) {
  const stamped = Date.parse(config.updated_at ?? '');
  if (!Number.isNaN(stamped)) return stamped;
  try {
    return fs.statSync(configPath).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * The stamp an unchanged scope must keep, or null when there is none to keep.
 *
 * A parseable `updated_at` is kept VERBATIM rather than re-serialized, so a
 * hand-written stamp survives a no-op command unaltered. Otherwise the
 * effective floor — the file mtime that `scopeEnabledAt` falls back to — is
 * materialized into the field it stands in for, which is what keeps
 * `learningEnabledSince` reading the same instant after the write as before it.
 */
function preservedStamp(config, configPath) {
  if (!Number.isNaN(Date.parse(config.updated_at ?? ''))) return config.updated_at;
  const at = scopeEnabledAt(config, configPath);
  return at > 0 ? new Date(at).toISOString() : null;
}

/**
 * Kill-switch for SessionStart injection of activated instincts (ICL-4).
 *
 * DEFAULT ON: injection happens unless `inject_activated_instincts` is set to
 * the literal `false` in the global learning config. Any other value (absent,
 * true, missing config file) leaves injection enabled. The switch is read from
 * the global-scope config because activated-instinct injection is a HOME-global
 * behavior, not project-scoped.
 *
 * @returns {boolean} true when injection is enabled
 */
function isInjectActivatedInstinctsEnabled({ homeDir } = {}) {
  const config = readJsonFile(getLearningConfigPath({ scope: 'global', homeDir }), null);
  if (config && config.inject_activated_instincts === false) return false;
  return true;
}

function setLearningEnabled({
  scope = 'project',
  enabled,
  projectRoot = process.cwd(),
  homeDir,
  now = new Date().toISOString(),
} = {}) {
  assertScope(scope);
  const next = enabled === true;
  const configPath = getLearningConfigPath({ scope, projectRoot, homeDir });
  const previous = readScopeConfig({ scope, projectRoot, homeDir });
  // `updated_at` stamps the TRANSITION, not the write. `learningEnabledSince`
  // reads it as "when the opt-in took effect", so a command that changes
  // nothing must not move it — advancing the floor there would silently retire
  // stale-draft warnings for drafts written since the actual opt-in. A config
  // that never carried the field is read as its file mtime, so an unchanged
  // state persists THAT rather than `now`; the write itself moves the mtime,
  // which is exactly why the fallback has to be captured here instead of
  // re-derived on the next read.
  const preserved = previous.enabled === next ? preservedStamp(previous, configPath) : null;
  const config = { scope, enabled: next, updated_at: preserved ?? now };
  writeJsonFile(configPath, config);
  return config;
}
module.exports = {
  VALID_SCOPES,
  getLearningConfigPath,
  getObservationPath,
  getProjectId,
  isInjectActivatedInstinctsEnabled,
  isLearningEnabled,
  isLearningEnabledAnyScope,
  learningEnabledSince,
  readLearningConfig,
  setLearningEnabled,
};
