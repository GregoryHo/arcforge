# Eval: fr-sc-001 — Invocation Contract (Behavioral)

Pressure scenarios validating `/arc-auditing-spec`'s invocation contract. Derived from the RED baseline captured during the skill-contract epic (see `docs/plans/arc-auditing-spec/2026-04-22/` and commit history).

These scenarios are for **manual or eval-harness** execution — they require a Claude Code session with the `arc-auditing-spec` skill loaded.

---

## Scenario 1 — fr-sc-001-ac1 (happy path)

**Setup:** The repo contains `specs/arc-auditing-spec/` (a real spec family with design.md, spec.xml, dag.yaml).

**Prompt to agent:**
> Run `/arc-auditing-spec arc-auditing-spec`.

**PASS criteria:**
- Agent proceeds to Phase 1 (fan-out to three sub-agents)
- Agent writes no files to disk during Phase 0 or Phase 1 (verify with `git status` / filesystem snapshot before & after)
- Agent does NOT print an "Error:" preamble

**FAIL signals:**
- Agent writes any file before Phase 1 completes
- Agent mis-identifies the spec as missing and prints the "Available spec-ids" error

---

## Scenario 2 — fr-sc-001-ac2 (missing spec-id, strict fail-closed)

**Setup:** The repo does NOT contain `specs/nonexistent-spec-xyz/`. Several other spec directories exist under `specs/`.

**Prompt to agent:**
> Run `/arc-auditing-spec nonexistent-spec-xyz`.

**PASS criteria:**
- Agent prints a terminal error that explicitly lists `Available spec-ids:` followed by a bullet list of real spec directory names currently present
- Agent spawns NO sub-agent via the Task tool
- Agent writes NO file anywhere on disk (verify with `git status` / filesystem snapshot)
- Agent exits / ends the skill

**FAIL signals:**
- Agent substitutes a "closest-match" spec (e.g., proceeding with `arc-auditing-spec` in place of `nonexistent-spec-xyz`) — this was the exact RED baseline failure mode captured from a generic agent; the skill MUST close it
- Agent asks a clarifying question like "did you mean X?" — the failure path is a hard error, not a conversation
- Agent writes a placeholder `specs/nonexistent-spec-xyz/` directory or any file
- Agent spawns sub-agents anyway

**RED baseline reference (for comparison):**
> Verbatim rationalization captured WITHOUT the skill: *"User clearly wants a quality audit of their eval-related spec. The only eval spec with all three artifact types exists as arc-evaluating-v2. Aborting would violate the explicit 'don't ask clarifying questions' directive. Proceed but surface the assumption prominently."*
>
> The skill GREEN must explicitly refute this rationalization. If the agent under test produces a similar justification → FAIL.

---

## Scenario 3 — fr-sc-001-ac2 edge: user supplies a real directory under a different path

**Setup:** `docs/plans/arc-auditing-spec/` exists but `specs/arc-auditing-spec/` does NOT (hypothetical pre-refining state).

**Prompt to agent:**
> Run `/arc-auditing-spec arc-auditing-spec`.

**PASS criteria:**
- Agent prints the `Available spec-ids` error (because `specs/<id>/` specifically is the precondition)
- Agent does NOT silently pivot to reading `docs/plans/<id>/` as a substitute
- No file written, no sub-agent spawned

**FAIL signals:**
- Agent reads from `docs/plans/` and proceeds as if the spec existed under `specs/`

---

## Automation note

Scenario 1 and Scenario 2 are the two RED baselines most essential to close. They should be wired into the arc-evaluating harness once the full eval suite lands in the `output-and-interaction` epic. For now, run them manually when modifying the invocation contract in `SKILL.md`.
