/**
 * eval.js - Eval harness for measuring skill/agent/workflow effectiveness
 *
 * Orchestrates eval runs: loads scenarios, spawns trial sessions,
 * tracks results as JSONL, and computes pass@k metrics.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ensureDir } = require('./utils');
const stats = require('./eval-stats');
const graders = require('./eval-graders');
const {
  SCENARIOS_DIR,
  normalizeClaimType,
  inferClaimType,
  compactDate,
  parseEvalName,
  resolveMaxTurns,
  parseScenario,
  listScenarios,
  findScenario,
} = require('./eval-scenario');
const {
  createTrialDir,
  cleanupTrialDir,
  runSetup,
  writeIsolationSettings,
  buildIsolationSettings,
} = require('./eval-trial-env');
const { parseStreamJsonOutput, parseActionsFromTranscript } = require('./eval-transcript');
const {
  DEFAULT_TRIAL_TIMEOUT_MS,
  resolveTrialTimeoutMs,
  runTrial,
  saveTranscript,
  buildTrialPrompt,
  stopIfTrialWroteRepo,
} = require('./eval-trial');

/**
 * Eval scenario parsed from a markdown file
 * @typedef {Object} EvalScenario
 * @property {string} name - Eval name
 * @property {string} scope - 'skill' | 'agent' | 'workflow'
 * @property {string} scenario - The prompt/task to run
 * @property {string} context - Setup context
 * @property {string[]} assertions - List of assertions to verify
 * @property {string} grader - 'code' | 'model' | 'human'
 * @property {string} graderConfig - Grader-specific configuration
 * @property {string} setup - Shell command to prepare trial directory (empty = use projectRoot)
 * @property {string} [preflight] - Optional preflight policy ('skip' to bypass A/B preflight gate)
 * @property {string} [verdictPolicy] - Optional A/B verdict policy ('non-regression' to judge treatment pass/fail instead of delta)
 * @property {string} [claimType] - Evidence claim type ('non-regression' | 'discriminative-lift' | 'self-improvement-smoke' | 'infra')
 */

/**
 * Single trial result
 * @typedef {Object} TrialResult
 * @property {string} eval - Eval scenario name
 * @property {number} trial - Trial number
 * @property {number} k - Total trials planned
 * @property {boolean} passed - Whether this trial passed
 * @property {string} grader - Grader type used
 * @property {number} score - Score from 0.0 to 1.0
 * @property {string} timestamp - ISO timestamp
 * @property {number|null} duration_ms - Wall-clock duration of the trial in ms (null if unavailable)
 * @property {number|null} api_duration_ms - Duration the CLI reported in its stream-json result event (null if the trial produced no result event)
 * @property {number|null} input_tokens - Input tokens used by the trial agent (null if unavailable)
 * @property {number|null} output_tokens - Output tokens used by the trial agent (null if unavailable)
 * @property {number} [trialTimeoutMs] - Per-trial ceiling (ms) the trial ran under; absent on rows written before 6.1.1
 * @property {string} [transcript] - Path to transcript file
 * @property {string} [trialDir] - Isolated temp directory used for this trial
 * @property {string} [error] - Error message if failed
 * @property {string} [errorType] - Machine-readable error category (e.g., 'model_grader_failed')
 * @property {boolean} [gradeError] - True if the grader failed to produce a score
 * @property {boolean} [infraError] - True if the trial runner failed to capture output
 * @property {string} [repoCheck] - 'skipped' when the tree was too large for the repository-write check
 * @property {string} [model] - Model flag the trial ran with ('default' when none was passed)
 * @property {string} [effort] - Effort flag the trial ran with ('default' when none was passed)
 * @property {number[]} [assertionScores] - Per-assertion scores (0.0-1.0)
 * @property {string[]} [evidence] - Per-assertion evidence notes from grader
 * @property {number[][]} [blockRefs] - Per-assertion transcript block references (1-indexed)
 * @property {Array<{type: string, name?: string, args?: string, content?: string, index: number}>} [actions] - Parsed actions from transcript
 */

const EVALS_DIR = 'evals';
const RESULTS_DIR = path.join(EVALS_DIR, 'results');
const BENCHMARKS_DIR = path.join(EVALS_DIR, 'benchmarks');

/**
 * Execute a single trial: run → grade → append → callback → cleanup.
 * Shared helper for both sequential and interleaved A/B modes.
 * @param {EvalScenario} trialScenario - Scenario to run (may have skill instruction in context)
 * @param {EvalScenario} gradeScenario - Original scenario for grading (without skill instruction)
 * @param {number} trialNumber - Trial number (1-indexed)
 * @param {number} k - Total trials per condition
 * @param {Object} opts - { projectRoot, label, onTrialComplete }
 * @returns {TrialResult} Graded result
 */
function executeAndGradeTrial(trialScenario, gradeScenario, trialNumber, k, opts) {
  const {
    projectRoot,
    label,
    onTrialComplete,
    isolationSettings,
    isolated,
    model,
    effort,
    runId,
    pluginDir,
    maxTurns,
    skipPermissions,
    watchRoots,
  } = opts;
  const result = runTrial(trialScenario, trialNumber, k, {
    projectRoot,
    label,
    isolationSettings,
    isolated,
    model,
    effort,
    runId,
    pluginDir,
    maxTurns,
    skipPermissions,
    watchRoots,
  });
  // Every row carries the scenario version — infraError rows too, or a
  // version-scoped read drops them and error_trials undercounts (B-8).
  const stamp = (row) => (gradeScenario.version ? { ...row, version: gradeScenario.version } : row);
  try {
    const recorded = result.infraError
      ? stamp(result)
      : stamp(graders.gradeTrialResult(result, gradeScenario, projectRoot, result.actions));
    appendResult(recorded, projectRoot);
    if (onTrialComplete) onTrialComplete(label, trialNumber, recorded);
    return recorded;
  } finally {
    cleanupTrialDir(result.trialDir);
  }
}

/**
 * Run an A/B eval: execute k trials for each condition, grade, compute delta.
 * Shared by both skill and workflow evals — only the options differ.
 * @param {EvalScenario} baseScenario - Scenario for baseline trials
 * @param {EvalScenario} treatScenario - Scenario for treatment trials (may differ from base)
 * @param {EvalScenario} gradeScenario - Original scenario for grading
 * @param {number} k - Trials per condition
 * @param {Object} bOpts - Baseline trial options
 * @param {Object} tOpts - Treatment trial options
 * @param {boolean} interleave - Alternate baseline/treatment trials
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runAbTrials(baseScenario, treatScenario, gradeScenario, k, bOpts, tOpts, interleave) {
  const baseline = [];
  const treatment = [];

  // A trial that wrote outside its directory ends the run (stopIfTrialWroteRepo).
  const runArm = (arm, scenario, t, opts) => {
    const row = executeAndGradeTrial(scenario, gradeScenario, t, k, opts);
    arm.push(row);
    stopIfTrialWroteRepo(row, `${opts.label} trial ${t}`);
  };
  if (interleave) {
    for (let t = 1; t <= k; t++) {
      runArm(baseline, baseScenario, t, bOpts);
      runArm(treatment, treatScenario, t, tOpts);
    }
  } else {
    for (let t = 1; t <= k; t++) runArm(baseline, baseScenario, t, bOpts);
    for (let t = 1; t <= k; t++) runArm(treatment, treatScenario, t, tOpts);
  }

  return { baseline, treatment, delta: stats.computeDelta(baseline, treatment) };
}

/**
 * Options both arms of a comparison must share so their claude argv differ only
 * by the injection: one turn budget (resolved as if the plugin were loaded, so
 * the baseline does not run unbounded beside a 10-turn treatment) and one
 * permission mode. Both arms also watch the plugin root for writes: a baseline
 * that edits the plugin would otherwise go unseen, and the treatment would then
 * load the edited plugin. Watching loads nothing.
 * @param {EvalScenario} scenario
 * @param {{ maxTurns?: number, pluginDir?: string }} opts
 * @returns {{ maxTurns?: number, skipPermissions: boolean, watchRoots: string[] }}
 */
function sharedArmOptions(scenario, { maxTurns, pluginDir }) {
  const resolved = resolveMaxTurns({ maxTurns, scenarioMaxTurns: scenario.maxTurns, pluginDir });
  return {
    ...(resolved != null ? { maxTurns: resolved } : {}),
    skipPermissions: Boolean(pluginDir),
    watchRoots: pluginDir ? [pluginDir] : [],
  };
}

/**
 * Run a skill eval as A/B comparison: baseline (without skill) vs treatment (with skill).
 * Both arms run isolated; the treatment prepends the skill body. There is no
 * plugin dir in skill scope: a plugin-routed comparison is a workflow (B-1), and
 * a single skill's trigger rate is `claude plugin eval`'s question (B-11).
 * @param {EvalScenario} scenario - Scenario with scope='skill'
 * @param {number} k - Number of trials per condition
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @param {string} [options.skillInstruction] - Instruction to prepend for treatment trials
 * @param {boolean} [options.interleave=false] - Alternate baseline/treatment trials
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runSkillEval(scenario, k, options = {}) {
  const {
    projectRoot = process.cwd(),
    skillInstruction,
    onTrialComplete,
    interleave = false,
    model,
    effort,
    runId,
    pluginDir,
    maxTurns,
  } = options;
  if (pluginDir) {
    // #197: no run injects a skill body while also loading the plugin.
    throw new Error(
      'runSkillEval: skill scope takes no plugin dir; a plugin-routed comparison is workflow scope (B-1)',
    );
  }
  resolveTrialTimeoutMs(); // refuse a bad ceiling before any trial spawns (B-10)
  const isolationSettings = buildIsolationSettings();

  const treatmentScenario = {
    ...scenario,
    context: skillInstruction ? `${skillInstruction}\n\n${scenario.context}` : scenario.context,
  };

  const shared = sharedArmOptions(scenario, { maxTurns });
  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    model,
    effort,
    runId,
    ...shared,
  };
  const tOpts = {
    projectRoot,
    label: 'treatment',
    onTrialComplete,
    isolationSettings,
    model,
    effort,
    runId,
    ...shared,
  };
  return runAbTrials(scenario, treatmentScenario, scenario, k, bOpts, tOpts, interleave);
}

/**
 * Run a workflow eval as A/B comparison: isolated baseline vs semi-isolated/non-isolated treatment.
 * Baseline always runs fully isolated. Treatment uses semi-isolated mode with --plugin-dir
 * when the scenario has a pluginDir field; otherwise falls back to non-isolated mode.
 * @param {EvalScenario} scenario - Scenario with scope='workflow'
 * @param {number} k - Number of trials per condition
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @param {boolean} [options.interleave=false] - Alternate baseline/treatment trials
 * @param {Function} [options.onTrialComplete] - Callback per trial
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runWorkflowEval(scenario, k, options = {}) {
  const {
    projectRoot = process.cwd(),
    onTrialComplete,
    interleave = false,
    model,
    effort,
    runId,
    pluginDir,
    maxTurns,
  } = options;
  resolveTrialTimeoutMs(); // refuse a bad ceiling before any trial spawns (B-10)
  const resolvedPluginDir = pluginDir || scenario.pluginDir;
  if (!resolvedPluginDir && (!model || !effort)) {
    // A full-toolkit treatment reads the user settings file, which may set a
    // model and effort level the isolated baseline never sees. Explicit flags
    // outrank settings in both arms, so they are the only way to keep parity.
    throw new Error(
      `workflow A/B without a plugin dir runs the treatment on your full user config: pass both --model and --effort so both arms run the same model at the same effort (missing: ${[!model && '--model', !effort && '--effort'].filter(Boolean).join(', ')})`,
    );
  }
  const isolationSettings = buildIsolationSettings();
  // Cache semi-isolation settings once (avoids spawning `claude plugin list` per trial)
  const semiSettings = resolvedPluginDir
    ? buildIsolationSettings({ forPluginDir: true })
    : undefined;

  const shared = sharedArmOptions(scenario, { maxTurns, pluginDir: resolvedPluginDir });
  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    isolated: true,
    model,
    effort,
    runId,
    ...shared,
  };

  const tOpts = {
    projectRoot,
    label: 'treatment',
    onTrialComplete,
    isolated: false,
    model,
    effort,
    runId,
    ...(resolvedPluginDir ? { pluginDir: resolvedPluginDir, isolationSettings: semiSettings } : {}),
    ...shared,
  };
  return runAbTrials(scenario, scenario, scenario, k, bOpts, tOpts, interleave);
}

/**
 * Append a trial result to the results JSONL file
 * @param {TrialResult} result - Trial result
 * @param {string} projectRoot - Project root directory
 */
function appendResult(result, projectRoot) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);

  // Truncate output for storage only (grading already used full output)
  const maxStorageLen = 50000;
  const storable =
    result.output && result.output.length > maxStorageLen
      ? { ...result, output: `${result.output.slice(0, maxStorageLen)}\n[truncated for storage]` }
      : result;

  const { scenarioName, condition } = parseEvalName(storable.eval);
  const runId = storable.runId || compactDate(storable.timestamp);
  const runDir = path.join(resultsPath, scenarioName, runId);
  ensureDir(runDir);
  const filePath = path.join(runDir, `${condition}.jsonl`);

  fs.appendFileSync(filePath, `${JSON.stringify(storable)}\n`);
}

/**
 * Load results for a specific eval with optional filtering.
 * Uses exact segment match to avoid cross-eval contamination.
 * @param {string} evalName - Eval scenario name
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options] - Filter options
 * @param {string} [options.version] - Only include results matching this version
 * @param {string} [options.since] - Only include results with timestamp >= this ISO date string
 * @returns {TrialResult[]} Filtered results for this eval
 */
function loadResults(evalName, projectRoot, options = {}) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);
  if (!fs.existsSync(resultsPath)) {
    return [];
  }

  const results = [];
  const { scenarioName, condition } = parseEvalName(evalName);
  const sinceCompact = options.since ? options.since.slice(0, 10).replace(/-/g, '') : undefined;

  // ── 1. Hierarchical: results/{scenarioName}/*/{condition}.jsonl ──
  const scenarioDir = path.join(resultsPath, scenarioName);
  let foundHierarchical = false;
  if (fs.existsSync(scenarioDir) && fs.statSync(scenarioDir).isDirectory()) {
    foundHierarchical = true;
    const entries = fs.readdirSync(scenarioDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'transcripts') continue;
      // Date filter on runId prefix (first 8 chars = YYYYMMDD)
      if (sinceCompact && entry.name.slice(0, 8) < sinceCompact) continue;

      const jsonlPath = path.join(scenarioDir, entry.name, `${condition}.jsonl`);
      if (!fs.existsSync(jsonlPath)) continue;

      const content = fs.readFileSync(jsonlPath, 'utf8');
      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          results.push(JSON.parse(line));
        } catch {
          /* skip malformed lines */
        }
      }
    }
  }

  // ── 2. Legacy flat: results/{date}-{evalName}.jsonl ──
  if (!foundHierarchical) {
    const suffix = `-${evalName}.jsonl`;
    const sinceDate = options.since ? options.since.slice(0, 10) : undefined;
    const files = fs.readdirSync(resultsPath).filter((f) => {
      if (!f.endsWith(suffix)) return false;
      const prefix = f.slice(0, f.length - suffix.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return false;
      if (sinceDate && prefix < sinceDate) return false;
      return true;
    });

    for (const file of files) {
      const content = fs.readFileSync(path.join(resultsPath, file), 'utf8');
      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          results.push(JSON.parse(line));
        } catch {
          /* skip malformed lines */
        }
      }
    }
  }

  // ── 3. Apply filters ──
  if (!options.version && !options.since && !options.model) return results;
  return results.filter((r) => {
    if (options.version && (r.version || '1') !== options.version) return false;
    if (options.since && r.timestamp < options.since) return false;
    if (options.model && r.model !== options.model) return false;
    return true;
  });
}

/**
 * Ensure evals directory structure exists
 * @param {string} projectRoot - Project root directory
 */
function ensureEvalsDir(projectRoot) {
  ensureDir(path.join(projectRoot, SCENARIOS_DIR));
  ensureDir(path.join(projectRoot, RESULTS_DIR));
  ensureDir(path.join(projectRoot, BENCHMARKS_DIR));
}

module.exports = {
  // Orchestration
  parseEvalName,
  parseScenario,
  normalizeClaimType,
  inferClaimType,
  compactDate,
  listScenarios,
  findScenario,
  createTrialDir,
  cleanupTrialDir,
  runSetup,
  writeIsolationSettings,
  buildIsolationSettings,
  buildPluginDirSettings: () => buildIsolationSettings({ forPluginDir: true }),
  parseStreamJsonOutput,
  parseActionsFromTranscript,
  resolveMaxTurns,
  runTrial,
  stopIfTrialWroteRepo,
  buildTrialPrompt,
  resolveTrialTimeoutMs,
  DEFAULT_TRIAL_TIMEOUT_MS,
  executeAndGradeTrial,
  runSkillEval,
  runWorkflowEval,
  sharedArmOptions,
  saveTranscript,
  appendResult,
  loadResults,
  ensureEvalsDir,
  // Re-export graders for backward compatibility
  ...graders,
  // Re-export stats for backward compatibility
  ...stats,
  // Constants
  EVALS_DIR,
  SCENARIOS_DIR,
  RESULTS_DIR,
  BENCHMARKS_DIR,
};
