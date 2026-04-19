# CLI, Metrics, and Infrastructure Reference

## CLI Reference

```
arc eval list                                          # List all scenarios
arc eval run <name>                                    # Run trials (k auto-determined by scope+grader)
arc eval run <name> --k 5                              # Override default k
arc eval run <name> --model sonnet                     # Run with specific model
arc eval ab <skill-scenario> --skill-file path         # Skill A/B (varies prompt)
arc eval ab <workflow-scenario> --interleave            # Workflow A/B (varies environment)
arc eval ab <name> --skill-file path --model opus      # A/B with specific model
arc eval compare <name>                                # Compare saved A/B results (routes by grader type)
arc eval compare <name> --since 2026-03-18             # Compare only results after a date
arc eval compare <name> --model sonnet                 # Compare filtered by model
arc eval report [name]                                 # Generate benchmark report
arc eval report [name] --model opus                    # Report filtered by model
arc eval history                                       # List benchmark snapshots
arc eval dashboard [--port N]                          # Start live dashboard (default: 3333)
```

- k is auto-determined from scope + grader type (see default trial counts below). Use `--k` to override.
- `--since` filters results by date — useful after scenario changes to exclude old data.
- `--model` specifies which LLM to use for trial execution (not grading). Results are tagged with the model for later filtering and cross-model comparison.
- For skill scope, `--skill-file` is required. For workflow scope, it is not needed.
- `eval compare` auto-routes: code-graded → programmatic delta, model-graded → eval-analyzer agent analysis.
- `eval dashboard` starts a live web dashboard at http://localhost:3333 for visual eval monitoring.

## Metrics

| Metric | Formula | Use |
|--------|---------|-----|
| `pass@k` | At least 1 success in k trials | Reliability — "does it ever work?" |
| `pass^k` | All k trials succeed | Critical paths — "does it always work?" |
| `delta` | Treatment score - Baseline score | Improvement — "is it better?" |
| `delta CI` | 95% CI for delta (Welch's t-test) | When k ≥ 5: IMPROVED if lower > 0, REGRESSED if upper < 0 |
| `CI95` | 95% confidence interval (t-distribution) | Only shown when k >= 5 — "how precise is the average?" |

### Default Trial Counts (scenario-driven)

k is determined by eval type and grader, not a fixed default:

| Eval type | Code grader | Model grader |
|-----------|-------------|--------------|
| `eval run` (single condition) | k=3 | k=5 |
| `eval ab` (A/B, per group) | k=5 | k=10 |

A/B needs more data for meaningful delta. Model grading adds noise, requiring more trials.

Override with `## Trials` in the scenario file, or `--k` on the CLI.

## Storage Layout

```
evals/
├── scenarios/                    # Eval definitions (version controlled)
├── results/                      # Run results (gitignored)
│   └── <scenarioName>/           # Grouped by scenario
│       └── <runId>/              # Grouped by run (YYYYMMDD-HHmmss)
│           ├── results.jsonl     # Single-run trials
│           ├── baseline.jsonl    # A/B baseline trials
│           ├── treatment.jsonl   # A/B treatment trials
│           └── transcripts/      # Full trial outputs
└── benchmarks/                   # Aggregated benchmarks (JSON, version controlled)
    └── latest.json
```

## Available Agents

| Agent | Role | Used By |
|-------|------|---------|
| **eval-grader** | Grade individual eval outputs against rubrics | `arc eval run` (automated, model-graded scenarios) + manual dispatch |
| **eval-analyzer** | Post-hoc qualitative analysis of A/B results | `arc eval compare` (automated, model/human-graded scenarios) + manual dispatch |
| **eval-blind-comparator** | Anonymized paired-preference rating of A/B outputs | Manual dispatch (auto-trigger wired in grader-blind epic) |

**Important:** Numeric comparison is programmatic. The harness computes averages, `delta`, confidence intervals, and verdicts directly from saved results. `eval-analyzer` adds **qualitative** analysis for model/human-graded A/B results; it does not replace the programmatic numeric verdict.

## Scenario Template

Create scenario files in `evals/scenarios/`:

```markdown
# Eval: [name]

## Scope
[skill | agent | workflow]

## Target
[What this eval tests. Meaning varies by scope:]
[  skill: path to skill file (e.g., skills/arc-tdd/SKILL.md) — used as default --skill-file]
[  agent: path to agent definition (e.g., agents/eval-grader.md) — documentation]
[  workflow: description of the toolkit/pipeline being tested — documentation]

## Scenario
[The task or prompt to give the agent]

## Context
[Background info the agent needs to complete the task]

## Setup
[Shell command to prepare trial directory. Use $PROJECT_ROOT to copy project files.]
[Leave empty if the agent only needs the prompt Context to respond.]

## Assertions
- [ ] [Specific, verifiable criterion 1]
- [ ] [Specific, verifiable criterion 2]

## Grader
[code | model | human]

## Grader Config
[For code: test command. For model: grading rubric. For human: review checklist]

## Trials
[Optional: explicit trial count. Omit to use scenario-driven defaults.]

## Version
[Optional: bump when assertions change materially. Filters out stale historical results.]
```
