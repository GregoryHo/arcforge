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

// Cache agent definitions to avoid repeated disk reads during batch grading.
// Key: absolute path, Value: file content with frontmatter stripped (empty string if missing).
const agentDefCache = new Map();

/**
 * Load an agent definition file, caching the result to avoid repeated disk reads.
 * Strips YAML frontmatter if present. Returns empty string if file does not exist.
 * @param {string} agentPath - Absolute path to the agent markdown file
 * @returns {string} Agent definition content (cached)
 */
function loadAgentDef(agentPath) {
  if (agentDefCache.has(agentPath)) return agentDefCache.get(agentPath);
  let content = '';
  try {
    content = fs.readFileSync(agentPath, 'utf8').replace(/^---[\s\S]*?---\n*/m, '');
  } catch {
    /* file missing — return empty string */
  }
  agentDefCache.set(agentPath, content);
  return content;
}

/**
 * Strip markdown code fences from text before JSON extraction.
 * @param {string} text - Text potentially containing ```json ... ``` fences
 * @returns {string} Text with fences removed
 */
function stripCodeFences(text) {
  return text.replace(/```(?:json)?\s*\n?/g, '');
}

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
  const agentDef = loadAgentDef(path.join(projectRoot, 'agents', 'eval-grader.md'));

  const rubric = scenario.assertions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const artifacts = captureTrialArtifacts(result.trialDir);
  const prompt = [
    ...(agentDef ? [agentDef, ''] : []),
    '## This Trial',
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
    '### Required Response Format (automated grading)',
    'Respond with ONLY a JSON object:',
    '```json',
    '{"scores": [0.85, 0.70, ...], "overall": 0.78, "passed": true}',
    '```',
    'Set passed=true if ALL scores >= 0.7.',
  ].join('\n');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { stdout, exitCode } = execCommand('claude', ['-p', '--output-format', 'text'], {
      input: prompt,
      cwd: projectRoot,
      timeout: 120000,
    });

    if (exitCode !== 0) {
      if (attempt === 2) {
        return { ...result, passed: false, score: 0, error: 'Model grader failed to respond' };
      }
      continue;
    }

    // Strip markdown code fences before JSON extraction
    const cleaned = stripCodeFences(stdout);
    const jsonMatch = cleaned.match(/\{[\s\S]*?"scores"\s*:[\s\S]*?\}/);
    if (!jsonMatch) {
      if (attempt === 2) {
        return {
          ...result,
          passed: false,
          score: 0,
          error: 'Model grader returned unparseable response',
        };
      }
      continue;
    }

    try {
      const grade = JSON.parse(jsonMatch[0]);
      const score = typeof grade.overall === 'number' ? grade.overall : 0;
      const passed = typeof grade.passed === 'boolean' ? grade.passed : score >= 0.7;
      return { ...result, passed, score: Math.round(score * 100) / 100 };
    } catch {
      if (attempt === 2) {
        return { ...result, passed: false, score: 0, error: 'Model grader returned invalid JSON' };
      }
    }
  }
}

/**
 * Compare baseline vs treatment results using the eval-comparator agent.
 * Reads agents/eval-comparator.md as the comparison methodology.
 * Returns qualitative analysis with per-assertion breakdown.
 * @param {import('./eval').EvalScenario} scenario - Eval scenario
 * @param {import('./eval').TrialResult[]} baseline - Baseline results
 * @param {import('./eval').TrialResult[]} treatment - Treatment results
 * @param {string} projectRoot - Project root directory
 * @returns {{ per_assertion: Object[], analysis: string, recommendation: string }|null}
 */
function compareWithModel(scenario, baseline, treatment, projectRoot) {
  const agentDef = loadAgentDef(path.join(projectRoot, 'agents', 'eval-comparator.md'));
  if (!agentDef) return null;
  const assertions = scenario.assertions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const fmtResults = (results) =>
    results.map((r) => `Trial ${r.trial}: score=${r.score}, passed=${r.passed}`).join('\n');

  const prompt = [
    agentDef,
    '',
    '## This Comparison',
    '',
    `### Assertions\n${assertions}`,
    '',
    `### Baseline Results (${baseline.length} trials)\n${fmtResults(baseline)}`,
    '',
    `### Treatment Results (${treatment.length} trials)\n${fmtResults(treatment)}`,
    '',
    '### Required Response Format (automated comparison)',
    'Respond with ONLY a JSON object:',
    '```json',
    '{"per_assertion": [{"assertion": "...", "baseline": 0.65, "treatment": 0.85, "delta": 0.20}],',
    '"analysis": "...", "recommendation": "SHIP"}',
    '```',
  ].join('\n');

  const { stdout, exitCode } = execCommand('claude', ['-p', '--output-format', 'text'], {
    input: prompt,
    cwd: projectRoot,
    timeout: 120000,
  });

  if (exitCode !== 0) return null;

  const cleaned = stripCodeFences(stdout).trim();
  // Try parsing the entire cleaned output first (the prompt asks for "ONLY a JSON object").
  // Fall back to extracting the outermost { ... } by brace balancing.
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    for (let end = cleaned.lastIndexOf('}'); end > start; end = cleaned.lastIndexOf('}', end - 1)) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* try shorter substring */
      }
    }
    return null;
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
  compareWithModel,
  gradeWithHuman,
};
