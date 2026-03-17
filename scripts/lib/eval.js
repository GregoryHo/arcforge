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
const { execCommand, ensureDir, getTimestamp, sanitizeFilename } = require('./utils');

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
  const { projectRoot = process.cwd(), label } = options;
  const timestamp = getTimestamp();

  const prompt = buildTrialPrompt(scenario);

  const result = execCommand('claude', ['-p', '--output-format', 'text'], {
    input: prompt,
    cwd: projectRoot,
    timeout: 300000, // 5 minute timeout per trial
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
  };
  return result.exitCode === 0
    ? { ...base, output: result.stdout.slice(0, 10000) }
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
 * Run a skill eval as A/B comparison: baseline (without skill) vs treatment (with skill).
 * Runs k trials for each condition, grades both, computes delta.
 * @param {EvalScenario} scenario - Scenario with scope='skill'
 * @param {number} k - Number of trials per condition
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @param {string} [options.skillInstruction] - Instruction to prepend for treatment trials
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runSkillEval(scenario, k, options = {}) {
  const { projectRoot = process.cwd(), skillInstruction, onTrialComplete } = options;

  // Build treatment scenario with skill instruction prepended to context
  const treatmentScenario = {
    ...scenario,
    context: skillInstruction ? `${skillInstruction}\n\n${scenario.context}` : scenario.context,
  };

  const baseline = [];
  const treatment = [];

  // Run baseline trials (plain scenario, no skill)
  for (let t = 1; t <= k; t++) {
    const result = runTrial(scenario, t, k, { projectRoot, label: 'baseline' });
    const graded = gradeTrialResult(result, scenario, projectRoot);
    appendResult(graded, projectRoot);
    baseline.push(graded);
    if (onTrialComplete) onTrialComplete('baseline', t, graded);
  }

  // Run treatment trials (with skill instruction)
  for (let t = 1; t <= k; t++) {
    const result = runTrial(treatmentScenario, t, k, { projectRoot, label: 'treatment' });
    const graded = gradeTrialResult(result, scenario, projectRoot);
    appendResult(graded, projectRoot);
    treatment.push(graded);
    if (onTrialComplete) onTrialComplete('treatment', t, graded);
  }

  return {
    baseline,
    treatment,
    delta: computeDelta(baseline, treatment),
  };
}

/**
 * Grade a trial result using the appropriate grader for the scenario.
 * @param {TrialResult} result - Trial result to grade
 * @param {EvalScenario} scenario - Scenario with grader config
 * @param {string} projectRoot - Project root directory
 * @returns {TrialResult} Graded result
 */
function gradeTrialResult(result, scenario, projectRoot) {
  if (scenario.grader === 'code') {
    return gradeWithCode(result, scenario.graderConfig, projectRoot);
  }
  if (scenario.grader === 'model') {
    return gradeWithModel(result, scenario, projectRoot);
  }
  // human grader — return ungraded
  return { ...result, grader: 'human-pending' };
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
 * Accepts test command as array (exec directly) or string (run via shell).
 * Returns a new result object (does not mutate input).
 * @param {TrialResult} result - Trial result to grade
 * @param {string|string[]} testCommand - Test command to run
 * @param {string} projectRoot - Project root directory
 * @returns {TrialResult} New result with grade
 */
function gradeWithCode(result, testCommand, projectRoot) {
  const [cmd, args] = Array.isArray(testCommand)
    ? [testCommand[0], testCommand.slice(1)]
    : ['sh', ['-c', testCommand]];
  const { exitCode } = execCommand(cmd, args, { cwd: projectRoot });
  return { ...result, passed: exitCode === 0, score: exitCode === 0 ? 1.0 : 0.0 };
}

/**
 * Grade a trial result using the eval-grader agent (LLM-as-judge).
 * Spawns a Claude session with the rubric and trial output, then
 * parses the structured grade report for per-assertion scores.
 * Returns a new result object (does not mutate input).
 * @param {TrialResult} result - Trial result to grade
 * @param {EvalScenario} scenario - Scenario with assertions and graderConfig
 * @param {string} projectRoot - Project root directory
 * @returns {TrialResult} New result with grade
 */
function gradeWithModel(result, scenario, projectRoot) {
  const rubric = scenario.assertions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const prompt = [
    '## Grading Task',
    '',
    'Grade the following output against these assertions. For each assertion, score 0.0 to 1.0.',
    '',
    '### Assertions',
    rubric,
    '',
    '### Grader Guidelines',
    scenario.graderConfig || 'Score each assertion based on evidence in the output.',
    '',
    '### Output to Grade',
    '```',
    result.output || result.error || '(no output)',
    '```',
    '',
    '### Response Format',
    'Respond with ONLY a JSON object:',
    '```json',
    '{"scores": [0.85, 0.70, ...], "overall": 0.78, "passed": true}',
    '```',
    'Set passed=true if ALL scores >= 0.7.',
  ].join('\n');

  const { stdout, exitCode } = execCommand('claude', ['-p', '--output-format', 'text'], {
    input: prompt,
    cwd: projectRoot,
    timeout: 120000,
  });

  if (exitCode !== 0) {
    return { ...result, passed: false, score: 0, error: 'Model grader failed to respond' };
  }

  const jsonMatch = stdout.match(/\{[\s\S]*?"scores"\s*:[\s\S]*?\}/);
  if (!jsonMatch) {
    return {
      ...result,
      passed: false,
      score: 0,
      error: 'Model grader returned unparseable response',
    };
  }

  try {
    const grade = JSON.parse(jsonMatch[0]);
    const score = typeof grade.overall === 'number' ? grade.overall : 0;
    const passed = typeof grade.passed === 'boolean' ? grade.passed : score >= 0.7;
    return { ...result, passed, score: Math.round(score * 100) / 100 };
  } catch {
    return { ...result, passed: false, score: 0, error: 'Model grader returned invalid JSON' };
  }
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
  const fileName = `${dateStr}-${sanitizeFilename(result.eval)}.jsonl`;
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
 * Compute average score from trial results
 * @param {TrialResult[]} results - Trial results
 * @returns {number} Average score (0.0 to 1.0), or 0 if empty
 */
function avgScore(results) {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.score, 0) / results.length;
}

/**
 * Compute pass rate from trial results
 * @param {TrialResult[]} results - Trial results
 * @returns {number} Pass rate (0.0 to 1.0), or 0 if empty
 */
function passRate(results) {
  if (results.length === 0) return 0;
  return results.filter((r) => r.passed).length / results.length;
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
  return avgScore(treatment) - avgScore(baseline);
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

    benchmarks[scenario.name] = {
      scope: scenario.scope,
      trials: results.length,
      pass_rate: Math.round(passRate(results) * 100) / 100,
      avg_score: Math.round(avgScore(results) * 100) / 100,
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
 * Get verdict from a numeric pass rate
 * @param {number} rate - Pass rate (0.0 to 1.0)
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function verdictFromRate(rate) {
  if (rate >= 1.0) return 'SHIP';
  if (rate >= 0.6) return 'NEEDS WORK';
  return 'BLOCKED';
}

/**
 * Get verdict for an eval based on pass rate
 * @param {TrialResult[]} results - Trial results
 * @returns {'SHIP' | 'NEEDS WORK' | 'BLOCKED'} Verdict
 */
function getVerdict(results) {
  if (results.length === 0) return 'BLOCKED';
  return verdictFromRate(passRate(results));
}

/**
 * Get A/B comparison verdict from a delta value
 * @param {number} delta - Treatment avg score minus baseline avg score
 * @returns {'IMPROVED' | 'INCONCLUSIVE' | 'REGRESSED'} Verdict
 */
function verdictFromDelta(delta) {
  if (delta > 0.15) return 'IMPROVED';
  if (delta >= -0.05) return 'INCONCLUSIVE';
  return 'REGRESSED';
}

/**
 * Prompt a human to grade a trial result via readline.
 * Returns a new result object (does not mutate input).
 * @param {TrialResult} result - Trial result to grade
 * @param {readline.Interface} rl - Readline interface for prompting
 * @returns {Promise<TrialResult>} Graded result
 */
async function gradeWithHuman(result, rl) {
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  let score;
  while (score === undefined) {
    const raw = await ask('Score (0.0-1.0): ');
    const num = Number.parseFloat(raw);
    if (!Number.isNaN(num) && num >= 0 && num <= 1) {
      score = Math.round(num * 100) / 100;
    } else {
      console.log('Invalid score. Enter a number between 0.0 and 1.0.');
    }
  }

  const passedRaw = await ask(`Passed? (y/n, default ${score >= 0.7 ? 'y' : 'n'}): `);
  const passed =
    passedRaw.trim() === '' ? score >= 0.7 : passedRaw.trim().toLowerCase().startsWith('y');

  const notes = (await ask('Notes (optional): ')).trim();

  return {
    ...result,
    passed,
    score,
    grader: 'human',
    ...(notes ? { notes } : {}),
  };
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
  gradeWithModel,
  gradeWithHuman,
  gradeTrialResult,
  runSkillEval,
  saveTranscript,
  appendResult,
  loadResults,
  passAtK,
  passAllK,
  avgScore,
  passRate,
  computeDelta,
  generateBenchmark,
  verdictFromRate,
  verdictFromDelta,
  getVerdict,
  ensureEvalsDir,
  EVALS_DIR,
  SCENARIOS_DIR,
  RESULTS_DIR,
  BENCHMARKS_DIR,
};
