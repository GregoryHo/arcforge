/**
 * eval-graders.js - Grading dispatcher for the eval harness
 *
 * Routes trial results to the appropriate grader strategy (code, model,
 * mixed, human) and hosts the mixed grader that composes behavioral + model
 * grading. Strategy implementations live in sibling modules:
 *   - eval-grader-io.js          shared I/O and parsing plumbing (leaf)
 *   - eval-grader-code.js        code (test-command) grading
 *   - eval-grader-model.js       model (LLM-as-judge) grading and comparison
 *   - eval-grader-behavioral.js  deterministic behavioral-assertion grading
 *
 * This module re-exports the full grader surface so existing importers
 * (eval.js, eval-benchmark.js, eval-blind-autotrigger.js, tests) keep
 * resolving every name from here. It never imports those callers back.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const { round2 } = require('./eval-stats');
const {
  snapScore,
  validateGraderResponse,
  numberTranscriptBlocks,
  captureTrialArtifacts,
  getGradingPath,
} = require('./eval-grader-io');
const {
  gradeWithCode,
  parseAssertionLabels,
  validateAssertionLabels,
  buildCodeGraderBlockRefs,
} = require('./eval-grader-code');
const {
  gradeWithModel,
  compareWithModel,
  buildBlindComparatorPrompt,
  runBlindComparator,
  BLIND_COMPARATOR_FORBIDDEN,
} = require('./eval-grader-model');
const {
  parseBehavioralAssertion,
  classifyAssertions,
  gradeBehavioralAssertion,
  gradeAllBehavioral,
} = require('./eval-grader-behavioral');

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
    return gradeWithCode(
      result,
      scenario.graderConfig,
      projectRoot,
      scenario.assertions?.length || 0,
    );
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

  // Behavioral assertions require a captured action log. Without one,
  // fail closed instead of letting [tool_not_called] pass against an empty log.
  if (!Array.isArray(actionLog)) {
    return {
      ...result,
      passed: false,
      score: 0,
      gradeError: true,
      errorType: 'action_log_missing',
      error: 'Behavioral tool assertions require an action log, but none was captured',
      assertionScores: new Array(scenario.assertions.length).fill(0),
      grader: 'mixed',
    };
  }

  // Grade behavioral assertions
  const actions = actionLog;
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

  // Reassemble evidence into original assertion order (text evidence at original indices)
  const rawEvidence = textResult.evidence || [];
  const evidence = new Array(total).fill('');
  for (let i = 0; i < text.length; i++) {
    evidence[text[i].originalIndex] = rawEvidence[i] || '';
  }

  return {
    ...result,
    passed: score >= 0.8,
    score,
    assertionScores,
    grader: 'mixed',
    evidence,
  };
}

module.exports = {
  gradeTrialResult,
  gradeWithCode,
  parseAssertionLabels,
  validateAssertionLabels,
  buildCodeGraderBlockRefs,
  captureTrialArtifacts,
  gradeWithModel,
  compareWithModel,
  runBlindComparator,
  buildBlindComparatorPrompt,
  BLIND_COMPARATOR_FORBIDDEN,
  gradeWithHuman,
  snapScore,
  validateGraderResponse,
  numberTranscriptBlocks,
  parseBehavioralAssertion,
  classifyAssertions,
  gradeBehavioralAssertion,
  gradeAllBehavioral,
  gradeWithMixed,
  getGradingPath,
};
