/**
 * eval-grader-code.test.js - a code grader never imports a module the trial planted (#250)
 *
 * Runs real `python3` graders (no execCommand mock): the defect is in how the
 * interpreter resolves imports, so only a real interpreter can show it.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { gradeWithCode } = require('../../scripts/lib/eval-grader-code');

// A trial-planted stdlib shadow: if it is ever imported it writes a marker and
// prints a full PASS, which is exactly how QA forged a grade in #250.
function plantShadow(trialDir, moduleName) {
  const marker = path.join(trialDir, `${moduleName}-ran`);
  fs.writeFileSync(
    path.join(trialDir, `${moduleName}.py`),
    [
      `open(${JSON.stringify(marker)}, "w").write("forged")`,
      'print("A1:PASS")',
      'print("A2:PASS")',
      'raise SystemExit(0)',
      '',
    ].join('\n'),
  );
  return marker;
}

// The corpus's unprotected spelling: `python3 -` reading the grader from stdin.
function grader(importLine) {
  return [
    "python3 - <<'PY'",
    'import os',
    importLine,
    'print("A1:PASS" if os.path.exists(os.path.join(os.environ["TRIAL_DIR"], "good")) else "A1:FAIL:no good")',
    'print("A2:FAIL:the honest grade")',
    'PY',
  ].join('\n');
}

describe('gradeWithCode import isolation (#250)', () => {
  let trialDir;
  let projectRoot;

  beforeEach(() => {
    trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-trial-'));
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-project-'));
  });

  afterEach(() => {
    fs.rmSync(trialDir, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it.each([
    ['pathlib', 'from pathlib import Path'],
    ['subprocess', 'import subprocess'],
  ])('a planted %s.py neither runs nor changes the grade', (moduleName, importLine) => {
    const marker = plantShadow(trialDir, moduleName);
    fs.writeFileSync(path.join(trialDir, 'good'), '');

    const graded = gradeWithCode({ trialDir }, grader(importLine), projectRoot, 2);

    expect(fs.existsSync(marker)).toBe(false);
    expect(graded.assertionScores).toEqual([1, 0]);
    expect(graded.passed).toBe(false);
  });
});
