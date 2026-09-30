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

  if (interleave) {
    for (let t = 1; t <= k; t++) {
      baseline.push(executeAndGradeTrial(baseScenario, gradeScenario, t, k, bOpts));
      treatment.push(executeAndGradeTrial(treatScenario, gradeScenario, t, k, tOpts));
    }
  } else {
    for (let t = 1; t <= k; t++) {
      baseline.push(executeAndGradeTrial(baseScenario, gradeScenario, t, k, bOpts));
    }
    for (let t = 1; t <= k; t++) {
      treatment.push(executeAndGradeTrial(treatScenario, gradeScenario, t, k, tOpts));
    }
  }

  return { baseline, treatment, delta: stats.computeDelta(baseline, treatment) };
}

/**
 * Run a skill eval as A/B comparison: baseline (without skill) vs treatment (with skill).
 * Both conditions run in isolated environments; the treatment prepends skill instruction.
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
  resolveTrialTimeoutMs(); // refuse a bad ceiling before any trial spawns (B-10)
  const isolationSettings = buildIsolationSettings();

  const treatmentScenario = {
    ...scenario,
    context: skillInstruction ? `${skillInstruction}\n\n${scenario.context}` : scenario.context,
  };

  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    model,
    effort,
    runId,
  };
  const tOpts = {
    projectRoot,
    label: 'treatment',
    onTrialComplete,
    isolationSettings,
    model,
    effort,
    runId,
    ...(pluginDir ? { pluginDir, isolated: false } : {}),
    ...(maxTurns != null ? { maxTurns } : {}),
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
  const isolationSettings = buildIsolationSettings();
  const resolvedPluginDir = pluginDir || scenario.pluginDir;
  // Cache semi-isolation settings once (avoids spawning `claude plugin list` per trial)
  const semiSettings = resolvedPluginDir
    ? buildIsolationSettings({ excludeClaudeMd: false })
    : undefined;

  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    isolated: true,
    model,
    effort,
    runId,
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
    ...(maxTurns != null ? { maxTurns } : {}),
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
  buildPluginDirSettings: () => buildIsolationSettings({ excludeClaudeMd: false }),
  parseStreamJsonOutput,
  parseActionsFromTranscript,
  resolveMaxTurns,
  runTrial,
  buildTrialPrompt,
  resolveTrialTimeoutMs,
  DEFAULT_TRIAL_TIMEOUT_MS,
  executeAndGradeTrial,
  runSkillEval,
  runWorkflowEval,
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
