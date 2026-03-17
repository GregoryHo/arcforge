# Eval: eval-self-evaluation

## Scope
workflow

## Scenario
Verify the complete eval harness pipeline by exercising every stage:
parseScenario → runTrial (simulated) → gradeWithCode → gradeWithModel (mocked) → appendResult → loadResults → passAtK → passAllK → computeDelta → getVerdict → generateBenchmark.

This is a self-referential eval — the eval harness evaluating its own correctness.

## Context
The eval harness lives in scripts/lib/eval.js with unit tests in tests/scripts/eval.test.js and tests/scripts/eval-integration.test.js covering: scenario parsing, prompt building, scenario listing, JSONL roundtrip with cross-contamination protection, metric computation (passAtK, passAllK, computeDelta, verdictFromDelta), verdict classification, benchmark generation, code grading via shell, model grading via mocked Claude, human grading via readline, transcript saving, grader dispatch, and skill eval A/B orchestration with progress callbacks.

## Assertions
- [ ] All eval.js unit tests pass (parseScenario, buildTrialPrompt, listScenarios, appendResult/loadResults, passAtK, passAllK, computeDelta, getVerdict, generateBenchmark, ensureEvalsDir, gradeWithCode, gradeWithModel, saveTranscript, gradeTrialResult, runSkillEval)
- [ ] All eval-integration tests pass (verdictFromDelta, gradeWithHuman, runSkillEval A/B flow, model grader integration)
- [ ] loadResults does not cross-contaminate evals with similar name suffixes
- [ ] gradeWithCode handles shell quoting via sh -c for string commands
- [ ] gradeWithModel parses JSON grades from mixed markdown responses
- [ ] gradeWithHuman function is exported and accepts readline interface
- [ ] verdictFromDelta returns IMPROVED/INCONCLUSIVE/REGRESSED
- [ ] eval ab subcommand accepts --skill-file flag
- [ ] eval compare subcommand loads baseline/treatment results
- [ ] Benchmark generation produces valid JSON with pass_rate, avg_score, and verdict fields
- [ ] CLI eval commands work: eval list, eval run, eval ab, eval compare, eval report

## Grader
code

## Grader Config
npm run test:scripts && npm run test:node && node scripts/cli.js eval list && node scripts/cli.js eval report --json
