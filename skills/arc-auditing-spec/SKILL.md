---
name: arc-auditing-spec
description: Use when the user explicitly runs the slash command `/arc-auditing-spec <spec-id>` to produce a read-only advisory audit of an arcforge SDD spec family (design.md, spec.xml, dag.yaml). Only triggered by direct user invocation; never auto-invoked from any pipeline skill (arc-brainstorming, arc-refining, arc-planning).
---

# Skill: arc-auditing-spec

## Iron Law

**READ-ONLY ADVISORY. NEVER MUTATE.**

Skill body and all three sub-agents MUST NOT Edit, Write, rename, delete, or run any mutating git / filesystem operation. Phase 5 prints a Decisions table and exits. Main session (or a subsequent skill) owns any actual edits — not this skill, never.

No `--apply` flag, no "while I'm here let me fix this typo" shortcut, no Phase 6 that starts applying decisions. Diagnostic role only.

## When to Use

- User types `/arc-auditing-spec <spec-id>` wanting cross-artifact alignment, internal consistency, and state-transition integrity checked across the spec family
- The spec has reached a state where at least `design.md` exists (spec.xml and dag.yaml optional; graceful degradation per fr-aa-004)

## When NOT to Use

- Source code review, PR review → use `/review` or `pr-review-toolkit`
- You want this skill to *apply* resolutions — it won't; it's diagnostic only
- You want an automatic check at the end of `arc-refining` or `arc-planning` — those skills do not and must not auto-invoke this one (fr-sc-001-ac3); invocation is always user-initiated

## Invocation Contract

```
/arc-auditing-spec <spec-id> [--save]
```

- `<spec-id>` — directory name under `specs/`. Exact match only; no fuzzy resolution.
- `--save` — optional. When present, writes the full Phase 2 report + Phase 5 Decisions table to `~/.arcforge/reviews/<project-hash>/<spec-id>/<YYYY-MM-DD-HHMM>.md` (hash from `scripts/lib/worktree-paths.js`). When absent, no file is written anywhere.

### Phase 0 — Precondition Check (MANDATORY)

Before Phase 1 fan-out, verify `specs/<spec-id>/` exists as a directory.

**If it exists:** proceed to Phase 1. No file is written at this point.

**If it does NOT exist:** STOP. Print:

```
Error: specs/<spec-id>/ does not exist.

Available spec-ids:
  - <id-1>
  - <id-2>
  ...
```

Then exit non-zero. Write nothing. Spawn no sub-agent. This is the only valid response — see Red Flags for the specific failure modes this rule forbids.

## Phase Structure

| Phase | What | Contract |
|---|---|---|
| 0 | Precondition check above | fr-sc-001-ac1, fr-sc-001-ac2 |
| 1 | Parallel fan-out to three read-only sub-agents via Task tool | `agents/arc-auditing-spec-*.md`; fr-aa-001 |
| 2 | Print Summary + Findings Overview + per-finding Detail markdown | `specs/arc-auditing-spec/details/output-and-interaction.xml` fr-oi-001 |
| 3 | Triage UX — AskUserQuestion multi-select over HIGH findings | fr-oi-002 |
| 4 | Resolution UX — batched per-finding AskUserQuestion with diff previews | fr-oi-003 |
| 5 | Print Decisions markdown table; skill exits | fr-oi-004 |

Sub-agent system prompts and Phase 2–5 rendering logic are produced by the downstream epics (`audit-agents`, `output-and-interaction`). Reference the detail XML under `specs/arc-auditing-spec/details/` for the authoritative contract on what each phase emits.

## Hard Boundaries

- Skill body and all sub-agents MUST NOT invoke Edit, Write, or any state-mutating Bash command. This is enforced **structurally** via the `tools:` allowlist in each agent's frontmatter (`agents/arc-auditing-spec-*.md`) — not via prose in system prompts. See fr-sc-002-ac3.
- No git commit, branch creation, worktree creation, or file deletion — under any phase, at any point.
- Phase 5 is terminal. The skill does NOT loop back to "apply" after the user picks resolutions. The Decisions table is the deliverable; downstream action is main session's responsibility and explicitly out of scope (fr-oi-004-ac3).
- `--save` is the ONLY permitted write, and only to `~/.arcforge/reviews/` under the arcforge home directory — never into `specs/`, `docs/`, or any project-tracked path.

## Red Flags — STOP

If you find yourself doing any of these, STOP immediately:

| Rationalization | Why it's wrong | Do instead |
|---|---|---|
| "The user's spec-id doesn't exist, but this other one is clearly what they meant — I'll audit that and note the substitution at the top" | `fr-sc-001-ac2` forbids substitution. This is a baseline failure mode observed in RED testing — the rationalization "don't ask clarifying questions" does NOT justify picking a different spec. | Print available ids, exit. Let the user re-invoke with the right id. |
| "The user said `<id>` and `specs/<id>/` is missing, but `docs/plans/<id>/` has a design.md — I'll audit in pure-design mode since the design clearly exists" | Phase 0 requires `specs/<id>/` **specifically**. `docs/plans/<id>/` is not a fallback path — not for pure-design audits, not for partial, not for anything. A design doc without a spec directory is a pre-refining state; the audit skill does not operate on it. | Print available ids, exit. If the user wanted a design-only review, that's `/arc-brainstorming` or manual review territory, not this skill. |
| "I spotted an obvious typo while reading — fixing it saves a round trip" | Read-only is absolute. Even typos are reported as findings, never patched. | Add a finding (LOW severity) to the axis agent's output; let main session decide. |
| "The user picked resolution (a) for finding A1-003 in Phase 4 — I should Edit the spec now" | Phase 5 is terminal. Mutation is main session's job. | Print Decisions table, exit. Main session reads it and acts. |
| "I'll have arc-refining/arc-planning call this skill at the end of their flow for free quality gating" | `fr-sc-001-ac3` forbids pipeline auto-invocation. The skill must remain user-triggered. | Do not add any invocation from any pipeline SKILL.md body. |
| "Let me add a `--apply` flag so this is one-step for users" | Makes the skill a mutator, defeating its diagnostic-only contract. | Don't. The contract is the contract. |

## Implementation Delegation

Per fr-sc-003, this skill's phase content, the three sub-agent system prompts, and the eval scenarios validating audit correctness were produced through `arc-writing-skills`' TDD (RED → GREEN → REFACTOR) with recorded baseline-without-skill scenarios. Evals live under `skills/arc-auditing-spec/evals/` and exercise each of the three audit axes (fr-sc-003-ac2); the suite MUST pass before shipping.

## Cross-References

- Agents: `agents/arc-auditing-spec-cross-artifact-alignment.md`, `agents/arc-auditing-spec-internal-consistency.md`, `agents/arc-auditing-spec-state-transition-integrity.md`
- Spec: `specs/arc-auditing-spec/spec.xml` + `specs/arc-auditing-spec/details/{skill-contract,audit-agents,output-and-interaction}.xml`
- Design: `docs/plans/arc-auditing-spec/2026-04-22/design.md`
- Eval scenarios: `skills/arc-auditing-spec/evals/`
