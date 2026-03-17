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
const { execCommand, ensureDir, getTimestamp } = require('./utils');

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

  return {
    name,
    scope: (sections.scope || []).join('\n').trim() || 'skill',
    scenario: (sections.scenario || []).join('\n').trim(),
    context: (sections.context || []).join('\n').trim(),
    assertions,
    grader: (sections.grader || []).join('\n').trim() || 'code',
    graderConfig: (sections['grader config'] || []).join('\n').trim(),
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
 * Run a single eval trial by spawning a Claude session
 * @param {EvalScenario} scenario - The eval scenario
 * @param {number} trialNumber - Trial number (1-indexed)
 * @param {number} totalTrials - Total number of trials (k)
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @returns {TrialResult} Trial result
 */
function runTrial(scenario, trialNumber, totalTrials, options = {}) {
  const { projectRoot = process.cwd() } = options;
  const timestamp = getTimestamp();

  const prompt = buildTrialPrompt(scenario);

  const result = execCommand('claude', ['-p', '--output-format', 'text'], {
    input: prompt,
    cwd: projectRoot,
    timeout: 300000, // 5 minute timeout per trial
  });

  if (result.exitCode === 0) {
    return {
      eval: scenario.name,
      trial: trialNumber,
      k: totalTrials,
      passed: false, // Will be set by grader
      grader: scenario.grader,
      score: 0,
      timestamp,
      output: result.stdout.slice(0, 10000), // Truncate for storage
    };
  }
  return {
    eval: scenario.name,
    trial: trialNumber,
    k: totalTrials,
    passed: false,
    grader: scenario.grader,
    score: 0,
    timestamp,
    error: result.stderr,
  };
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
 * Grade a trial result using a code grader (test command).
 * Accepts test command as array (preferred) or space-separated string.
 * Returns a new result object (does not mutate input).
 * @param {TrialResult} result - Trial result to grade
 * @param {string|string[]} testCommand - Test command to run
 * @param {string} projectRoot - Project root directory
 * @returns {TrialResult} New result with grade
 */
function gradeWithCode(result, testCommand, projectRoot) {
  const [cmd, ...args] = Array.isArray(testCommand) ? testCommand : testCommand.split(' ');
  const { exitCode } = execCommand(cmd, args, { cwd: projectRoot });
  return { ...result, passed: exitCode === 0, score: exitCode === 0 ? 1.0 : 0.0 };
}

/**
 * Append a trial result to the results JSONL file
 * @param {TrialResult} result - Trial result
 * @param {string} projectRoot - Project root directory
 */
function appendResult(result, projectRoot) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);
  ensureDir(resultsPath);

  const dateStr = result.timestamp.split('T')[0];
  const fileName = `${dateStr}-${result.eval}.jsonl`;
  const filePath = path.join(resultsPath, fileName);

  fs.appendFileSync(filePath, `${JSON.stringify(result)}\n`);
}

/**
 * Load results for a specific eval.
 * Uses exact segment match to avoid cross-eval contamination.
 * @param {string} evalName - Eval scenario name
 * @param {string} projectRoot - Project root directory
 * @returns {TrialResult[]} All results for this eval
 */
function loadResults(evalName, projectRoot) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);
  if (!fs.existsSync(resultsPath)) {
    return [];
  }

  const results = [];
  const suffix = `-${evalName}.jsonl`;
  const files = fs.readdirSync(resultsPath).filter((f) => {
    if (!f.endsWith(suffix)) return false;
    const prefix = f.slice(0, f.length - suffix.length);
    return /^\d{4}-\d{2}-\d{2}$/.test(prefix);
  });

  for (const file of files) {
    const content = fs.readFileSync(path.join(resultsPath, file), 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      results.push(JSON.parse(line));
    }
  }

  return results;
}

/**
 * Compute pass@k metric: at least 1 success in k trials
 * @param {TrialResult[]} results - Trial results
 * @returns {boolean} Whether pass@k is satisfied
 */
function passAtK(results) {
  return results.some((r) => r.passed);
}

/**
 * Compute pass^k metric: all k trials succeed
 * @param {TrialResult[]} results - Trial results
 * @returns {boolean} Whether pass^k is satisfied
 */
function passAllK(results) {
  return results.length > 0 && results.every((r) => r.passed);
}

/**
 * Compute delta between baseline and treatment results
 * @param {TrialResult[]} baseline - Baseline results
 * @param {TrialResult[]} treatment - Treatment results
 * @returns {number} Delta (treatment avg score - baseline avg score)
 */
function computeDelta(baseline, treatment) {
  if (baseline.length === 0 || treatment.length === 0) {
    return 0;
  }
  const baseAvg = baseline.reduce((sum, r) => sum + r.score, 0) / baseline.length;
  const treatAvg = treatment.reduce((sum, r) => sum + r.score, 0) / treatment.length;
  return treatAvg - baseAvg;
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
    const results = loadResults(scenario.name, projectRoot);

    if (results.length === 0) continue;

    const passRate = results.filter((r) => r.passed).length / results.length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    benchmarks[scenario.name] = {
      scope: scenario.scope,
      trials: results.length,
      pass_rate: Math.round(passRate * 100) / 100,
      avg_score: Math.round(avgScore * 100) / 100,
      pass_at_k: passAtK(results),
      pass_all_k: passAllK(results),
      last_run: results[results.length - 1].timestamp,
    };
  }

  const benchmark = {
    generated: getTimestamp(),
    evals: benchmarks,
  };

  const benchmarkPath = path.join(projectRoot, BENCHMARKS_DIR);
  ensureDir(benchmarkPath);
  fs.writeFileSync(
    path.join(benchmarkPath, 'latest.json'),
    `${JSON.stringify(benchmark, null, 2)}\n`,
  );

  return benchmark;
}

/**
 * Get verdict for an eval based on pass rate
 * @param {TrialResult[]} results - Trial results
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function getVerdict(results) {
  if (results.length === 0) return 'BLOCKED';
  const passRate = results.filter((r) => r.passed).length / results.length;
  if (passRate >= 1.0) return 'SHIP';
  if (passRate >= 0.6) return 'NEEDS WORK';
  return 'BLOCKED';
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
  parseScenario,
  listScenarios,
  runTrial,
  buildTrialPrompt,
  gradeWithCode,
  appendResult,
  loadResults,
  passAtK,
  passAllK,
  computeDelta,
  generateBenchmark,
  getVerdict,
  ensureEvalsDir,
  EVALS_DIR,
  SCENARIOS_DIR,
  RESULTS_DIR,
  BENCHMARKS_DIR,
};
