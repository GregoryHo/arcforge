# Eval: eval-harness-basic

## Scope
workflow

## Scenario
Verify the eval harness library functions work correctly by running the unit test suite. This is a self-referential eval — the eval harness tests its own infrastructure.

## Context
The project has Jest tests in tests/scripts/eval.test.js covering parseScenario, buildTrialPrompt, listScenarios, appendResult/loadResults roundtrip, metrics (passAtK, passAllK, computeDelta), getVerdict, generateBenchmark, ensureEvalsDir, and gradeWithCode.

## Assertions
- [ ] parseScenario extracts all required fields from markdown
- [ ] JSONL roundtrip preserves data integrity
- [ ] loadResults does not cross-contaminate evals with similar name suffixes
- [ ] passAtK and passAllK compute correct values
- [ ] getVerdict returns correct classification at all thresholds
- [ ] generateBenchmark produces valid benchmark JSON
- [ ] gradeWithCode does not mutate input result

## Grader
code

## Grader Config
npm run test:scripts
