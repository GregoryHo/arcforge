# Research Config: arc-evaluating skill optimization

## Scope
CAN modify: skills/arc-evaluating/SKILL.md
CANNOT modify: evals/scenarios/, scripts/, tests/, hooks/, any other skill

## Goal
Metric: treatment_avg_score
Direction: higher-is-better
Target: 1.00

## Evaluation
Run command: node scripts/cli.js eval ab eval-grader-selection --k 2 2>&1 | tee run.log
Extract metric: grep "Treatment:" run.log | sed 's/.*avg //' | sed 's/,.*//'
Timeout: 600

## Constraints
Soft constraints: Do not regress eval-scenario-splitting or eval-trap-design scores. Keep SKILL.md under 400 lines. Preserve all existing section headings.

## Autonomy
Mode: run-N-times
Max iterations: 10

## Simplicity Criterion
When two SKILL.md versions achieve similar scores, prefer the shorter one with fewer lines changed from baseline.
