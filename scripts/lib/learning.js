const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonFile, writeJsonFile, getArcforgeHome, sanitizeProjectName } = require('./utils');

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
 * Where the root of the project whose observations are filed under `project`
 * is on record. The observer daemon is machine-wide and knows a project only by
 * that name, while the project-scope opt-in lives in the project's own tree.
 */
function getProjectRootRecordPath(project, { homeDir } = {}) {
  if (typeof project !== 'string' || !project || sanitizeProjectName(project) !== project) {
    throw new Error(`project must be a sanitized project directory name (got "${project}")`);
  }
  return path.join(arcforgeRoot(homeDir), 'learning', 'project-roots', `${project}.json`);
}

/**
 * Put a project's root on record under the name its observations are filed
 * under (the `getProjectName()` key), so `isLearningEnabledForProject` can find
 * the project-scope opt-in. SessionStart and every observation keep it current
 * while learning is on there, so it is cheap and idempotent: a record that
 * already says the same is not rewritten. A record that fails its shape is
 * replaced — the writer is the one party that knows the right answer.
 *
 * @returns {{ project: string, project_root: string }}
 */
function recordProjectRoot({ projectRoot = process.cwd(), homeDir } = {}) {
  const resolved = path.resolve(projectRoot);
  const record = { project: sanitizeProjectName(path.basename(resolved)), project_root: resolved };
  let existing = null;
  try {
    existing = readProjectRootRecord(record.project, { homeDir });
  } catch {
    // An unusable record is exactly what this write repairs, so it is not an error here.
  }
  if (existing && existing.project_root === resolved) return record;
  writeJsonFile(getProjectRootRecordPath(record.project, { homeDir }), record);
  return record;
}

/**
 * Read the project-root record filed under `project`, or null when there is
 * none. The record is trusted only in exactly the shape `recordProjectRoot`
 * writes — `{ project, project_root }`, both strings, `project` the name it is
 * filed under, `project_root` an absolute path whose directory name files
 * under that name. Anything else throws, so a caller asking whether it may
 * analyze fails closed instead of following a root nobody recorded.
 *
 * @returns {{ project: string, project_root: string }|null}
 */
function readProjectRootRecord(project, { homeDir } = {}) {
  const recordPath = getProjectRootRecordPath(project, { homeDir });
  if (!fs.existsSync(recordPath)) return null;
  const refuse = (why) => {
    throw new Error(`project-root record ${recordPath} is not usable: ${why}`);
  };
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch (err) {
    refuse(`not JSON (${err.message})`);
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) refuse('not an object');
  const keys = Object.keys(record).sort().join(',');
  if (keys !== 'project,project_root') refuse(`keys must be project, project_root (got ${keys})`);
  if (record.project !== project) refuse(`project is "${record.project}", filed as "${project}"`);
  const root = record.project_root;
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    refuse(`project_root must be an absolute path (got ${JSON.stringify(root)})`);
  }
  if (sanitizeProjectName(path.basename(root)) !== project) {
    refuse(`project_root ${root} does not file under "${project}"`);
  }
  return record;
}

/**
 * When learning took effect for the project whose observations are filed under
 * `project`, in epoch ms, or null when it is not enabled for it (B-1).
 *
 * With the project's root on record this is `learningEnabledSince` at that root
 * — the start of the unbroken any-scope authorization that reaches the present
 * (B-19), so a disable that leaves the other scope on keeps it, and a lapse
 * followed by a re-enable starts it over. Without a record only the global
 * opt-in can authorize the project, so it is read from the global scope alone,
 * or null (fail closed). The observer daemon analyzes only observations
 * recorded at or after this instant, so nothing captured before a lapse is
 * analyzed later.
 *
 * @param {string} project - sanitized project directory name
 * @param {Object} [opts]
 * @param {string} [opts.homeDir] - Override for the arcforge home's parent.
 * @returns {number|null}
 */
function learningEnabledSinceForProject(project, { homeDir } = {}) {
  const record = readProjectRootRecord(project, { homeDir });
  if (record) return learningEnabledSince({ projectRoot: record.project_root, homeDir });
  return effectiveOptIn([readScopePeriod({ scope: 'global', homeDir })]);
}

/**
 * True when learning is enabled for the project whose observations are filed
 * under `project` — the question the observer daemon asks before analyzing
 * (B-1). See `learningEnabledSinceForProject`.
 *
 * @param {string} project - sanitized project directory name
 * @param {Object} [opts]
 * @param {string} [opts.homeDir] - Override for the arcforge home's parent.
 * @returns {boolean}
 */
function isLearningEnabledForProject(project, { homeDir } = {}) {
  return learningEnabledSinceForProject(project, { homeDir }) !== null;
}

/**
 * Timestamp at which the learning opt-in took effect, in epoch ms (B-19).
 *
 * `isLearningEnabledAnyScope` answers "may we capture now"; this answers "since
 * when", which is what any healthcheck over accumulated artifacts needs. With
 * learning off, diary drafts keep their unfilled sections by design (D-009), so
 * every stub from that period is expected. A check that only asked "is learning
 * on" would report the whole backlog the moment a user opted in — moving the
 * false alarm to the opt-in boundary instead of removing it. The same instant
 * bounds what the curator may analyze (B-1).
 *
 * "Took effect" is the start of the unbroken stretch of authorization in EITHER
 * scope that reaches the present. Each scope contributes its latest authorized
 * period (`scopePeriod`): from `enabled_at` to now while it is enabled, and to
 * its disable — the `updated_at` a disable stamps — once it is not. The floor is
 * the earliest start among the enabled scopes, extended back to the start of a
 * disabled scope's period that reaches it; periods that touch join. So global
 * on at T1, project on at T2 and global off at T3 ≥ T2 is T1, and with T3 < T2
 * authorization lapsed and it is T2.
 *
 * Both stamps are written by `setLearningEnabled` and nothing else in the
 * engine. They mark state CHANGES, not writes, so re-running `learn enable` on
 * an enabled scope leaves the floor where the real opt-in put it. A config
 * from before `enabled_at` existed reads as it always did: its `updated_at`
 * while enabled — or the file's mtime when that is missing, persisted into the
 * field by the next no-op write so it is not re-derived from a moving mtime —
 * and no period at all while disabled. A config that cannot be stat'd reads as
 * 0, so an unreadable timestamp warns about everything rather than going quiet
 * on a real failure. An unusable stamp gives a disabled scope no period, so a
 * hand-edit can shorten the stretch but never invent one.
 *
 * Residual: only a scope's LATEST period is kept. Global on at T1, project on
 * at T2, global off at T3 and on again at T4 leaves the floor at T2 — the
 * re-enable overwrites T1 — so drafts left stale in [T1, T2) stop being
 * reported. A missed warning is the cheaper failure than a permanent one about
 * intended behavior (D-051).
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root whose scoped config to read.
 * @param {string} [opts.homeDir] - Override for the global config's home.
 * @returns {number|null} Epoch ms, or null when learning is off in both scopes.
 */
function learningEnabledSince({ projectRoot = process.cwd(), homeDir } = {}) {
  return effectiveOptIn(
    ['project', 'global'].map((scope) => readScopePeriod({ scope, projectRoot, homeDir })),
  );
}

/**
 * The start of the stretch of authorization that reaches the present, from
 * the periods of the scopes that can authorize, or null when none is enabled.
 * There are two scopes and at least one is live, so at most one period has
 * ended and a single pass is exact.
 */
function effectiveOptIn(periods) {
  const known = periods.filter(Boolean);
  const live = known.filter((period) => period.end === Infinity);
  if (live.length === 0) return null;
  let floor = Math.min(...live.map((period) => period.start));
  for (const { start, end } of known) {
    if (start < floor && end >= floor) floor = start;
  }
  return floor;
}

function readScopePeriod({ scope, projectRoot = process.cwd(), homeDir }) {
  const config = readScopeConfig({ scope, projectRoot, homeDir });
  return scopePeriod(config, getLearningConfigPath({ scope, projectRoot, homeDir }));
}

/**
 * One scope's latest authorized period as `{ start, end }` in epoch ms — `end`
 * is Infinity while the scope is enabled — or null when it has none on record:
 * a disabled scope without a usable `enabled_at` and `updated_at`, or whose
 * `enabled_at` is later than its disable (clock skew), contributes nothing.
 */
function scopePeriod(config, configPath) {
  if (config.enabled === true) {
    const start = startsAtEnabledAt(config)
      ? parseStamp(config.enabled_at)
      : scopeEnabledAt(config, configPath);
    return { start, end: Infinity };
  }
  const start = parseStamp(config.enabled_at);
  const end = Date.parse(config.updated_at ?? '');
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return { start, end };
}

/**
 * Whether an ENABLED scope's period starts at its `enabled_at`. An enable the
 * engine records stamps both fields alike, so `updated_at` is never the later
 * one — unless the enable was recorded by an engine that does not know
 * `enabled_at` (6.2.x), which leaves an older period's start behind. The later
 * stamp is then the real start, and reading the stale one would reach back
 * across the opt-out between the two periods.
 */
function startsAtEnabledAt(config) {
  const enabledAt = parseStamp(config.enabled_at);
  return !Number.isNaN(enabledAt) && !(Date.parse(config.updated_at ?? '') > enabledAt);
}

/** Epoch ms of a string stamp; NaN for anything else, a number included. */
function parseStamp(value) {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN;
}

/** When one enabled scope was last written — its start without a usable `enabled_at`. */
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
 * The `enabled_at` a disable writes: the start of the enabled period it ends,
 * as `scopePeriod` reads it — verbatim from `enabled_at` when that is the
 * start, else the preserved `updated_at` (or materialized mtime), or null when
 * there is none.
 */
function endedPeriodStart(config, configPath) {
  return startsAtEnabledAt(config) ? config.enabled_at : preservedStamp(config, configPath);
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
  const changed = previous.enabled !== next;
  // `updated_at` stamps the TRANSITION, not the write. `learningEnabledSince`
  // reads it as "when the opt-in took effect", so a command that changes
  // nothing must not move it — advancing the floor there would silently retire
  // stale-draft warnings for drafts written since the actual opt-in. A config
  // that never carried the field is read as its file mtime, so an unchanged
  // state persists THAT rather than `now`; the write itself moves the mtime,
  // which is exactly why the fallback has to be captured here instead of
  // re-derived on the next read.
  const preserved = changed ? null : preservedStamp(previous, configPath);
  // Merge, never replace: the file carries keys the opt-in does not own — the
  // `inject_activated_instincts` kill-switch among them — and a toggle that
  // dropped them would silently turn a user's own setting back off. The same
  // merge leaves `enabled_at` as it is on a write that changes nothing.
  const raw = readJsonFile(configPath, null);
  const existing = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const config = { ...existing, scope, enabled: next, updated_at: preserved ?? now };
  // `enabled_at` is the start of the scope's latest authorized period (B-19).
  // An enable starts a new one; a disable keeps the start of the one it ends —
  // the period start the floor was reading, which for a config written before
  // the field existed is its `updated_at`, so that start survives the disable.
  if (changed) {
    const start = next ? now : endedPeriodStart(previous, configPath);
    if (start !== null) config.enabled_at = start;
  }
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
  isLearningEnabledForProject,
  learningEnabledSince,
  learningEnabledSinceForProject,
  readLearningConfig,
  recordProjectRoot,
  setLearningEnabled,
};
