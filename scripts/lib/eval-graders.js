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
const { DELTA_IMPROVED_THRESHOLD, DELTA_REGRESSED_THRESHOLD, round2 } = require('./eval-stats');

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
 * Extract the first parseable JSON object from text, honoring braces inside strings.
 * Optionally requires specific top-level keys to be present.
 * @param {string} text - Raw model output
 * @param {string[]} [requiredKeys=[]] - Required top-level keys
 * @returns {Object|null} Parsed JSON object, or null if none found
 */
function extractJsonObject(text, requiredKeys = []) {
  const cleaned = stripCodeFences(text || '').trim();
  if (!cleaned) return null;

  const hasRequiredKeys = (value) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    requiredKeys.every((key) => Object.hasOwn(value, key));

  try {
    const parsed = JSON.parse(cleaned);
    if (hasRequiredKeys(parsed)) return parsed;
  } catch {
    /* fall through to balanced-brace extraction */
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (hasRequiredKeys(parsed)) return parsed;
        } catch {
          /* keep scanning for another object */
        }
        start = -1;
      }
    }
  }

  return null;
}

function buildModelGraderError(result, error, errorType) {
  return {
    ...result,
    passed: false,
    score: 0,
    error,
    gradeError: true,
    errorType,
  };
}

/**
 * Snap a score to the nearest 5-tier value: 0, 0.25, 0.5, 0.75, or 1.0.
 * Thresholds are midpoints between tiers.
 * @param {number} score - Raw score from grader
 * @returns {number} Snapped score
 */
function snapScore(score) {
  const clamped = Math.max(0, Math.min(1, score));
  if (clamped <= 0.125) return 0;
  if (clamped <= 0.375) return 0.25;
  if (clamped <= 0.625) return 0.5;
  if (clamped <= 0.875) return 0.75;
  return 1.0;
}

/**
 * Validate and normalize a grader JSON response.
 * Snaps scores to 5-tier scale, recomputes overall and passed from snapped scores.
 * Returns null if scores array is missing or empty (triggers retry).
 * @param {Object} grade - Parsed JSON from grader: { scores, overall, passed }
 * @param {number} assertionCount - Expected number of assertions
 * @returns {{ scores: number[], overall: number, passed: boolean }|null}
 */
function validateGraderResponse(grade, assertionCount) {
  if (!Array.isArray(grade.scores) || grade.scores.length === 0) return null;

  if (grade.scores.length !== assertionCount && assertionCount > 0) {
    process.stderr.write(
      `Warning: grader returned ${grade.scores.length} scores for ${assertionCount} assertions\n`,
    );
  }

  const scores = grade.scores.map((s) => snapScore(typeof s === 'number' ? s : 0));
  const overall = round2(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passed = scores.every((s) => s === 1.0);

  return { scores, overall, passed };
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
    // Code grading runs in trialDir (where agent artifacts live), with $PROJECT_ROOT available
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
  env.PROJECT_ROOT = projectRoot;
  const cwd = result.trialDir || projectRoot;
  const { exitCode, stdout, stderr } = execCommand(cmd, args, { cwd, env });
  const graderOutput = (stdout || stderr || '').trim() || undefined;
  const artifacts = captureTrialArtifacts(result.trialDir) || undefined;
  const extra = {
    ...(graderOutput ? { graderOutput } : {}),
    ...(artifacts ? { artifacts } : {}),
  };

  // Parse per-assertion labels from stdout (convention: A1:PASS, A2:FAIL:reason)
  const assertions = parseAssertionLabels(stdout || '');
  if (assertions.length > 0) {
    const assertionScores = assertions.map((a) => (a.passed ? 1.0 : 0.0));
    const evidence = assertions.map((a) =>
      a.passed ? 'PASS' : `FAIL${a.reason ? `: ${a.reason}` : ''}`,
    );
    const score = round2(assertionScores.reduce((a, b) => a + b, 0) / assertionScores.length);
    return {
      ...result,
      passed: assertionScores.every((s) => s === 1.0),
      score,
      assertionScores,
      evidence,
      ...extra,
    };
  }

  // Fallback: binary pass/fail (backwards compatible)
  return { ...result, passed: exitCode === 0, score: exitCode === 0 ? 1.0 : 0.0, ...extra };
}

/**
 * Parse labeled assertion results from code grader stdout.
 * Convention: lines matching `A<N>:PASS` or `A<N>:FAIL:<reason>`.
 * @param {string} stdout - Grader stdout
 * @returns {{ index: number, passed: boolean, reason: string }[]} Sorted by index
 */
function parseAssertionLabels(stdout) {
  const results = [];
  for (const line of stdout.split('\n')) {
    const match = line.match(/^A(\d+):(PASS|FAIL)(?::(.*))?$/);
    if (match) {
      results.push({
        index: parseInt(match[1], 10),
        passed: match[2] === 'PASS',
        reason: (match[3] || '').trim(),
      });
    }
  }
  return results.sort((a, b) => a.index - b.index);
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
 * Split transcript output into numbered blocks for grader reference.
 * Blocks are delimited by [Tool: X] and [Assistant] markers.
 * @param {string} output - Raw transcript text
 * @returns {{ numbered: string, blockCount: number }}
 */
function numberTranscriptBlocks(output) {
  if (!output) return { numbered: '(no output)', blockCount: 0 };
  const blocks = output.split(/(?=^\[(?:Tool:|Assistant))/m).filter((b) => b.trim());
  if (blocks.length === 0) return { numbered: output, blockCount: 0 };
  const numbered = blocks.map((b, i) => `[Block ${i + 1}]\n${b.trim()}`).join('\n\n');
  return { numbered, blockCount: blocks.length };
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
  const rawOutput = result.output || result.error || '(no output)';
  const { numbered } = numberTranscriptBlocks(rawOutput);
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
    '### Output to Grade (blocks numbered for reference)',
    '```',
    numbered,
    '```',
    ...(artifacts ? [artifacts] : []),
    '',
    '### Required Response Format (automated grading)',
    'Respond with ONLY a JSON object:',
    '```json',
    '{"scores": [1.0, 0.75, 0.25], "evidence": ["...", "...", "..."], "blockRefs": [[2], [1, 3], []], "overall": 0.67, "passed": false}',
    '```',
    'Score each assertion on a normalized 0.0-1.0 scale.',
    'Use these preferred anchors when possible: 0.0 (not met), 0.25 (weak evidence), 0.5 (partially met), 0.75 (mostly met), 1.0 (fully met).',
    'Include one short evidence note per assertion when possible.',
    'For blockRefs: list the [Block N] numbers that contain evidence for each assertion. Empty array if no specific block.',
    'Set passed=true only if ALL scores are 1.0. The harness will recompute overall and passed from scores.',
  ].join('\n');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { stdout, exitCode } = execCommand(
      'claude',
      ['-p', '--output-format', 'text', '--no-session-persistence'],
      {
        input: prompt,
        cwd: projectRoot,
        timeout: 120000,
      },
    );

    if (exitCode !== 0) {
      if (attempt === 2) {
        return buildModelGraderError(
          result,
          'Model grader failed to respond',
          'model_grader_failed',
        );
      }
      continue;
    }

    const grade = extractJsonObject(stdout, ['scores']);
    if (!grade) {
      if (attempt === 2) {
        return buildModelGraderError(
          result,
          'Model grader returned unparseable response',
          'model_grader_unparseable',
        );
      }
      continue;
    }

    const validated = validateGraderResponse(grade, scenario.assertions.length);
    if (!validated) {
      if (attempt === 2) {
        return buildModelGraderError(
          result,
          'Model grader returned empty scores',
          'model_grader_empty_scores',
        );
      }
      continue;
    }

    return {
      ...result,
      passed: validated.passed,
      score: validated.overall,
      assertionScores: validated.scores,
      evidence: grade.evidence || [],
      blockRefs: grade.blockRefs || [],
    };
  }
}

/**
 * Compare baseline vs treatment results using the eval-comparator agent.
 * Reads agents/eval-comparator.md as the comparison methodology.
 * Returns qualitative analysis based on harness-computed metrics.
 * @param {import('./eval').EvalScenario} scenario - Eval scenario
 * @param {import('./eval').TrialResult[]} baseline - Baseline results
 * @param {import('./eval').TrialResult[]} treatment - Treatment results
 * @param {string} projectRoot - Project root directory
 * @param {Object} metrics - Pre-computed metrics from compareResults
 * @returns {{ analysis: string, recommendation: string, improvements?: string[], regressions?: string[], limitations?: string[] }|null}
 */
function compareWithModel(scenario, baseline, treatment, projectRoot, metrics) {
  const rawDef = loadAgentDef(path.join(projectRoot, 'agents', 'eval-comparator.md'));
  if (!rawDef) return null;
  const agentDef = rawDef
    .replace(/\{IMPROVED_THRESHOLD\}/g, String(DELTA_IMPROVED_THRESHOLD))
    .replace(/\{REGRESSED_THRESHOLD\}/g, String(DELTA_REGRESSED_THRESHOLD));
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
    '### Programmatic Metrics (authoritative)',
    '```json',
    JSON.stringify(metrics, null, 2),
    '```',
    '',
    `### Baseline Results (${baseline.length} trials)\n${fmtResults(baseline)}`,
    '',
    `### Treatment Results (${treatment.length} trials)\n${fmtResults(treatment)}`,
    '',
    '### Required Response Format (automated comparison)',
    'Respond with ONLY a JSON object:',
    '```json',
    '{"analysis": "...", "improvements": ["..."], "regressions": ["..."], "limitations": ["..."], "recommendation": "SHIP"}',
    '```',
    'Use the provided programmatic metrics as numeric truth. Do not invent missing per-assertion numbers.',
  ].join('\n');

  const { stdout, exitCode } = execCommand(
    'claude',
    ['-p', '--output-format', 'text', '--no-session-persistence'],
    {
      input: prompt,
      cwd: projectRoot,
      timeout: 120000,
    },
  );

  if (exitCode !== 0) return null;

  return extractJsonObject(stdout, ['analysis']);
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
      score = round2(num);
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
  parseAssertionLabels,
  captureTrialArtifacts,
  gradeWithModel,
  compareWithModel,
  gradeWithHuman,
  snapScore,
  validateGraderResponse,
  numberTranscriptBlocks,
};
