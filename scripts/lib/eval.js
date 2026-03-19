/**
 * eval.js - Eval harness for measuring skill/agent/workflow effectiveness
 *
 * Orchestrates eval runs: loads scenarios, spawns trial sessions,
 * tracks results as JSONL, and computes pass@k metrics.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execCommand, ensureDir, getTimestamp, sanitizeFilename } = require('./utils');
const stats = require('./eval-stats');
const graders = require('./eval-graders');

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
 * @property {string} [transcript] - Path to transcript file
 * @property {string} [trialDir] - Isolated temp directory used for this trial
 * @property {string} [error] - Error message if failed
 */

const EVALS_DIR = 'evals';
const SCENARIOS_DIR = path.join(EVALS_DIR, 'scenarios');
const RESULTS_DIR = path.join(EVALS_DIR, 'results');
const BENCHMARKS_DIR = path.join(EVALS_DIR, 'benchmarks');

/**
 * Parse an eval scenario from a markdown file
 * @param {string} filePath - Path to scenario markdown file
 * @returns {EvalScenario} Parsed scenario
 */
function parseScenario(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = {};
  let currentSection = null;
  const lines = content.split('\n');

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  const nameMatch = content.match(/^#\s+Eval:\s*(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');

  const assertions = (sections.assertions || [])
    .filter((line) => line.match(/^-\s*\[[ x]?\]/))
    .map((line) => line.replace(/^-\s*\[[ x]?\]\s*/, '').trim());

  const trialsRaw = (sections.trials || []).join('\n').trim();
  const trials = trialsRaw ? parseInt(trialsRaw, 10) : undefined;
  const version = (sections.version || []).join('\n').trim();

  return {
    name,
    scope: (sections.scope || []).join('\n').trim() || 'skill',
    scenario: (sections.scenario || []).join('\n').trim(),
    context: (sections.context || []).join('\n').trim(),
    assertions,
    grader: (sections.grader || []).join('\n').trim() || 'code',
    graderConfig: (sections['grader config'] || []).join('\n').trim(),
    setup: (sections.setup || []).join('\n').trim(),
    ...(trials && !Number.isNaN(trials) ? { trials } : {}),
    ...(version ? { version } : {}),
  };
}

/**
 * List all eval scenarios
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} List of scenario file paths
 */
function listScenarios(projectRoot) {
  const scenariosPath = path.join(projectRoot, SCENARIOS_DIR);
  if (!fs.existsSync(scenariosPath)) {
    return [];
  }
  return fs
    .readdirSync(scenariosPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(scenariosPath, f));
}

/**
 * Create an isolated trial directory under the project root.
 * Uses .eval-trials/ (gitignored) to avoid macOS permission dialogs
 * that occur when running from /var/folders/ temp directories.
 * @param {string} evalName - Eval name for prefix
 * @param {number} trialNumber - Trial number
 * @param {string} [projectRoot] - Project root directory
 * @returns {string} Absolute path to trial directory
 */
function createTrialDir(evalName, trialNumber, projectRoot) {
  const base = projectRoot
    ? path.join(projectRoot, '.eval-trials')
    : path.join(process.cwd(), '.eval-trials');
  ensureDir(base);
  const prefix = `${sanitizeFilename(evalName)}-t${trialNumber}-`;
  return fs.mkdtempSync(path.join(base, prefix));
}

/**
 * Clean up a trial directory. Only removes paths inside .eval-trials/ or os.tmpdir().
 * @param {string} [trialDir] - Path to trial directory
 */
function cleanupTrialDir(trialDir) {
  if (!trialDir) return;
  const isEvalTrial = trialDir.includes('.eval-trials');
  const isTmp = trialDir.startsWith(os.tmpdir());
  if (!isEvalTrial && !isTmp) return;
  try {
    fs.rmSync(trialDir, { recursive: true, force: true });
  } catch {
    /* silent — trial dir cleanup is best-effort */
  }
}

/**
 * Run a setup command in the trial directory.
 * Injects PROJECT_ROOT env var so setup can reference project files.
 * @param {string} setupCommand - Shell command to execute
 * @param {string} trialDir - Working directory for setup
 * @param {string} [projectRoot] - Project root for $PROJECT_ROOT env var
 */
function runSetup(setupCommand, trialDir, projectRoot) {
  const env = { ...process.env };
  if (projectRoot) env.PROJECT_ROOT = projectRoot;
  const { exitCode, stderr } = execCommand('sh', ['-c', setupCommand], {
    cwd: trialDir,
    timeout: 30000,
    env,
  });
  if (exitCode !== 0) {
    throw new Error(`Setup failed: ${stderr}`);
  }
}

/**
 * Write isolation settings to a trial directory.
 * Disables all user plugins so trials run in a clean context.
 * @param {string} trialDir - Path to trial temp directory
 * @param {string} [cachedSettings] - Pre-built settings JSON (avoids repeated plugin list calls)
 */
function writeIsolationSettings(trialDir, cachedSettings) {
  const claudeDir = path.join(trialDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const settings = cachedSettings || buildIsolationSettings();
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), settings);
}

/**
 * Build isolation settings JSON string (cached for reuse across trials).
 * Queries installed plugins and generates settings to disable all of them.
 * Returns empty settings if claude CLI is unavailable (e.g., in tests).
 * @returns {string} JSON string for .claude/settings.json
 */
function buildIsolationSettings() {
  try {
    const { stdout, exitCode } = execCommand('claude', ['plugin', 'list', '--json'], {
      timeout: 10000,
    });
    if (exitCode !== 0 || !stdout) return '{}';
    const plugins = JSON.parse(stdout);
    if (!Array.isArray(plugins)) return '{}';
    const disabled = {};
    for (const p of plugins) disabled[p.id] = false;
    return JSON.stringify({ enabledPlugins: disabled });
  } catch {
    return '{}';
  }
}

/**
 * Run a single eval trial by spawning a Claude session.
 * Runs in a temp directory for workspace safety. When isolated (default),
 * plugins are disabled and MCP servers stripped. When not isolated,
 * the agent has access to the full toolkit (plugins, MCP, skills, hooks).
 * @param {EvalScenario} scenario - The eval scenario
 * @param {number} trialNumber - Trial number (1-indexed)
 * @param {number} totalTrials - Total number of trials (k)
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root (for transcript storage + code grading)
 * @param {string} [options.isolationSettings] - Cached isolation settings JSON
 * @param {boolean} [options.isolated=true] - Whether to disable plugins and MCP
 * @returns {TrialResult} Trial result
 */
function runTrial(scenario, trialNumber, totalTrials, options = {}) {
  const { projectRoot = process.cwd(), label, isolationSettings, isolated = true } = options;
  const timestamp = getTimestamp();

  // Always run in trial dir for workspace safety
  const trialDir = createTrialDir(scenario.name, trialNumber, projectRoot);
  if (scenario.setup) runSetup(scenario.setup, trialDir, projectRoot);
  if (isolated) writeIsolationSettings(trialDir, isolationSettings);

  const prompt = buildTrialPrompt(scenario);

  const claudeArgs = [
    '-p',
    '--output-format',
    'text',
    '--no-session-persistence',
    '--disable-slash-commands',
  ];
  if (isolated) claudeArgs.push('--strict-mcp-config');

  const result = execCommand('claude', claudeArgs, {
    input: prompt,
    cwd: trialDir,
    timeout: 300000,
  });

  const evalName = label ? `${scenario.name}-${label}` : scenario.name;
  const fullOutput = result.exitCode === 0 ? result.stdout : result.stderr || '';
  const transcript = saveTranscript(evalName, trialNumber, fullOutput, projectRoot);

  const base = {
    eval: evalName,
    trial: trialNumber,
    k: totalTrials,
    passed: false, // Will be set by grader
    grader: scenario.grader,
    score: 0,
    timestamp,
    transcript,
    trialDir,
  };
  return result.exitCode === 0
    ? { ...base, output: result.stdout }
    : { ...base, error: result.stderr };
}

/**
 * Save full trial output to a transcript file
 * @param {string} evalName - Eval name (may include label suffix)
 * @param {number} trialNumber - Trial number
 * @param {string} output - Full output text
 * @param {string} projectRoot - Project root directory
 * @returns {string} Path to transcript file
 */
function saveTranscript(evalName, trialNumber, output, projectRoot) {
  const transcriptsPath = path.join(projectRoot, RESULTS_DIR, 'transcripts');
  ensureDir(transcriptsPath);
  const fileName = `${sanitizeFilename(evalName)}-trial-${trialNumber}.txt`;
  const filePath = path.join(transcriptsPath, fileName);
  fs.writeFileSync(filePath, output);
  return filePath;
}

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
  const { projectRoot, label, onTrialComplete, isolationSettings, isolated } = opts;
  const result = runTrial(trialScenario, trialNumber, k, {
    projectRoot,
    label,
    isolationSettings,
    isolated,
  });
  try {
    const graded = graders.gradeTrialResult(result, gradeScenario, projectRoot);
    const versioned = gradeScenario.version
      ? { ...graded, version: gradeScenario.version }
      : graded;
    appendResult(versioned, projectRoot);
    if (onTrialComplete) onTrialComplete(label, trialNumber, versioned);
    return versioned;
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
  } = options;
  const isolationSettings = buildIsolationSettings();

  const treatmentScenario = {
    ...scenario,
    context: skillInstruction ? `${skillInstruction}\n\n${scenario.context}` : scenario.context,
  };

  const bOpts = { projectRoot, label: 'baseline', onTrialComplete, isolationSettings };
  const tOpts = { projectRoot, label: 'treatment', onTrialComplete, isolationSettings };
  return runAbTrials(scenario, treatmentScenario, scenario, k, bOpts, tOpts, interleave);
}

/**
 * Run a workflow eval as A/B comparison: isolated baseline vs non-isolated treatment.
 * Both conditions use identical prompts; the treatment differs by having the full
 * arcforge toolkit available (plugins, MCP, skills, hooks).
 * @param {EvalScenario} scenario - Scenario with scope='workflow'
 * @param {number} k - Number of trials per condition
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @param {boolean} [options.interleave=false] - Alternate baseline/treatment trials
 * @param {Function} [options.onTrialComplete] - Callback per trial
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runWorkflowEval(scenario, k, options = {}) {
  const { projectRoot = process.cwd(), onTrialComplete, interleave = false } = options;
  const isolationSettings = buildIsolationSettings();

  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    isolated: true,
  };
  const tOpts = { projectRoot, label: 'treatment', onTrialComplete, isolated: false };
  return runAbTrials(scenario, scenario, scenario, k, bOpts, tOpts, interleave);
}

/**
 * Build a prompt for a trial run
 * @param {EvalScenario} scenario - The eval scenario
 * @returns {string} Prompt text
 */
function buildTrialPrompt(scenario) {
  const parts = [];

  if (scenario.context) {
    parts.push(`## Context\n${scenario.context}`);
  }

  parts.push(`## Task\n${scenario.scenario}`);

  if (scenario.assertions.length > 0) {
    parts.push(`## Requirements\n${scenario.assertions.map((a) => `- ${a}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Append a trial result to the results JSONL file
 * @param {TrialResult} result - Trial result
 * @param {string} projectRoot - Project root directory
 */
function appendResult(result, projectRoot) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);
  ensureDir(resultsPath);

  // Truncate output for storage only (grading already used full output)
  const maxStorageLen = 50000;
  const storable =
    result.output && result.output.length > maxStorageLen
      ? { ...result, output: `${result.output.slice(0, maxStorageLen)}\n[truncated for storage]` }
      : result;

  const dateStr = storable.timestamp.split('T')[0];
  const fileName = `${dateStr}-${sanitizeFilename(storable.eval)}.jsonl`;
  const filePath = path.join(resultsPath, fileName);

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
  const suffix = `-${evalName}.jsonl`;
  const sinceDate = options.since ? options.since.slice(0, 10) : undefined;
  const files = fs.readdirSync(resultsPath).filter((f) => {
    if (!f.endsWith(suffix)) return false;
    const prefix = f.slice(0, f.length - suffix.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return false;
    // Skip files whose date is entirely before the since filter
    if (sinceDate && prefix < sinceDate) return false;
    return true;
  });

  for (const file of files) {
    const content = fs.readFileSync(path.join(resultsPath, file), 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      results.push(JSON.parse(line));
    }
  }

  if (!options.version && !options.since) return results;
  return results.filter((r) => {
    if (options.version && (r.version || '1') !== options.version) return false;
    if (options.since && r.timestamp < options.since) return false;
    return true;
  });
}

/**
 * Generate a benchmark summary from results
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Benchmark data
 */
function generateBenchmark(projectRoot) {
  const scenarioFiles = listScenarios(projectRoot);
  const benchmarks = {};

  for (const file of scenarioFiles) {
    const scenario = parseScenario(file);
    const results = loadResults(scenario.name, projectRoot, {
      version: scenario.version,
    });

    if (results.length === 0) continue;

    const s = stats.statsFromResults(results);
    const warning = stats.confidenceWarning(results);
    benchmarks[scenario.name] = {
      scope: scenario.scope,
      trials: s.count,
      pass_rate: s.passRate,
      avg_score: s.avg,
      stddev: s.stddev,
      ci95: s.ci95,
      pass_at_k: stats.passAtK(results),
      pass_all_k: stats.passAllK(results),
      last_run: results[results.length - 1].timestamp,
      ...(warning ? { warning } : {}),
    };
  }

  const benchmark = {
    generated: getTimestamp(),
    evals: benchmarks,
  };

  const benchmarkPath = path.join(projectRoot, BENCHMARKS_DIR);
  ensureDir(benchmarkPath);
  const json = `${JSON.stringify(benchmark, null, 2)}\n`;
  fs.writeFileSync(path.join(benchmarkPath, 'latest.json'), json);

  // Write timestamped snapshot for history (same-day runs overwrite)
  const dateStr = benchmark.generated.split('T')[0];
  fs.writeFileSync(path.join(benchmarkPath, `${dateStr}.json`), json);

  return benchmark;
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

/**
 * Compare baseline vs treatment results, routing by grader type.
 * Code-graded scenarios get fast programmatic delta.
 * Model/human-graded scenarios also get eval-comparator agent analysis.
 * @param {EvalScenario} scenario - Eval scenario
 * @param {TrialResult[]} baseline - Baseline results
 * @param {TrialResult[]} treatment - Treatment results
 * @param {string} projectRoot - Project root directory
 * @returns {{ delta: number, verdict: string, baseline: Object, treatment: Object, modelAnalysis?: Object }}
 */
function compareResults(scenario, baseline, treatment, projectRoot) {
  const bStats = stats.statsFromResults(baseline);
  const tStats = stats.statsFromResults(treatment);
  const delta = stats.computeDelta(baseline, treatment);
  const deltaCi = stats.ciForDelta(baseline, treatment);
  const baselineWarning = stats.baselineVarianceWarning(baseline, {
    avg: bStats.avg,
    stddev: bStats.stddev,
  });
  const result = {
    delta,
    deltaCi,
    verdict: stats.verdictFromDeltaCI(baseline, treatment),
    baseline: bStats,
    treatment: tStats,
    ...(baselineWarning ? { baselineWarning } : {}),
  };

  if (scenario.grader !== 'code') {
    const modelAnalysis = graders.compareWithModel(scenario, baseline, treatment, projectRoot);
    if (modelAnalysis) result.modelAnalysis = modelAnalysis;
  }

  return result;
}

module.exports = {
  // Orchestration
  parseScenario,
  listScenarios,
  createTrialDir,
  cleanupTrialDir,
  runSetup,
  writeIsolationSettings,
  buildIsolationSettings,
  runTrial,
  buildTrialPrompt,
  executeAndGradeTrial,
  runSkillEval,
  runWorkflowEval,
  saveTranscript,
  appendResult,
  loadResults,
  generateBenchmark,
  compareResults,
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
