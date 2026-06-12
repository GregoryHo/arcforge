# Baseline Test: arc-dispatching-parallel

**Date:** 2026-01-17
**Scenario:** Identify parallelizable features from dag.yaml

## Expected Baseline Behavior

Without the skill, agents typically:
- May not correctly parse DAG dependencies
- Might suggest sequential execution to be "safe"
- Could miss some parallelizable features
- Might not explain why certain features must wait

## What the skill needs to address

1. **DAG parsing:** Correctly read and understand dag.yaml structure
2. **Dependency resolution:** Identify which features are "ready" (all deps complete)
3. **Grouping:** Group independent features that can run in parallel
4. **Explanation:** Clearly explain why blocked features must wait
5. **Feature-level focus:** Emphasize this is feature-level (not epic-level) parallelization
6. **CLI integration:** Reference arc-coordinating if available

## Key Insights

- Parallelization requires careful dependency analysis
- Must distinguish "ready" from "blocked" features
- Feature-level vs epic-level parallelization is important distinction
