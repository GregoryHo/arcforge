# arc-evaluating v2 — Design

## Problem / Motivation

The current `arc-evaluating` skill has six interlocking weaknesses that together cap its reliability as arcforge's shipping gate for skills, agents, and workflows.

First, the implementation is physically scattered. Agents live at `agents/eval-grader.md` and `agents/eval-comparator.md` (project root). Core statistics and grader logic live at `scripts/lib/eval*.js`. The live dashboard lives at `scripts/eval-dashboard.js` + `scripts/eval-dashboard-ui.html`. Three reference docs sit under `skills/arc-evaluating/references/`. There is no single encapsulation boundary, which breaks the convention established by `skills/arc-writing-skills/` (which co-locates its four evaluation agents inside the skill folder) and makes the skill's surface area hard to discover, maintain, and version in lockstep.

Second, the "Scenario Validity Preflight" Iron Law is all prose — designers are told to hand-check baseline ceiling, answer leakage, and escape hatches before running an A/B, but nothing in the harness enforces it. Fast-iterating users skip it.

Third, `eval-comparator` currently emits SHIP / RUN_MORE_TRIALS / INVESTIGATE recommendations on top of quantitative data that already has confidence intervals. This directly contradicts arcforge's own stored feedback about not using an LLM to re-judge numbers the harness has already computed. The agent introduces LLM judgment variance into a decision path that should be deterministic.

Fourth, the harness has a statistical cliff at k=3: that is the default for code-graded runs, but `eval-stats.js` only shows a 95% confidence interval when k≥5. Users can therefore receive a SHIP verdict from a three-trial A/B where no CI was ever computed — statistical rigor present in form, missing in fact.

Fifth, the grader only verifies predefined assertions. Anthropic's `skill-creator` grader additionally extracts implicit claims from the output ("the file has 12 fields", "query was parameterized") and verifies them independently, and it critiques the quality of the predefined assertions themselves. Both practices catch blind spots that arcforge's current grader is structurally incapable of catching.

Sixth, the dashboard and HTML-viewer philosophies diverge. Arcforge's SSE+file-watcher dashboard is strong for real-time monitoring of in-flight trials, which skill-creator's static viewer cannot do. But skill-creator's 2-tab (Outputs / Benchmark) layout, auto-saving feedback textbox per eval, arrow-key navigation, and previous-iteration side-by-side view are all materially better for post-hoc human review, which arcforge's single-pane dashboard handles poorly.

## Proposed Solution / Architecture

The v2 refactor rebuilds in two layers: folder consolidation and capability upgrades.

**Folder consolidation.** Move `agents/eval-grader.md` and `agents/eval-comparator.md` into `skills/arc-evaluating/agents/`, preserving project-root subagent registration via the minimum mechanism needed (a `plugin.json` path update or a thin re-export) so `subagent_type: "arcforge:eval-grader"` continues to resolve. Rename `eval-comparator` to `eval-analyzer` in the same move. Add a new `eval-blind-comparator` agent. Move `scripts/eval-dashboard.js` + `scripts/eval-dashboard-ui.html` into `skills/arc-evaluating/dashboard/`, since those files are user-facing tooling rather than canonical engine code. Leave `scripts/lib/eval.js`, `eval-stats.js`, and `eval-graders.js` where they are — they are arcforge's canonical engine per `.claude/rules/architecture.md`, imported by the CLI dispatcher, and relocating them would break the documented canonical-source rule without benefit.

**Capability upgrades, in three waves, each independently shippable.**

Wave 1 is pure additions with zero architectural impact. Every trial records `duration_ms`, `input_tokens`, and `output_tokens`. The `grading.json` schema gains a `discovered_claims[]` field (the grader extracts implicit claims from outputs and verifies them) and a `weak_assertions[]` field (the grader critiques the assertions it just evaluated). Neither new field affects the pass rate or the verdict. The benchmark report adds token and duration delta columns next to the pass-rate delta.

Wave 2 introduces new CLI subcommands and the agent rename. `arc eval preflight <scenario>` runs 2–3 baseline pilot trials and blocks further `arc eval ab` on that scenario if pass rate ≥ 0.8 (ceiling risk) or if the scenario hash has not been preflighted; hash is tracked so iteration is fast. `arc eval lint <scenario>` validates scenario files against a JSON Schema. `arc eval audit` aggregates `discovered_claims[]` and `weak_assertions[]` across benchmark history and surfaces promotion/retirement candidates for human arbitration. The `eval-comparator` agent becomes `eval-analyzer`, loses its SHIP verdict authority, and is scoped to post-hoc pattern analysis only (why delta occurred, which assertions are non-discriminative, variance hotspots). The new `eval-blind-comparator` agent performs paired-preference rating on anonymized output pairs.

Wave 3 tightens architecture. A fourth verdict type, `INSUFFICIENT_DATA`, is introduced and returned whenever k<5 regardless of pass rate — the harness will not issue SHIP without the confidence interval. The `arc-using` routing table gains a Discipline-Skills entry for `arc-evaluating` triggered by "about to ship or merge a skill / mark a skill complete", so the evaluation gate is actively routed rather than manually remembered. Model-graded A/B runs automatically invoke the blind comparator as a supplementary signal after the main comparison, and the report shows assertion delta and blind preference rate side-by-side. The dashboard is consolidated into a single UI at the new `skills/arc-evaluating/dashboard/` location, keeping SSE real-time updates while adopting skill-creator's 2-tab layout, auto-save feedback textboxes, and keyboard navigation.

**Methodology.** Validation of the v2 skill itself uses `arc-writing-skills` as the primary methodology (pressure-scenario RED/GREEN/REFACTOR with its existing `skill-grader`, `skill-analyzer`, `skill-comparator`, `description-tester` agents), with `skill-creator`'s claim-extraction and blind-comparator patterns borrowed as concept references.

## Identifiable Requirements

The system must record `duration_ms`, `input_tokens`, and `output_tokens` for every trial and persist them to the trial result file. The benchmark-report output must expose these as delta metrics alongside pass rate.

The `grading.json` schema must support a `discovered_claims[]` array of claim objects (each carrying text, category, verdict, and evidence) populated per trial by the grader. Claims must not be counted in the pass rate that drives the verdict.

The `grading.json` schema must support a `weak_assertions[]` array where the grader critiques individual predefined assertions it just evaluated. These critiques must not affect the verdict; they are consumed downstream by the audit command.

A `arc eval preflight <scenario>` subcommand must run 2–3 baseline pilot trials, compute pass rate, and block further `arc eval ab` on the same scenario hash when baseline ceiling is reached or when the scenario has not been preflighted. Hash tracking must allow skipping preflight when the scenario file has not changed.

A `arc eval lint <scenario>` subcommand must validate a scenario file against a JSON Schema defining required fields, Setup reproducibility, and Grader Config shape.

A `arc eval audit` subcommand must aggregate `discovered_claims[]` and `weak_assertions[]` across the benchmark history and emit promotion and retirement candidate lists for human review.

The `eval-comparator` agent must be renamed to `eval-analyzer`, must not emit SHIP / RUN_MORE / INVESTIGATE verdicts, and must restrict its output to post-hoc pattern analysis. The CLI must stop parsing verdict strings from the agent.

A new `eval-blind-comparator` agent must rate anonymized output pairs using a task-derived rubric and return winner / tie / reasoning. Model-graded A/B must invoke it automatically after the main comparison and surface the preference rate in the report.

The verdict layer must return `INSUFFICIENT_DATA` whenever k<5, regardless of pass rate, and the harness must refuse to emit SHIP on that path.

The `arc-using` routing table must list `arc-evaluating` under Discipline Skills with a trigger condition tied to "about to ship or merge a skill / claim skill completion".

The dashboard implementation must move to `skills/arc-evaluating/dashboard/`, retain the SSE real-time monitoring channel, and adopt a 2-tab layout (Outputs / Benchmark), auto-saving per-eval feedback textboxes, and arrow-key navigation.

The two existing eval agents must be reachable inside the skill folder while continuing to be invocable as `subagent_type: "arcforge:eval-grader"` and `subagent_type: "arcforge:eval-analyzer"` without breakage during the migration.

## Scope

Within scope: implementation and test coverage for all eleven requirements above; migration of the agents and dashboard into the skill folder with backward-compatible subagent registration; rewriting or amending the existing three reference docs under `skills/arc-evaluating/references/` as CLI and verdict policy change; light updates to `.claude/rules/eval.md` where the rule now contradicts v2 behavior; use of `arc-writing-skills` to validate v2 skill-level behavior through pressure scenarios; three-wave ship cadence with each wave mergeable independently and each wave eatable as dogfood by the next.

Out of scope: a full opt-in `--blind` mode where paired preference becomes the primary verdict — only the minimal supplementary signal is in scope, and the full paradigm shift is deferred until the supplementary signal demonstrates value. Static HTML export of the viewer — arcforge stays on SSE-first Node.js, not the Python-based `generate_review.py` approach. Train/test split for skill-description trigger optimization — if that becomes needed, it belongs in a separate skill such as `arc-tuning-descriptions`, not inside `arc-evaluating`. Restructuring of the three-scope (skill / agent / workflow) evaluation framework — the scope taxonomy is preserved as-is. Migration of `scripts/lib/eval*.js` into the skill folder — the canonical-engine rule in `.claude/rules/architecture.md` wins, and the split creates a clean separation between skill-owned tooling (agents, dashboard, references, scenarios) and canonical engine. Any automated mutation of existing scenario files in `evals/scenarios/` — those remain untouched by this spec and will only change if authors choose to adopt new CLI subcommands.
