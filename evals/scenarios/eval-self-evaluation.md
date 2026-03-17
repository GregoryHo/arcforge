# Eval: eval-self-evaluation

## Scope
workflow

## Scenario
Verify the complete eval harness pipeline by exercising every stage:
parseScenario → runTrial (simulated) → gradeWithCode → gradeWithModel (mocked) → appendResult → loadResults → passAtK → passAllK → computeDelta → getVerdict → generateBenchmark.

This is a self-referential eval — the eval harness evaluating its own correctness.

## Context
The eval harness lives in scripts/lib/eval.js with 56 unit tests in tests/scripts/eval.test.js covering: scenario parsing, prompt building, scenario listing, JSONL roundtrip with cross-contamination protection, metric computation (passAtK, passAllK, computeDelta), verdict classification, benchmark generation, code grading via shell, model grading via mocked Claude, transcript saving, grader dispatch, and skill eval A/B orchestration.

## Assertions
- [ ] All 56 eval.js unit tests pass (parseScenario, buildTrialPrompt, listScenarios, appendResult/loadResults, passAtK, passAllK, computeDelta, getVerdict, generateBenchmark, ensureEvalsDir, gradeWithCode, gradeWithModel, saveTranscript, gradeTrialResult, runSkillEval)
- [ ] loadResults does not cross-contaminate evals with similar name suffixes
- [ ] gradeWithCode handles shell quoting via sh -c for string commands
- [ ] gradeWithModel parses JSON grades from mixed markdown responses
- [ ] Benchmark generation produces valid JSON with pass_rate, avg_score, and verdict fields
- [ ] CLI eval commands work: eval list, eval report

## Grader
code

## Grader Config
npm run test:scripts && node scripts/cli.js eval list && node scripts/cli.js eval report --json
