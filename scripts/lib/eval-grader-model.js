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
const {
  loadAgentDef,
  captureTrialArtifacts,
  numberTranscriptBlocks,
  extractJsonObject,
  validateGraderResponse,
  writeGradingJson,
  writeGraderRawDump,
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
    path.join(projectRoot, 'scripts', 'lib', 'prompts', 'eval-grader.md'),
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
      // The grader reads and never edits ("Your Tools" in eval-grader.md); enforce it.
      ['-p', '--output-format', 'text', '--no-session-persistence', '--tools', 'Read,Grep,Glob'],
      {
        input: prompt,
        cwd: projectRoot,
        timeout: 120000,
      },
    );

    if (exitCode !== 0) {
      if (attempt === 2) {
        writeGraderRawDump(result, projectRoot, stdout, 'graderfail');
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
        writeGraderRawDump(result, projectRoot, stdout, 'unparseable');
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
        writeGraderRawDump(result, projectRoot, stdout, 'empty-scores');
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
 * Reads scripts/lib/prompts/eval-analyzer.md as the comparison methodology.
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
  const agentDef = loadAgentDef(
    path.join(projectRoot, 'scripts', 'lib', 'prompts', 'eval-analyzer.md'),
  );
  if (!agentDef) return null;
  const assertions = scenario.assertions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const fmtResults = (results) =>
    results
      .map((r) => {
        // Ship per-assertion scores when the row carries them — without these
        // the analyzer's "Weak Assertions" section is inference, and it has
        // guessed wrong on verified cases (P4: debugging, sessions).
        const per = Array.isArray(r.assertionScores)
          ? `, assertions=[${r.assertionScores.join(',')}]`
          : '';
        return `Trial ${r.trial}: score=${r.score}, passed=${r.passed}${per}`;
      })
      .join('\n');

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
    '{"analysis": "...", "improvements": ["..."], "regressions": ["..."], "limitations": ["..."], "delta_explanation": "...", "weak_assertions_patterns": ["..."], "variance_notes": ["..."]}',
    '```',
    'Use the provided programmatic metrics as numeric truth. Do not invent missing per-assertion numbers.',
  ].join('\n');

  const { stdout, exitCode } = execCommand(
    'claude',
    // The analyzer reads and never edits ("Your Tools" in eval-analyzer.md); enforce it.
    ['-p', '--output-format', 'text', '--no-session-persistence', '--tools', 'Read,Grep,Glob'],
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

/** Margin below which two weighted totals count as a tie. */
const BLIND_TIE_MARGIN = 0.1;
/** Tolerance for the tie comparison: far below score precision, above float noise. */
const BLIND_TIE_EPSILON = 1e-9;

/**
 * Compute the blind comparator's weighted totals and winner. The agent supplies
 * the judgment (rubric weights and per-criterion scores); the arithmetic and the
 * tie threshold live here, where they are deterministic and testable, rather
 * than in the prompt.
 * @param {Array<{criterion: string, weight: number}>} rubric
 * @param {number[]} scoresA - Per-criterion scores for Output A (rubric order)
 * @param {number[]} scoresB - Per-criterion scores for Output B (rubric order)
 * @returns {{ winner: 'A'|'B'|'tie', scoreA: number, scoreB: number }|null}
 *   scoreA / scoreB are the weighted totals rounded to hundredths for display;
 *   the winner is decided on the unrounded totals.
 *   null when the rubric is empty or carries a non-finite / negative weight,
 *   when either score array is missing or not rubric-length, or when any score
 *   element is not a finite number within [0, 1] inclusive. Nothing is
 *   coerced or clamped: a string '0.9', a null, a NaN, or a 5 is a malformed
 *   response and never maps to a winner.
 */
function scoreBlindRubric(rubric, scoresA, scoresB) {
  if (!Array.isArray(rubric) || rubric.length === 0) return null;
  if (!Array.isArray(scoresA) || !Array.isArray(scoresB)) return null;
  if (scoresA.length !== rubric.length || scoresB.length !== rubric.length) return null;
  const weights = rubric.map((r) => (typeof r?.weight === 'number' ? r.weight : Number.NaN));
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return null;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return null;
  const validScore = (s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1;
  if (!scoresA.every(validScore) || !scoresB.every(validScore)) return null;
  const weighted = (scores) =>
    scores.reduce((sum, s, i) => sum + s * (weights[i] / totalWeight), 0);
  const totalA = weighted(scoresA);
  const totalB = weighted(scoresB);
  // Decide on the unrounded totals with a tolerance: subtracting two-decimal
  // floats puts an exact-margin gap on either side of the threshold depending
  // on the operands' binary representation (0.8 - 0.7 > 0.1, but 0.7 - 0.6 is
  // not), while rounding the totals first would turn a real gap of 0.104 —
  // weights need not land on hundredths — into a tie.
  let winner = 'tie';
  if (totalA - totalB > BLIND_TIE_MARGIN + BLIND_TIE_EPSILON) winner = 'A';
  else if (totalB - totalA > BLIND_TIE_MARGIN + BLIND_TIE_EPSILON) winner = 'B';
  const display = (total) => Math.round(total * 100) / 100;
  return { winner, scoreA: display(totalA), scoreB: display(totalB) };
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
    path.join(projectRoot, 'scripts', 'lib', 'prompts', 'eval-blind-comparator.md'),
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

  const parsed = extractJsonObject(stdout, ['rubric', 'scores_a', 'scores_b']);
  if (!parsed) return null;

  // Malformed, out-of-range, or misaligned scores surface as a failure rather
  // than being coerced and mapped to a concrete baseline/treatment outcome —
  // that would bias the supplementary preference signal.
  const scored = scoreBlindRubric(parsed.rubric, parsed.scores_a, parsed.scores_b);
  if (!scored) {
    process.stderr.write(
      'Warning: blind comparator returned a malformed rubric or scores — dropping this pair.\n',
    );
    return null;
  }

  const { winner, scoreA, scoreB } = scored;
  let winnerOriginalLabel = 'tie';
  if (winner === 'A') winnerOriginalLabel = baselineIsA ? 'baseline' : 'treatment';
  if (winner === 'B') winnerOriginalLabel = baselineIsA ? 'treatment' : 'baseline';

  return {
    winner_original_label: winnerOriginalLabel,
    reasoning: parsed.reasoning || '',
    rubric: parsed.rubric,
    score_baseline: baselineIsA ? scoreA : scoreB,
    score_treatment: baselineIsA ? scoreB : scoreA,
  };
}

module.exports = {
  gradeWithModel,
  compareWithModel,
  buildBlindComparatorPrompt,
  runBlindComparator,
  scoreBlindRubric,
  BLIND_COMPARATOR_FORBIDDEN,
  BLIND_TIE_MARGIN,
};
