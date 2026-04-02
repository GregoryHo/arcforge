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
function gradeTrialResult(result, scenario, projectRoot, actionLog) {
  if (scenario.grader === 'code') {
    // Code grading runs in trialDir (where agent artifacts live), with $PROJECT_ROOT available
    return gradeWithCode(result, scenario.graderConfig, projectRoot);
  }
  if (scenario.grader === 'model') {
    return gradeWithModel(result, scenario, projectRoot);
  }
  if (scenario.grader === 'mixed') {
    return gradeWithMixed(result, scenario, projectRoot, actionLog);
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
    const blockRefs = buildCodeGraderBlockRefs(result.output, result.trialDir, assertions.length);
    return {
      ...result,
      passed: assertionScores.every((s) => s === 1.0) && exitCode === 0,
      score,
      assertionScores,
      evidence,
      ...(blockRefs ? { blockRefs } : {}),
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
 * Build blockRefs for code-graded trials by finding Write blocks in the transcript.
 * Maps all assertions to transcript blocks where files were written to the trial dir.
 * @param {string} [transcript] - Rich transcript text (result.output)
 * @param {string} [trialDir] - Trial directory path
 * @param {number} assertionCount - Number of assertions
 * @returns {number[][]|null} Per-assertion block refs (1-indexed), or null if none found
 */
function buildCodeGraderBlockRefs(transcript, trialDir, assertionCount) {
  if (!transcript || !trialDir || !assertionCount) return null;
  const blocks = splitTranscriptBlocks(transcript);
  const writeBlockIndices = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].startsWith('[Tool: Write]') && blocks[i].includes(trialDir)) {
      writeBlockIndices.push(i + 1); // 1-indexed
    }
  }
  if (writeBlockIndices.length === 0) return null;
  return Array.from({ length: assertionCount }, () => [...writeBlockIndices]);
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
function splitTranscriptBlocks(text) {
  if (!text) return [];
  return text.split(/(?=^\[(?:Tool:|Assistant))/m).filter((b) => b.trim());
}

function numberTranscriptBlocks(output) {
  if (!output) return { numbered: '(no output)', blockCount: 0 };
  const blocks = splitTranscriptBlocks(output);
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

// ============================================================
// Behavioral Assertions — Parse, Classify, Grade
// ============================================================

/**
 * Parse a tool reference of the form "ToolName:args_pattern".
 * @param {string} ref - e.g. "Skill:arc-verifying" or "Bash:npm test"
 * @returns {{ name: string, pattern: string }}
 */
function parseToolRef(ref) {
  const colonIdx = ref.indexOf(':');
  if (colonIdx === -1) return { name: ref.trim(), pattern: '' };
  return { name: ref.slice(0, colonIdx).trim(), pattern: ref.slice(colonIdx + 1).trim() };
}

/**
 * Parse a behavioral assertion string into a structured object.
 * Recognized prefixes: [tool_called], [tool_not_called], [tool_before],
 * [tool_count], [tool_adjacent].
 *
 * Returns null for non-behavioral assertions (e.g. "[ ] text" or plain text).
 *
 * @param {string} assertion - Raw assertion string
 * @returns {{ operator: string, [key: string]: any }|null}
 */
function parseBehavioralAssertion(assertion) {
  if (!assertion || typeof assertion !== 'string') return null;
  const str = assertion.trim();

  // Match [tool_<operator>] prefix
  const prefixMatch = str.match(/^\[tool_(\w+)\]\s+(.*)/);
  if (!prefixMatch) return null;

  const operator = `tool_${prefixMatch[1]}`;
  const body = prefixMatch[2].trim();

  switch (operator) {
    case 'tool_called':
    case 'tool_not_called': {
      const { name, pattern } = parseToolRef(body);
      return { operator, name, pattern };
    }

    case 'tool_before': {
      // "A < B" — split on " < "
      const parts = body.split(/\s+<\s+/);
      if (parts.length !== 2) return null;
      return { operator, a: parseToolRef(parts[0]), b: parseToolRef(parts[1]) };
    }

    case 'tool_count': {
      // "ToolName:pattern >= N"
      const countMatch = body.match(/^(.+?)\s*>=\s*(\d+)$/);
      if (!countMatch) return null;
      const { name, pattern } = parseToolRef(countMatch[1]);
      return { operator, name, pattern, min: parseInt(countMatch[2], 10) };
    }

    case 'tool_adjacent': {
      // "A ~ B" — split on " ~ "
      const parts = body.split(/\s+~\s+/);
      if (parts.length !== 2) return null;
      return { operator, a: parseToolRef(parts[0]), b: parseToolRef(parts[1]) };
    }

    default:
      return null;
  }
}

/**
 * Classify a list of assertion strings into behavioral and text groups.
 * Preserves original indices for score reassembly in mixed grading.
 *
 * @param {string[]} assertions - Raw assertion strings
 * @returns {{ behavioral: Array<{originalIndex: number, parsed: Object, assertion: string}>,
 *             text: Array<{originalIndex: number, assertion: string}> }}
 */
function classifyAssertions(assertions) {
  const behavioral = [];
  const text = [];
  for (let i = 0; i < assertions.length; i++) {
    const parsed = parseBehavioralAssertion(assertions[i]);
    if (parsed) {
      behavioral.push({ originalIndex: i, parsed, assertion: assertions[i] });
    } else {
      text.push({ originalIndex: i, assertion: assertions[i] });
    }
  }
  return { behavioral, text };
}

/**
 * Check whether a single action matches a tool reference (name + args substring).
 * @param {Object} action - Action from the action log
 * @param {string} name - Tool name to match
 * @param {string} pattern - Substring to match in args
 * @returns {boolean}
 */
function actionMatches(action, name, pattern) {
  if (action.type !== 'tool') return false;
  if (action.name !== name) return false;
  if (!pattern) return true;
  return (action.args || '').includes(pattern);
}

/**
 * Grade a single parsed behavioral assertion against an action log.
 * Returns 1 (pass) or 0 (fail). No LLM calls — purely deterministic.
 *
 * @param {Object} parsed - Parsed assertion from parseBehavioralAssertion
 * @param {Array<{type: string, name?: string, args?: string, index: number}>} actions
 * @returns {0|1}
 */
function gradeBehavioralAssertion(parsed, actions) {
  switch (parsed.operator) {
    case 'tool_called': {
      return actions.some((a) => actionMatches(a, parsed.name, parsed.pattern)) ? 1 : 0;
    }

    case 'tool_not_called': {
      return actions.some((a) => actionMatches(a, parsed.name, parsed.pattern)) ? 0 : 1;
    }

    case 'tool_before': {
      const aIdx = actions.findIndex((a) => actionMatches(a, parsed.a.name, parsed.a.pattern));
      const bIdx = actions.findIndex((a) => actionMatches(a, parsed.b.name, parsed.b.pattern));
      if (aIdx === -1 || bIdx === -1) return 0;
      return aIdx < bIdx ? 1 : 0;
    }

    case 'tool_count': {
      const count = actions.filter((a) => actionMatches(a, parsed.name, parsed.pattern)).length;
      return count >= parsed.min ? 1 : 0;
    }

    case 'tool_adjacent': {
      const aIdx = actions.findIndex((a) => actionMatches(a, parsed.a.name, parsed.a.pattern));
      const bIdx = actions.findIndex((a) => actionMatches(a, parsed.b.name, parsed.b.pattern));
      if (aIdx === -1 || bIdx === -1) return 0;
      const lo = Math.min(aIdx, bIdx);
      const hi = Math.max(aIdx, bIdx);
      // Check no tool actions between them (text entries are allowed)
      for (let i = lo + 1; i < hi; i++) {
        if (actions[i].type === 'tool') return 0;
      }
      return 1;
    }

    default:
      return 0;
  }
}

/**
 * Grade all parsed behavioral assertions against an action log.
 * @param {Object[]} parsedAssertions - Array of parsed assertions
 * @param {Object[]} actions - Action log
 * @returns {number[]} Array of 0|1 scores
 */
function gradeAllBehavioral(parsedAssertions, actions) {
  return parsedAssertions.map((p) => gradeBehavioralAssertion(p, actions));
}

/**
 * Mixed grader: split assertions into behavioral and text groups,
 * grade behavioral deterministically, delegate text to model grader,
 * and combine into a unified score.
 *
 * Falls back to pure behavioral when 0 text assertions,
 * or pure model when 0 behavioral assertions.
 *
 * @param {import('./eval').TrialResult} result - Trial result to grade
 * @param {import('./eval').EvalScenario} scenario - Scenario with assertions
 * @param {string} projectRoot - Project root directory
 * @param {Object[]} [actionLog] - Pre-parsed action log (avoids re-parsing)
 * @returns {import('./eval').TrialResult} Graded result
 */
function gradeWithMixed(result, scenario, projectRoot, actionLog) {
  const { behavioral, text } = classifyAssertions(scenario.assertions);

  // Fallback: 0 behavioral → pure model grading
  if (behavioral.length === 0) {
    return gradeWithModel(result, scenario, projectRoot);
  }

  // Grade behavioral assertions
  const actions = actionLog || [];
  const behavioralScores = behavioral.map((b) => gradeBehavioralAssertion(b.parsed, actions));

  // Fallback: 0 text → pure behavioral grading
  if (text.length === 0) {
    const passCount = behavioralScores.filter((s) => s === 1).length;
    const total = behavioralScores.length;
    const score = round2(passCount / total);
    return {
      ...result,
      passed: score >= 0.8,
      score,
      assertionScores: behavioralScores,
      grader: 'behavioral',
    };
  }

  // Mixed: grade text assertions via model grader
  const textScenario = { ...scenario, assertions: text.map((t) => t.assertion) };
  const textResult = gradeWithModel(result, textScenario, projectRoot);

  // Propagate model grader errors instead of silently scoring 0
  if (textResult.gradeError) {
    return { ...result, ...textResult, grader: 'mixed' };
  }

  // Binarize model scores: >= 0.8 → 1, < 0.8 → 0
  const rawModelScores = textResult.assertionScores || [];
  const modelScores = rawModelScores.map((s) => (s >= 0.8 ? 1 : 0));

  // Reassemble into original order
  const total = scenario.assertions.length;
  const assertionScores = new Array(total);
  for (let i = 0; i < behavioral.length; i++) {
    assertionScores[behavioral[i].originalIndex] = behavioralScores[i];
  }
  for (let i = 0; i < text.length; i++) {
    assertionScores[text[i].originalIndex] = modelScores[i] ?? 0;
  }

  const passCount = assertionScores.filter((s) => s === 1).length;
  const score = round2(passCount / total);

  return {
    ...result,
    passed: score >= 0.8,
    score,
    assertionScores,
    grader: 'mixed',
    evidence: textResult.evidence || [],
  };
}

module.exports = {
  gradeTrialResult,
  gradeWithCode,
  parseAssertionLabels,
  buildCodeGraderBlockRefs,
  captureTrialArtifacts,
  gradeWithModel,
  compareWithModel,
  gradeWithHuman,
  snapScore,
  validateGraderResponse,
  numberTranscriptBlocks,
  parseBehavioralAssertion,
  classifyAssertions,
  gradeBehavioralAssertion,
  gradeAllBehavioral,
  gradeWithMixed,
};
