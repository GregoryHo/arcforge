/**
 * eval-graders.js - Grading functions for the eval harness
 *
 * Extracted from eval.js to maintain file size limits.
 * Provides code, model (LLM-as-judge), and human grading strategies.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execCommand } = require('./utils');

/**
 * Grade a trial result using the appropriate grader for the scenario.
 * @param {import('./eval').TrialResult} result - Trial result to grade
 * @param {import('./eval').EvalScenario} scenario - Scenario with grader config
 * @param {string} projectRoot - Project root directory
 * @returns {import('./eval').TrialResult} Graded result
 */
function gradeTrialResult(result, scenario, projectRoot) {
  if (scenario.grader === 'code') {
    // Code grading runs in projectRoot (where test suites live), not the isolated trial dir
    return gradeWithCode(result, scenario.graderConfig, projectRoot);
  }
  if (scenario.grader === 'model') {
    return gradeWithModel(result, scenario, projectRoot);
  }
  // human grader — return ungraded
  return { ...result, grader: 'human-pending' };
}

/**
 * Grade a trial result using a code grader (test command).
 * Accepts test command as array (exec directly) or string (run via shell).
 * Injects TRIAL_DIR env var so grader commands can reference trial artifacts.
 * Returns a new result object (does not mutate input).
 * @param {import('./eval').TrialResult} result - Trial result to grade
 * @param {string|string[]} testCommand - Test command to run
 * @param {string} projectRoot - Project root directory
 * @returns {import('./eval').TrialResult} New result with grade
 */
function gradeWithCode(result, testCommand, projectRoot) {
  const [cmd, args] = Array.isArray(testCommand)
    ? [testCommand[0], testCommand.slice(1)]
    : ['sh', ['-c', testCommand]];
  const env = { ...process.env };
  if (result.trialDir) env.TRIAL_DIR = result.trialDir;
  const { exitCode } = execCommand(cmd, args, { cwd: projectRoot, env });
  return { ...result, passed: exitCode === 0, score: exitCode === 0 ? 1.0 : 0.0 };
}

/**
 * Capture file artifacts from a trial directory for grader context.
 * Reads non-hidden, non-infrastructure files up to size/count limits.
 * @param {string} [trialDir] - Path to trial directory
 * @param {Object} [opts] - Options
 * @param {number} [opts.maxFiles=10] - Maximum files to capture
 * @param {number} [opts.maxFileSize=10000] - Maximum bytes per file
 * @returns {string} Formatted artifact text, or empty string
 */
function captureTrialArtifacts(trialDir, opts = {}) {
  const { maxFiles = 10, maxFileSize = 10000 } = opts;
  if (!trialDir || !fs.existsSync(trialDir)) return '';

  const artifacts = [];
  const entries = [];

  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        entries.push(rel);
      }
    }
  }

  walk(trialDir, '');

  for (const rel of entries.slice(0, maxFiles)) {
    const filePath = path.join(trialDir, rel);
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > maxFileSize) {
        artifacts.push(`### ${rel}\n(${stat.size} bytes — too large to include)`);
      } else {
        const content = fs.readFileSync(filePath, 'utf8');
        artifacts.push(`### ${rel}\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch {
      /* skip unreadable files */
    }
  }

  if (entries.length > maxFiles) {
    artifacts.push(`(${entries.length - maxFiles} more files not shown)`);
  }

  return artifacts.length > 0
    ? `\n\n## Trial Directory Artifacts\n\n${artifacts.join('\n\n')}`
    : '';
}

/**
 * Grade a trial result using the eval-grader agent (LLM-as-judge).
 * Spawns a Claude session with the rubric and trial output, then
 * parses the structured grade report for per-assertion scores.
 * Includes trial directory artifacts when available so the grader
 * can verify file-based output, not just stdout claims.
 * Returns a new result object (does not mutate input).
 * @param {import('./eval').TrialResult} result - Trial result to grade
 * @param {import('./eval').EvalScenario} scenario - Scenario with assertions and graderConfig
 * @param {string} projectRoot - Project root directory
 * @returns {import('./eval').TrialResult} New result with grade
 */
function gradeWithModel(result, scenario, projectRoot) {
  const rubric = scenario.assertions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const artifacts = captureTrialArtifacts(result.trialDir);
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
    ...(artifacts ? [artifacts] : []),
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
 * Prompt a human to grade a trial result via readline.
 * Returns a new result object (does not mutate input).
 * @param {import('./eval').TrialResult} result - Trial result to grade
 * @param {readline.Interface} rl - Readline interface for prompting
 * @returns {Promise<import('./eval').TrialResult>} Graded result
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

module.exports = {
  gradeTrialResult,
  gradeWithCode,
  captureTrialArtifacts,
  gradeWithModel,
  gradeWithHuman,
};
