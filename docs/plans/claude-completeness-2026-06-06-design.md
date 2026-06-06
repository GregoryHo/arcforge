# Claude Code Completeness — 2026-06-06

Contributor design note. Captures the analysis, decisions, and changes from the
"make Claude Code completeness solid" effort so they survive compaction. Not shipped
(docs/plans/ is contributor-facing).

## Context

Started from a full inventory of hooks (10 modules / 12 handlers / 9 events), skills
(33 real `arc-*`), and cross-platform compatibility (Claude Code / Codex / Gemini /
OpenCode). Headline finding: **Skills are arcforge's only portable layer**; everything
that makes workflows self-policing (hooks, commands, subagents, env injection,
marketplace) is Claude-Code-only. This effort focused on hardening the Claude Code
surface specifically.

## What shipped (commits on `chore/clean-up`)

| Commit | Change |
|--------|--------|
| `41c3cf4` | Remove the `log-lightweight` telemetry hook (zero consumers; dropped a python3 dep + an 8-event fan-out). Dropped the now-empty SubagentStop/PermissionRequest/SessionEnd event keys. |
| `c5a0c31` | Fix two `arc-guard` false-positive vectors (verified by running the regex / reading the gate): `LOOP_RE` matched any `*loop.js` → narrowed to `scripts/loop.js`; R-immutable gated on filename only → added a contract-content check. Tighten-the-signal, not downgrade-the-tier. + FP regression tests. |
| `f949830` | Add an `arc-remind` SDD `spec.xml`→`dag.yaml` soft nudge (deterministic, keyed to the written spec-id, once/spec-id). |
| `0152635` | Clarify the arc-writing-skills ↔ arc-evaluating boundary (see below). |

All 5 test runners green throughout (Jest 1842, hooks 242, node 22, skills 541,
observer-daemon 16). Lint clean.

## Routing reliability — the load-bearing conclusion

Goal was "ICL routing is unreliable; back it with hooks." The honest result, which is
counter to the framing:

- **Hard gates** (arc-guard, PreToolUse deny) only work on *observable actions that a
  marker self-gates to near-zero false-positive probability*. All such invariants are
  already shipped (worktree git-merge, worktree-launched loop, research scope). **There
  is essentially no new hard gate to add.**
- **Routing decisions are pre-action intent** — a hook fires on a tool call or prompt and
  cannot read the model's intent to pick a skill. So routing decisions **cannot be
  hard-enforced at all.**
- The levers split by **audience**, and this is the whole point:
  - `arc-remind` emits `systemMessage` → goes to the **USER**, not Claude. A PostToolUse
    nudge improves the *human's* catch of a missed gate; it does **not** make Claude route
    better.
  - `additionalContext` (UserPromptSubmit/SessionStart) → goes to **Claude**. This is the
    only hook lever that actually steers Claude's routing — a signal-triggered, sharper
    form of ICL, never a hard gate.
- The real lever for the semantic/ICL-only routes is **not a hook at all**: stronger skill
  descriptions. arc-using is correctly *situational ICL*, not a catalog (see below).

### Shipped vs deferred routing work

- **Shipped:** SDD `spec.xml`→`dag.yaml` soft nudge (`arc-remind`).
- **Deferred — test-fail→arc-debugging nudge:** a failing `npm test` exits non-zero without
  reliably setting `tool_response.is_error`, and parsing stdout (`FAIL` / `0 failing`) is
  flaky across runners. Not worth a noisy nudge. Reconsider only if a reliable failure
  signal appears.
- **Deferred — obsidian-audit `additionalContext` keyword hint:** the only genuinely
  Claude-facing new candidate, but keyword matching (`orphan`/`links`) over-fires; it is a
  cheap-to-ignore hint, not a block. Weakest-justified new surface; left to description
  strengthening for now.

## arc-writing-skills ↔ arc-evaluating boundary (option C)

**Problem:** the two skills' responsibilities were tangled. arc-writing-skills carried 4
eval agents + eval-schemas, an absolutist Iron Law ("delete it, start over", "no exceptions
… not for documentation updates") that contradicted arc-evaluating's already-correct policy
("not required when the change has no behavioral footprint").

**Decision (option C — consolidate eval into arc-evaluating):**

- **arc-evaluating owns all measurement/eval.** Moved `skill-grader` (the unique
  rationalization-mining grader) and `eval-schemas.md` into `skills/arc-evaluating/`.
- **Cut as redundant:** `skill-comparator` (= arc-evaluating's `eval-blind-comparator`),
  `skill-analyzer` (= `eval-analyzer`), `description-tester`.
- **arc-writing-skills focuses on creation.** Iron Law rewritten to neutral,
  reasoning-based "Test-Driven Skill Creation" guidance in skill-creator's tone (baseline
  first → write to observed failures → close gaps), deferring the ship gate to
  arc-evaluating. STOP/TodoWrite ceremony softened.
- **Edit/eval policy** moved to arc-evaluating with the right line: **behavioral footprint**,
  not edit size and not whether you call it "docs" (a skill IS docs — can't dodge by
  relabeling). Updated `.claude/rules/skills.md` accordingly.

**Follow-up (not done):** `eval-schemas.md` (moved into arc-evaluating/references/) overlaps
arc-evaluating's existing `grading-and-execution.md` / `cli-and-metrics.md`. A future pass
could reconcile/merge them. Two stale agent attributions inside eval-schemas were fixed.

## arc-using — confirmed situational ICL (no change)

Reviewed against "skills auto-register, so arc-using should be situational ICL, not a
catalog." arc-using is **already** correct: it lists zero skills-with-descriptions and
contains only disambiguation that descriptions can't provide (SDD pipeline order,
condition→gate Discipline Triggers, the 5-way diary/instinct disambiguation, the Worktree
Rule, When-Not-to-Route). The earlier "close the index gaps" idea was the mistake and was
**not** applied — arc-researching/arc-finishing-epic/command-only skills are reachable by
their own descriptions, handoffs, slash commands, and arc-guard enforcement.

## Open items for a future pass

- Reconcile `eval-schemas.md` with arc-evaluating's existing reference docs.
- Description-strengthening for the genuinely-semantic ICL-only routes (arc-tdd "about to
  write production code", arc-debugging unknown-cause, arc-receiving-review) — behavioral
  changes, so run an eval per the new policy.
- Decide whether the obsidian-audit `additionalContext` hint is worth its keyword noise.
