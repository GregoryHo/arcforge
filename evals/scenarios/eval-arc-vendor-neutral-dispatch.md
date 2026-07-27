# Eval: eval-arc-vendor-neutral-dispatch

> **Preflight (2026-07-09): BLOCK** — baseline ~100%, non-discriminative _as authored_. Kept as a **regression tripwire**, not a lift gate. `eval run` "SHIP" here is single-condition pass-rate, NOT discriminative evidence.

## Scope
skill

## Target
skills/arc-auditing-spec/SKILL.md

## Scenario
You are running inside the **Codex CLI**. This session is **not** Claude Code —
it is a different agent harness with its own tool set. arcforge's spec-audit
workflow originated on Claude Code; you are now running it on Codex.

A teammate invoked a spec audit over the `payments` spec, and you have already
confirmed the spec directory exists. You are now at the fan-out step of the
audit: you must launch three independent, read-only reviewer sub-agents **at the
same time**, one per audit axis —

- `cross-artifact-alignment`
- `internal-consistency`
- `state-transition-integrity`

Each reviewer reads the spec artifacts and returns its findings; you then
aggregate the three result sets.

Describe exactly how you will launch these three reviewers concurrently in
**this** session — name the dispatch mechanism you will use and how the three
run in parallel. Keep your answer to the dispatch plan.

Constraints:
- Describe your plan in prose. Do **not** call any tools in this trial.
- Do not write the audit report or invent findings — only explain how you
  dispatch the three reviewers.

## Context
This is a no-tool, describe-only behavioral eval for `arc-auditing-spec` running
on a **non-Claude harness**. arcforge skills are meant to be platform-agnostic:
they speak in vendor-neutral actions ("dispatch a subagent") and map those
actions to each harness's real tools via
`skills/arc-using/references/codex-tools.md`. On Codex,
subagent dispatch is `spawn_agent` / `wait_agent` / `close_agent`; Claude Code's
`Task` tool does not exist here.

The target behavior: on the Codex framing, the agent dispatches the three audit
axes using the harness's real subagent mechanism (or vendor-neutral phrasing
that defers to the harness tool map) — it does **not** emit a dead Claude-only
`Task` tool call that this session cannot execute.

The trap: "three parallel Task tool calls" is a strong Claude idiom for parallel
subagents, and this task (fan out three read-only reviewers at once) is its
canonical shape. A bare agent, absent the skill's harness-aware guidance, tends
to reach for it reflexively — a dead call on Codex. The `arc-auditing-spec`
treatment reworded Phase 1 dispatch from "three parallel Task tool uses" to
"subagent dispatch" and points the agent at the per-harness tool map, so it
adapts to Codex instead of assuming Claude Code's tools.

The environment is fictional (the trial itself runs on Claude); this is why the
agent must describe rather than execute — a real `Task` / `spawn_agent` call
cannot be made here and would only pollute the signal.

## Assertions
- [ ] A1: The plan launches the three audit axes via a Codex-appropriate subagent dispatch — Codex's real subagent tool (`spawn_agent` / `wait_agent` / `close_agent`), OR vendor-neutral phrasing ("dispatch a subagent per axis", "spawn three subagents", "launch the three reviewers in parallel using this harness's subagent mechanism"), OR an explicit deferral to the harness tool map / `codex-tools.md`. It does not rely on Claude Code's `Task` tool as the named mechanism.
- [ ] A2: The plan does NOT present a literal Claude-only `Task` tool call (e.g. "three parallel Task tool uses") as the mechanism it will execute on this Codex session. Naming the `Task` tool only to contrast or negate it ("Codex has no Task tool, so instead I …") does not fail this assertion.
- [ ] A3: The plan treats the dispatch tool as harness-specific — it anticipates Codex's own subagent tooling, or consults the arcforge per-harness tool map, rather than assuming Claude Code's tool set is present unchanged.

## Grader
model

## Grader Config
Score each assertion 0.0 or 1.0, then average. Judge only the agent's described
dispatch plan; the transcript is a single prose response and no tools were run.

Assertion 1 (A1): PASS (1.0) if the described dispatch mechanism is EITHER
Codex's real subagent tool (`spawn_agent` / `wait_agent` / `close_agent`), OR
vendor-neutral ("dispatch a subagent per axis", "spawn three subagents", "launch
the three reviewers in parallel using this harness's subagent mechanism"), OR an
explicit deferral to the harness tool map / `codex-tools.md`. FAIL (0.0) if the
ONLY dispatch mechanism named is Claude Code's `Task` tool, or if no concrete
dispatch mechanism is given at all.

Assertion 2 (A2): PASS (1.0) if the plan does not instruct a literal `Task` tool
call as the live dispatch mechanism for this Codex session. FAIL (0.0) if the
plan says it will dispatch "using the Task tool" / "with three parallel Task
tool calls" (or otherwise treats the Claude `Task` tool as the mechanism it will
actually run here). A contrastive or negating mention ("Codex has no Task tool,
so instead I use …") is a PASS, not a FAIL — score on the mechanism the agent
commits to executing, not on the word "Task" appearing.

Assertion 3 (A3): PASS (1.0) if the plan shows harness-awareness — it names or
anticipates Codex's own subagent tooling, or defers to the arcforge per-harness
tool map, or otherwise makes clear the dispatch tool is chosen for Codex rather
than assumed from Claude Code. FAIL (0.0) if the plan assumes Claude Code's tool
set applies unchanged (e.g. reaches for the `Task` tool as if this were Claude
Code), or gives no indication it recognizes the harness difference.

## Trials
5

## Version
1
