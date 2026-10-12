/**
 * eval-preflight.js - Preflight gate for A/B eval runs
 *
 * Before running arcforge eval ab, a preflight must confirm the scenario is
 * discriminative (baseline pass rate < 0.8). If the baseline already passes
 * >= 80% of trials without any skill, the scenario has a ceiling effect and
 * cannot reliably distinguish a good skill from a bad one.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  listScenarios,
  parseScenario,
  appendResult,
  stampRow,
  repoCommit,
  gradeTrialResult,
  cleanupTrialDir,
} = require('./eval');
const { computeScenarioHash } = require('./eval-scenario');
const { stopIfTrialWroteRepo, DEFAULT_TRIAL_TIMEOUT_MS } = require('./eval-trial');

/** Directory where preflight JSON files are stored */
const PREFLIGHT_DIR = path.join('evals', 'preflight');

/** Threshold above which baseline pass rate signals a ceiling (not discriminative) */
const CEILING_THRESHOLD = 0.8;

/** Number of baseline trials to run during preflight */
const PREFLIGHT_K = 3;

/**
 * The label preflight trials run and are recorded under. Their rows land in
 * `<runId>/preflight.jsonl`, a file no baseline, treatment or `eval run` reader
 * opens, so a preflight trial is on record without ever joining an A/B pool.
 */
const PREFLIGHT_LABEL = 'preflight';

/**
 * Return true only for an explicit scenario-level `## Preflight\nskip` policy.
 * Missing/unknown values keep the existing fail-closed A/B preflight gate.
 * @param {Object|null|undefined} scenario - Parsed eval scenario
 * @returns {boolean} Whether the A/B preflight gate should be bypassed
 */
function shouldSkipPreflightGate(scenario) {
  return String(scenario?.preflight || '').toLowerCase() === 'skip';
}

/**
 * Build the preflight cache filename for a (scenarioHash, model) pair.
 * Baseline pass rate is model-dependent — a PASS produced under model A
 * does not generalize to model B. Encoding the model in the filename
 * keeps per-model preflight records distinct and prevents one model's
 * PASS from silently unblocking A/B runs on another model.
 *
 * @param {string} hash - Scenario content hash from computeScenarioHash
 * @param {string|undefined} model - Model identifier from --model, or
 *   undefined if not specified (which means "harness default model")
 * @returns {string} Filename like `${hash}-${modelKey}.json`
 */
function preflightFilename(hash, model, conditions = {}) {
  const modelKey = (model || 'default').replace(/[^A-Za-z0-9._-]/g, '_');
  return `${hash}-${modelKey}${conditionsSuffix(conditions)}.json`;
}

/**
 * The run conditions a baseline's competence depends on beyond scenario and
 * model: its turn budget, whether a plugin dir was in play (which also sets
 * the default budget), and the --effort it ran at. A PASS measured under one
 * set does not unlock an A/B run under another. Plain conditions (no budget,
 * no plugin dir, no effort) add nothing to the file name, so records written
 * before this key existed still match them.
 * A baseline given a skill text is another baseline: its record is keyed on the
 * text's hash, and on whether its skill files were staged for it (B-20).
 * @param {{ maxTurns?: number, pluginDir?: string, effort?: string, trialTimeoutMs?: number, baselineSkillHash?: string, stageSkillFiles?: boolean }} conditions
 * @returns {string} '' or e.g. '-t10-pd', '-ehigh', '-t10-pd-ehigh', '-b0123456789abcdef-s'
 */
function conditionsSuffix({
  maxTurns,
  pluginDir,
  effort,
  trialTimeoutMs,
  baselineSkillHash,
  stageSkillFiles,
} = {}) {
  const budget =
    maxTurns == null && !pluginDir ? '' : `-t${maxTurns ?? 'none'}${pluginDir ? '-pd' : ''}`;
  const effortKey = effort ? `-e${String(effort).replace(/[^A-Za-z0-9._]/g, '_')}` : '';
  // The ceiling only when it was moved, so records at the default keep matching.
  const ceiling =
    trialTimeoutMs && trialTimeoutMs !== DEFAULT_TRIAL_TIMEOUT_MS ? `-c${trialTimeoutMs}` : '';
  // Staging reaches the baseline only when it is given a text to stage for.
  const baselineText = baselineSkillHash
    ? `-b${String(baselineSkillHash).replace(/[^A-Za-z0-9]/g, '_')}${stageSkillFiles ? '-s' : ''}`
    : '';
  return `${budget}${effortKey}${ceiling}${baselineText}`;
}

/** Human-readable conditions, as the gate names them. */
function describeConditions({
  maxTurns,
  pluginDir,
  effort,
  trialTimeoutMs,
  baselineSkillHash,
  stageSkillFiles,
} = {}) {
  // Named only for a baseline given a text, so other records read as before.
  const baselineText = baselineSkillHash
    ? `, baseline text ${baselineSkillHash}${stageSkillFiles ? ' with staged files' : ''}`
    : '';
  return `max turns ${maxTurns ?? 'none'}, plugin dir ${pluginDir ? 'yes' : 'no'}, effort ${effort || 'default'}, ceiling ${trialTimeoutMs || DEFAULT_TRIAL_TIMEOUT_MS} ms${baselineText}`;
}

/**
 * Resolve the scenario file path by parsed `# Eval:` name (matching
 * findScenario / `arcforge eval run` / `arcforge eval ab` semantics), with fallback
 * to literal filename lookup. Returns null if no scenario matches either.
 *
 * Resolving by parsed name (not filename) prevents preflight from falsely
 * blocking scenarios whose filename has been renamed but whose `# Eval:`
 * header still matches the requested name — the same lookup semantics
 * used elsewhere in the eval CLI.
 *
 * @param {string} name - Scenario name (parsed `# Eval:` value, or filename stem)
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Absolute path to scenario file, or null
 */
function resolveScenarioFile(name, projectRoot) {
  for (const f of listScenarios(projectRoot)) {
    const s = parseScenario(f, projectRoot);
    if (s.name === name) return f;
  }
  // Fallback: legacy filename-based lookup, kept so preflighting a
  // scenario by filename stem still works when the `# Eval:` header
  // hasn't been authored yet.
  const filePath = path.join(projectRoot, 'evals', 'scenarios', `${name}.md`);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Run a preflight for a named scenario.
 *
 * Executes PREFLIGHT_K baseline trials (no skill injection) and computes the
 * pass rate. Writes evals/preflight/<hash>.json with the result, and one result
 * row per trial to evals/results/<scenario>/<runId>/preflight.jsonl.
 *
 * Verdicts:
 *   PASS  — pass_rate < CEILING_THRESHOLD (scenario is discriminative)
 *   BLOCK — pass_rate >= CEILING_THRESHOLD (ceiling effect, not discriminative)
 *
 * NOTE: verdictFromDeltaCI / eval-stats verdicts (SHIP, NEEDS_WORK, etc.) are
 * intentionally NOT used here. Preflight only emits PASS or BLOCK.
 *
 * @param {string} name - Scenario name
 * @param {string} projectRoot - Project root directory
 * @param {Object} opts - Dependency injection for testing
 * @param {Function} opts.runTrial - Function to run a single trial
 * @param {Function} opts.gradeResult - Function to grade a trial result
 * @param {string} [opts.model] - Model identifier; included in cache key so
 *   per-model preflight records stay distinct (baseline pass rate is
 *   model-dependent). Pass the same value the trials were actually run with.
 * @param {Object} [opts.scenario] - The scenario as the caller parsed it to
 *   build the trials. Pass it so one read of the file stamps the trials, the
 *   rows and the record; without it the scenario is resolved and parsed here.
 * @returns {{ scenario_hash: string, scenario_name: string, model: string|null, max_turns: number|null, plugin_dir: boolean, effort: string|null, trial_timeout_ms: number, node_version: string, repo_commit: string|null, pass_rate: number|null, k: number, errored?: number, verdict: 'PASS'|'BLOCK', reason: string, timestamp: string }}
 */
function runPreflight(name, projectRoot, opts = {}) {
  const { runTrial, gradeResult, model, conditions = {} } = opts;

  let scenario = opts.scenario;
  if (!scenario) {
    const filePath = resolveScenarioFile(name, projectRoot);
    if (!filePath) {
      throw new Error(`Scenario "${name}" not found in evals/scenarios/`);
    }
    scenario = parseScenario(filePath, projectRoot);
  }
  // The hash of the text the trials were built from: the record is filed
  // under it and every row carries it (stampRow), from the one parse.
  const hash = scenario.scenarioHash;
  if (!hash) {
    throw new Error(
      `runPreflight: the scenario passed for "${name}" has no scenarioHash; pass the object parseScenario returned`,
    );
  }
  const cacheFile = preflightFilename(hash, model, conditions);
  const ranUnder = {
    max_turns: conditions.maxTurns ?? null,
    plugin_dir: Boolean(conditions.pluginDir),
    effort: conditions.effort || null,
    trial_timeout_ms: conditions.trialTimeoutMs || DEFAULT_TRIAL_TIMEOUT_MS,
    // Only a baseline given a skill text records these (B-20).
    ...(conditions.baselineSkillHash
      ? {
          baseline_skill_hash: conditions.baselineSkillHash,
          stage_skill_files: Boolean(conditions.stageSkillFiles),
        }
      : {}),
    // Recorded, not keyed on: a Node upgrade or a new commit does not
    // invalidate a record.
    node_version: process.version,
    repo_commit: repoCommit(projectRoot),
  };
  // Write the record under the cache key and return it.
  const writeRecord = (outcome) => {
    const record = {
      scenario_hash: hash,
      scenario_name: name,
      model: model || null,
      ...ranUnder,
      k: PREFLIGHT_K,
      ...outcome,
      timestamp: new Date().toISOString(),
    };
    const preflightDir = path.join(projectRoot, PREFLIGHT_DIR);
    fs.mkdirSync(preflightDir, { recursive: true });
    fs.writeFileSync(path.join(preflightDir, cacheFile), JSON.stringify(record, null, 2));
    return record;
  };

  // Rows are labelled here, whatever the injected runner called them: a
  // preflight trial must not be able to land in another condition's file.
  const evalName = `${scenario.name}-${PREFLIGHT_LABEL}`;
  const results = [];
  for (let t = 1; t <= PREFLIGHT_K; t++) {
    const raw = runTrial(t, PREFLIGHT_K);
    const graded = gradeResult(raw, t);
    appendResult(stampRow({ ...graded, eval: evalName }, scenario, projectRoot), projectRoot);
    // Recorded first, as an A/B arm does, so the row of the trial that stops
    // the run is kept.
    stopIfTrialWroteRepo(graded, `preflight trial ${t}`);
    results.push(graded);
  }

  // Trials that errored out (infraError from runTrial, gradeError from
  // gradeResult) are NOT signal — they mean we never actually exercised
  // the scenario. Folding them into the pass-rate denominator as
  // "ordinary failures" is fail-OPEN: a scenario whose baseline trials
  // all infra-error to passed=false produces pass_rate=0%, which is
  // below the ceiling, which yields a false PASS. Fail closed instead.
  const errored = results.filter((r) => r.infraError || r.gradeError);
  if (errored.length > 0) {
    const verdict = 'BLOCK';
    const reason =
      `${errored.length}/${results.length} preflight trials errored ` +
      `(infraError or gradeError) — no discriminability signal. ` +
      `Fix the trial environment or grader before re-running preflight.`;
    return writeRecord({ pass_rate: null, errored: errored.length, verdict, reason });
  }

  const passed = results.filter((r) => r.passed).length;
  const pass_rate = results.length > 0 ? passed / results.length : 0;

  const verdict = pass_rate >= CEILING_THRESHOLD ? 'BLOCK' : 'PASS';
  const reason =
    verdict === 'BLOCK'
      ? `Baseline pass rate ${(pass_rate * 100).toFixed(0)}% >= ${CEILING_THRESHOLD * 100}% ceiling — scenario is not discriminative. Redesign the scenario to be harder.`
      : `Baseline pass rate ${(pass_rate * 100).toFixed(0)}% < ${CEILING_THRESHOLD * 100}% — scenario is discriminative. Proceed with arcforge eval ab.`;

  return writeRecord({ pass_rate, verdict, reason });
}

/**
 * Grade one preflight trial and remove its directory. An infra error is
 * returned as it is: there is no agent turn to grade, and grading a refusal
 * would spawn a grader session while the account is limited.
 * @param {Object} result - Row from runTrial
 * @param {Object} scenario - Parsed eval scenario
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Graded row
 */
function gradePreflightTrial(result, scenario, projectRoot) {
  try {
    if (result.infraError) return result;
    return gradeTrialResult(result, scenario, projectRoot, result.actions);
  } finally {
    cleanupTrialDir(result.trialDir);
  }
}

/**
 * Check the preflight gate before running arcforge eval ab.
 *
 * Rules:
 * 1. Compute current scenario hash.
 * 2. Look up evals/preflight/<hash>.json.
 * 3. If missing → return error (run preflight first).
 * 4. If found but verdict == BLOCK → return error (ceiling, redesign scenario).
 * 5. If found and verdict == PASS → return null (proceed).
 *
 * The hash check implicitly enforces re-preflight when the scenario file is
 * edited: the new hash will not match any existing preflight file.
 *
 * @param {string} name - Scenario name
 * @param {string} projectRoot - Project root directory
 * @param {Object} [opts] - Options
 * @param {string} [opts.model] - Model identifier the A/B run will use; the
 *   gate verifies a preflight record exists for this exact model. Pass the
 *   same value `arcforge eval ab` will pass to its trials.
 * @param {{ maxTurns?: number, pluginDir?: string, baselineSkillHash?: string, stageSkillFiles?: boolean }} [opts.conditions] -
 *   The turn budget and plugin dir the A/B baseline will run under, and the text
 *   it will be given, if any; the record must match.
 * @returns {null|string} null if cleared to proceed; error message string if blocked
 */
function checkPreflightGate(name, projectRoot, opts = {}) {
  const { model, conditions = {} } = opts;

  const filePath = resolveScenarioFile(name, projectRoot);
  if (!filePath) {
    return `Scenario "${name}" not found in evals/scenarios/. Cannot check preflight gate.`;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  const hash = computeScenarioHash(contents);
  const cacheFile = preflightFilename(hash, model, conditions);

  const preflightFile = path.join(projectRoot, PREFLIGHT_DIR, cacheFile);
  if (!fs.existsSync(preflightFile)) {
    return missingPreflightMessage(name, projectRoot, { hash, model, conditions });
  }

  let record;
  try {
    record = JSON.parse(fs.readFileSync(preflightFile, 'utf8'));
  } catch {
    return `Preflight file for "${name}" is corrupt. ` + `Run: arcforge eval preflight ${name}`;
  }

  if (record.verdict === 'BLOCK') {
    return (
      `Preflight BLOCK for scenario "${name}": ${record.reason}\n` +
      `Redesign the scenario to reduce the baseline pass rate below ${CEILING_THRESHOLD * 100}%, ` +
      `then re-run: arcforge eval preflight ${name}`
    );
  }

  // The gate must affirmatively see verdict === 'PASS'. Treating "anything
  // not BLOCK" as cleared would let a corrupted or hand-edited preflight
  // file (e.g. verdict: "BLOCKED" typo, "MAYBE", missing field) bypass the
  // gate silently. Fail closed instead.
  if (record.verdict !== 'PASS') {
    return (
      `Preflight record for "${name}" has unexpected verdict "${record.verdict}". ` +
      `Re-run: arcforge eval preflight ${name}`
    );
  }

  return null;
}

/**
 * Explain a missing preflight record: name the conditions this run needs, any
 * conditions the same scenario and model were preflighted under instead, and
 * the exact command that produces the record the gate is looking for.
 */
function missingPreflightMessage(name, projectRoot, { hash, model, conditions }) {
  const modelLabel = model || 'default';
  const flags = [
    model ? `--model ${model}` : '',
    conditions.maxTurns != null ? `--max-turns ${conditions.maxTurns}` : '',
    conditions.pluginDir ? `--plugin-dir ${conditions.pluginDir}` : '',
    conditions.effort ? `--effort ${conditions.effort}` : '',
    conditions.baselineSkillHash
      ? `--baseline-skill-file ${conditions.baselineSkillFile || '<path>'}`
      : '',
    conditions.baselineSkillHash && conditions.stageSkillFiles ? '--stage-skill-files' : '',
  ].filter(Boolean);
  // The ceiling is set by environment, not a flag, so the command carries it.
  const ceilingEnv =
    conditions.trialTimeoutMs && conditions.trialTimeoutMs !== DEFAULT_TRIAL_TIMEOUT_MS
      ? `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=${conditions.trialTimeoutMs} `
      : '';
  const prefix = preflightFilename(hash, model).replace(/\.json$/, '');
  const dir = path.join(projectRoot, PREFLIGHT_DIR);
  const recorded = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter(
      (f) =>
        f === `${prefix}.json` ||
        (['-t', '-e', '-c', '-b'].some((s) => f.startsWith(`${prefix}${s}`)) &&
          f.endsWith('.json')),
    )
    .map((f) => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return describeConditions({
          maxTurns: r.max_turns ?? undefined,
          pluginDir: r.plugin_dir,
          effort: r.effort,
          trialTimeoutMs: r.trial_timeout_ms,
          baselineSkillHash: r.baseline_skill_hash,
          stageSkillFiles: r.stage_skill_files,
        });
      } catch {
        return null; // unreadable record: it cannot say what it ran under
      }
    })
    .filter(Boolean);
  const mismatch =
    recorded.length > 0
      ? `A preflight exists for this scenario and model, recorded under: ${recorded.join('; ')}.\n`
      : '';
  return (
    `No preflight record found for scenario "${name}" (hash: ${hash}, model: ${modelLabel}, ${describeConditions(conditions)}).\n` +
    mismatch +
    `Run: ${ceilingEnv}arcforge eval preflight ${[name, ...flags].join(' ')}\n` +
    `Preflight is per-(scenario, model, effort, turn budget, plugin dir, ceiling, baseline text) — baseline pass rate depends ` +
    `on each, so a PASS under one does not unblock A/B runs under another.`
  );
}

module.exports = {
  computeScenarioHash,
  preflightFilename,
  // Exported so other CLI dispatchers (e.g. `arcforge eval lint`) share one
  // resolver. Lookup-by-`# Eval:` name with filename fallback is the
  // semantics `arcforge eval run` / `arcforge eval ab` already use; centralizing
  // here keeps the lint command from re-implementing a hardcoded-filename
  // pattern.
  resolveScenarioFile,
  runPreflight,
  gradePreflightTrial,
  checkPreflightGate,
  shouldSkipPreflightGate,
  PREFLIGHT_DIR,
  CEILING_THRESHOLD,
  PREFLIGHT_K,
  PREFLIGHT_LABEL,
};
