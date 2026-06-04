/**
 * eval-grader-code.js - Code (test-command) grading strategy for the eval harness
 *
 * Imports shared plumbing from eval-grader-io (leaf). Imported by the
 * eval-graders dispatcher. Never imports eval-graders back.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const { execCommand } = require('./utils');
const { round2 } = require('./eval-stats');
const { captureTrialArtifacts, splitTranscriptBlocks } = require('./eval-grader-io');

/**
 * Grade a trial result using a code grader (test command).
 * Accepts test command as array (exec directly) or string (run via shell).
 * Injects TRIAL_DIR env var so grader commands can reference trial artifacts.
 * Returns a new result object (does not mutate input).
 * @param {import('./eval').TrialResult} result - Trial result to grade
 * @param {string|string[]} testCommand - Test command to run
 * @param {string} projectRoot - Project root directory
 * @param {number} [assertionCount=0] - Expected scenario assertion count for labeled output
 * @returns {import('./eval').TrialResult} New result with grade
 */
function gradeWithCode(result, testCommand, projectRoot, assertionCount = 0) {
  const [cmd, args] = Array.isArray(testCommand)
    ? [testCommand[0], testCommand.slice(1)]
    : ['sh', ['-c', testCommand]];
  const env = { ...process.env };
  if (result.trialDir) env.TRIAL_DIR = result.trialDir;
  if (result.transcript) env.TRANSCRIPT_PATH = result.transcript;
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
    const labelError = validateAssertionLabels(assertions, assertionCount);
    if (labelError) {
      return {
        ...result,
        passed: false,
        score: 0,
        gradeError: true,
        errorType: labelError.errorType,
        error: labelError.error,
        ...extra,
      };
    }

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
 * Validate code-grader per-assertion labels when a scenario assertion count is known.
 * @param {{ index: number }[]} labels - Parsed labels
 * @param {number} assertionCount - Expected scenario assertion count
 * @returns {{ errorType: string, error: string }|null}
 */
function validateAssertionLabels(labels, assertionCount) {
  if (!(assertionCount > 0) || labels.length === 0) return null;

  const seen = new Map();
  const duplicates = [];
  const outOfRange = [];
  for (const label of labels) {
    if (label.index < 1 || label.index > assertionCount) outOfRange.push(label.index);
    const count = seen.get(label.index) || 0;
    if (count === 1) duplicates.push(label.index);
    seen.set(label.index, count + 1);
  }
  const missing = [];
  for (let i = 1; i <= assertionCount; i++) {
    if (!seen.has(i)) missing.push(i);
  }

  if (duplicates.length === 0 && outOfRange.length === 0 && missing.length === 0) return null;

  const details = [];
  if (missing.length > 0) details.push(`missing labels for A${missing.join(', A')}`);
  if (duplicates.length > 0) details.push(`duplicate labels for A${duplicates.join(', A')}`);
  if (outOfRange.length > 0) details.push(`out-of-range labels A${outOfRange.join(', A')}`);
  return {
    errorType: 'code_grader_assertion_labels_invalid',
    error: `Code grader emitted invalid per-assertion labels for ${assertionCount} assertions: ${details.join('; ')}`,
  };
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

module.exports = {
  gradeWithCode,
  parseAssertionLabels,
  validateAssertionLabels,
  buildCodeGraderBlockRefs,
};
