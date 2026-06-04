/**
 * eval-grader-model.js - Model (LLM-as-judge) grading and comparison strategies
 *
 * Imports shared plumbing from eval-grader-io (leaf). Imported by the
 * eval-graders dispatcher. Never imports eval-graders back.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const path = require('node:path');
const { execCommand } = require('./utils');
const { DELTA_IMPROVED_THRESHOLD, DELTA_REGRESSED_THRESHOLD } = require('./eval-stats');
const {
  loadAgentDef,
  captureTrialArtifacts,
  numberTranscriptBlocks,
  extractJsonObject,
  validateGraderResponse,
  writeGradingJson,
  buildModelGraderError,
} = require('./eval-grader-io');

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
  const agentDef = loadAgentDef(
    path.join(projectRoot, 'skills', 'arc-evaluating', 'agents', 'eval-grader.md'),
  );

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

    writeGradingJson(result, grade, validated, projectRoot);

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
 * Compare baseline vs treatment results using the eval-analyzer agent.
 * Reads skills/arc-evaluating/agents/eval-analyzer.md as the comparison methodology.
 * Returns qualitative post-hoc analysis based on harness-computed metrics.
 * The agent does not determine the verdict — the harness does that deterministically.
 * If the agent returns a "recommendation" field, it is dropped with a warning.
 * @param {import('./eval').EvalScenario} scenario - Eval scenario
 * @param {import('./eval').TrialResult[]} baseline - Baseline results
 * @param {import('./eval').TrialResult[]} treatment - Treatment results
 * @param {string} projectRoot - Project root directory
 * @param {Object} metrics - Pre-computed metrics from compareResults
 * @returns {{ analysis: string, delta_explanation?: string, weak_assertions_patterns?: string[], variance_notes?: string[], improvements?: string[], regressions?: string[], limitations?: string[] }|null}
 */
function compareWithModel(scenario, baseline, treatment, projectRoot, metrics) {
  const rawDef = loadAgentDef(
    path.join(projectRoot, 'skills', 'arc-evaluating', 'agents', 'eval-analyzer.md'),
  );
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

  const parsed = extractJsonObject(stdout, ['analysis']);
  if (!parsed) return null;

  // Drop any recommendation field the agent may have emitted — verdict authority
  // is exclusively with the harness (deterministic computation), not the agent.
  if (Object.hasOwn(parsed, 'recommendation')) {
    process.stderr.write(
      'Warning: eval-analyzer returned a "recommendation" field — dropping it. Verdict comes from the harness.\n',
    );
    const { recommendation: _dropped, ...rest } = parsed;
    return rest;
  }

  return parsed;
}

// Forbidden strings that must never appear in the blind comparator payload.
const BLIND_COMPARATOR_FORBIDDEN = ['baseline', 'treatment', 'with_skill', 'without_skill'];

/**
 * Build a comparison prompt for the blind comparator, stripping all identifying labels.
 * The prompt must not contain any of BLIND_COMPARATOR_FORBIDDEN strings or the skill name.
 * @param {string} taskPrompt - The original task prompt given to both conditions
 * @param {string} outputA - Anonymized output for label A
 * @param {string} outputB - Anonymized output for label B
 * @param {string} agentDef - Loaded agent definition text
 * @returns {string} Prompt safe to send to the blind comparator
 */
function buildBlindComparatorPrompt(taskPrompt, outputA, outputB, agentDef) {
  return [
    ...(agentDef ? [agentDef, ''] : []),
    '## Comparison Task',
    '',
    '### Original Task Prompt',
    taskPrompt,
    '',
    '### Output A',
    '```',
    outputA,
    '```',
    '',
    '### Output B',
    '```',
    outputB,
    '```',
    '',
    'Derive a rubric from the task prompt, score each output, and respond with the required JSON only.',
  ].join('\n');
}

/**
 * Run the eval-blind-comparator agent on two outputs.
 * Randomly shuffles (baseline, treatment) → (A, B) to prevent label bias,
 * then maps A/B back to original labels after parsing the response.
 *
 * The prompt sent to the agent is stripped of all identifying strings:
 * "baseline", "treatment", "with_skill", "without_skill", and the skill name.
 *
 * Auto-triggering from the grader pipeline is wired in ./eval-blind-autotrigger.js
 * per fr-gr-005 (all-model-graded scenarios only).
 *
 * @param {string} taskPrompt - The original task prompt given to both conditions
 * @param {string} baselineOutput - Output from the baseline (control) condition
 * @param {string} treatmentOutput - Output from the treatment (modified) condition
 * @param {string} projectRoot - Project root directory
 * @param {string} [skillName] - Skill name to strip from the prompt (optional)
 * @returns {{ winner_original_label: 'baseline'|'treatment'|'tie', reasoning: string, rubric: Array<{criterion: string, weight: number}>, score_baseline: number, score_treatment: number }|null}
 */
function runBlindComparator(taskPrompt, baselineOutput, treatmentOutput, projectRoot, skillName) {
  const agentDef = loadAgentDef(
    path.join(projectRoot, 'skills', 'arc-evaluating', 'agents', 'eval-blind-comparator.md'),
  );

  // Randomly assign baseline/treatment to A/B.
  const baselineIsA = Math.random() < 0.5;
  const outputA = baselineIsA ? baselineOutput : treatmentOutput;
  const outputB = baselineIsA ? treatmentOutput : baselineOutput;

  // Sanitize task prompt: strip forbidden strings and skill name.
  const forbidden = skillName
    ? [...BLIND_COMPARATOR_FORBIDDEN, skillName]
    : BLIND_COMPARATOR_FORBIDDEN;

  function sanitize(text) {
    let result = text || '';
    for (const word of forbidden) {
      if (!word) continue;
      // Escape regex metachars so user-provided skillName values
      // like "skill+v2" or "arc-tdd[2]" don't crash RegExp construction.
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), '[redacted]');
    }
    return result;
  }

  const safePrompt = buildBlindComparatorPrompt(
    sanitize(taskPrompt),
    sanitize(outputA),
    sanitize(outputB),
    agentDef,
  );

  const { stdout, exitCode } = execCommand(
    'claude',
    ['-p', '--output-format', 'text', '--no-session-persistence'],
    {
      input: safePrompt,
      cwd: projectRoot,
      timeout: 120000,
    },
  );

  if (exitCode !== 0) return null;

  const parsed = extractJsonObject(stdout, ['winner']);
  if (!parsed) return null;

  const winner = parsed.winner; // expect 'A', 'B', or 'tie'
  let winnerOriginalLabel;
  if (winner === 'tie') {
    winnerOriginalLabel = 'tie';
  } else if (winner === 'A') {
    winnerOriginalLabel = baselineIsA ? 'baseline' : 'treatment';
  } else if (winner === 'B') {
    winnerOriginalLabel = baselineIsA ? 'treatment' : 'baseline';
  } else {
    // Unknown / malformed winner value (e.g. lowercase 'b', 'baseline',
    // whitespace-padded 'B '). Surface the failure rather than silently
    // mapping it to a concrete baseline/treatment outcome — that would
    // bias the supplementary preference signal.
    return null;
  }

  return {
    winner_original_label: winnerOriginalLabel,
    reasoning: parsed.reasoning || '',
    rubric: parsed.rubric || [],
    score_baseline: baselineIsA ? (parsed.score_a ?? 0) : (parsed.score_b ?? 0),
    score_treatment: baselineIsA ? (parsed.score_b ?? 0) : (parsed.score_a ?? 0),
  };
}

module.exports = {
  gradeWithModel,
  compareWithModel,
  buildBlindComparatorPrompt,
  runBlindComparator,
  BLIND_COMPARATOR_FORBIDDEN,
};
