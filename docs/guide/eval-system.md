# Eval System

## Core Mechanism

arc-evaluating measures whether skills, agents, and workflows actually change AI agent behavior. The fundamental problem: AI agents are stochastic — same input, different output each time. You can't run once and conclude. The solution is controlled experimentation.

The mechanism is an **A/B experiment**:

```
Same Scenario (task)

  Baseline (no skill)   → Result A
  Treatment (with skill) → Result B

  Delta = B - A = actual effect of the skill
```

If delta ≈ 0, the skill didn't change behavior — regardless of how well-written it appears. This runs k times (not once) with statistical aggregation (Welch's t-test, 95% CI) to account for stochastic variance.

## Three Scopes

Every eval answers one of three questions. The question determines the scope, which determines what varies and what stays fixed.

| Scope | Question | What Varies | What Stays Fixed |
|-------|----------|-------------|------------------|
| **Skill** | Did this skill change behavior? | Prompt (skill injected or not) | Scenario, model, environment |
| **Agent** | Can this agent complete the task? | Trial-to-trial execution | Task, environment, assertions |
| **Workflow** | Does the toolkit improve outcomes? | Environment (bare agent vs full toolkit) | Prompt, model, scenario |

**Skill vs Workflow** — the most common confusion:
- Skill eval varies the **prompt** (`--skill-file` injects the skill). Tests one specific instruction set.
- Workflow eval varies the **environment** (plugins, MCP, CLAUDE.md, rules all active vs stripped). Tests systemic value.
- Using `--skill-file` for a workflow eval is wrong — it turns into a skill eval.

**If the question is "does this infrastructure work?"** — use unit tests, not evals. The harness measures Claude's behavior, not code correctness.

## Scenario Design

### The Discriminative Scenario Problem

Most eval failures trace to poorly designed scenarios, not poorly designed skills. A non-discriminative scenario produces delta ≈ 0 even when the skill is effective — because baseline already handles the task through generic competence.

### Validity Preflight (run before every eval)

1. **Expected baseline failure** — Complete: "Without the skill, the agent will fail because ___." If you can't name the failure mode, the scenario lacks discriminative power.
2. **Ceiling/floor risk** — Run 2-3 pilot trials. Baseline > 0.8 → ceiling, redesign. Both near 0 → floor, redesign.
3. **Answer leakage** — Read the prompt without the skill. If a competent agent infers the answer from the prompt alone, the answer is leaked.
4. **Escape hatches** — Can the agent dissolve the tension instead of solving it (rewriting the task, simplifying the code)?
5. **Output complexity** — Prefer short structured outputs. Long outputs increase grading noise.

### Design Principles

- **One behavior per scenario** for skill adherence testing. Isolate so lift can be attributed to one instruction.
- **Include a trap** that baseline agents mishandle. Without a discriminative trap, you measure generic competence.
- **Prefer 3-5 narrow scenarios** over one overloaded scenario. Add a capstone only after isolated behaviors are stable.
- **Make ground truth defensible.** Assertions must be verifiable from the provided context, not from hidden conventions.

### When to Stop

If 2+ redesigns still don't produce a discriminative scenario:
- The skill may formalize behavior agents already exhibit
- The eval scope may be wrong (try workflow instead of skill)
- The behavior may not be measurable via A/B

Escalate to the user rather than iterating silently.

## Grading

Three grader types match three kinds of assertions. Match grader to assertion nature, not convenience.

| Grader | Use When | Not For |
|--------|----------|---------|
| **Code** | Deterministic facts (file exists, test passes, value matches) | Quality or intent — don't rewrite assertions into grep proxies |
| **Model** | Intent, quality, reasoning ("identifies root cause", "explanation is clear") | Checks verifiable by running commands — adds noise without value |
| **Human** | Taste, domain expertise ("feels intuitive", "tone matches brand") | Assessments an LLM can judge — save human bandwidth |

**Key principle:** Structured output (valid JSON, typed fields) does not make quality deterministic. An agent can return correctly structured JSON with poor analysis. Structure → code grader. Quality → model grader. When both aspects matter, split into two scenarios.

### Grader Mechanics

- **Code grader**: Runs test command, checks exit code. `$TRIAL_DIR` available. Echo `A1:PASS` or `A1:FAIL:reason` for per-assertion results.
- **Model grader**: Reads `skills/arc-evaluating/agents/eval-grader.md` methodology. Scores each assertion 0.0-1.0. Uses trial artifacts as evidence.
- **Human grader**: Presents output + checklist for manual review.

## Metrics

| Metric | Formula | Use |
|--------|---------|-----|
| `pass@k` | At least 1 success in k trials | Reliability — "does it ever work?" |
| `pass^k` | All k trials succeed | Critical paths — "does it always work?" |
| `delta` | Treatment score - Baseline score | Improvement — "is it better?" |
| `CI95` | 95% confidence interval (Welch's t-test) | Shown when k >= 5 — "is the difference statistically real?" |

### Default Trial Counts

| Eval type | Code grader | Model grader |
|-----------|-------------|--------------|
| Single run (`eval run`) | k=3 | k=5 |
| A/B (`eval ab`, per group) | k=5 | k=10 |

A/B needs more data for meaningful delta. Model grading adds noise, requiring more trials.

### Ship Verdicts

| Verdict | Condition |
|---------|-----------|
| **SHIP** | Code-graded: 100% pass rate. Model-graded: CI95 lower bound ≥ 0.8 |
| **NEEDS WORK** | 60% ≤ pass rate < ship threshold |
| **BLOCKED** | Pass rate < 60% |

## CLI

```
arc eval list                                    # List all scenarios
arc eval run <name>                              # Run trials (k auto-determined)
arc eval run <name> --k 5                        # Override trial count
arc eval run <name> --model sonnet               # Specify model
arc eval ab <name> --skill-file path             # Skill A/B (varies prompt)
arc eval ab <name>                               # Workflow A/B (varies environment)
arc eval compare <name>                          # Compare A/B results
arc eval compare <name> --since 2026-03-18       # Filter by date
arc eval report                                  # Generate benchmark report
arc eval dashboard                               # Live web dashboard (:3333)
```

## Storage

```
evals/
├── scenarios/          # Eval definitions (version controlled)
├── results/            # Run results (gitignored)
│   └── <scenario>/
│       └── <runId>/    # YYYYMMDD-HHmmss
│           ├── results.jsonl
│           ├── baseline.jsonl
│           ├── treatment.jsonl
│           └── transcripts/
└── benchmarks/
    └── latest.json     # Aggregated benchmarks (version controlled)
```

## Common Mistakes

| Mistake | What Happens | Fix |
|---------|-------------|-----|
| Scenario before question | Mixes adherence + correctness + toolkit effects | State the question first |
| Baseline at ceiling | Both pass, delta ≈ 0 | Pilot 2-3 trials, redesign if baseline > 0.8 |
| Skill formalizes generic behavior | A/B delta is zero | Ask "would baseline behave differently without this skill?" |
| Code-grading via competence proxy | Checks artifacts baseline produces anyway | Mentally run code grader against baseline first |
| Testing infrastructure not behavior | "File exists" passes trivially | Ask "does this measure Claude's behavior or a side-effect?" |
| `--skill-file` for workflow eval | Varies prompt instead of environment | Workflow A/B: no `--skill-file` |

Full catalog (23 entries): `skills/arc-evaluating/references/common-mistakes-catalog.md`

## Agents

| Agent | Role |
|-------|------|
| **eval-grader** | Grade individual trial outputs against rubrics (model-graded scenarios) |
| **eval-analyzer** | Post-hoc qualitative A/B analysis for model/human-graded results |
| **eval-blind-comparator** | Anonymized paired-preference rating of A/B outputs |

Numeric comparison (delta, CI, verdict) is programmatic — computed by the harness. These agents add qualitative analysis, not numeric computation.
