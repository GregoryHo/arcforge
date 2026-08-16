# Roadmap — arcforge

The **index + history** for the product. The table is the big picture and links to
each area's living spec in `specs/`; the **Decision Log** records every product
decision *and* every reversal. How to maintain this file: [`product/AGENTS.md`](AGENTS.md).

## Roadmap

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| 6.0.0 | `rc-v6.0.0` | v6 toolkit | **building ← we are here** | Ground-up rebuild: 15 self-contained skills behind a prose router, a 5-group CLI reached as bare `arcforge`, 6 hooks, and the retained learning / eval / obsidian systems — Claude Code single-harness, zero runtime deps. Release candidate is tagged; flips to `shipped` with the `v6.0.0` tag on the main branch. | [skill-system](specs/skill-system.md) · [cli](specs/cli.md) · [hooks](specs/hooks.md) · [learning](specs/learning.md) · [eval](specs/eval.md) · [obsidian](specs/obsidian.md) · [worktrees-loop](specs/worktrees-loop.md) |

> Un-scheduled ideas live in the [Backlog](BACKLOG.md); a wish graduates into a
> version (row + spec + Decision Log entry) when picked.

## Decision Log

Append-only. Never renumber a `D-id`; never edit a recorded `Decision` / `Why`. To
reverse one, append a superseding entry (see AGENTS.md).

### D-001 — Product state lives in `product/`
- Date: 2026-08-15
- Version: process
- Status: Accepted
- Decision: Product intent (specs, roadmap, backlog, decisions) lives in this
  folder, maintained per `product/AGENTS.md`; it is distinct from engineering
  conventions (`.claude/rules/`), frozen mechanical contracts (`docs/decisions/`),
  and user how-to docs (`docs/guide/`).
- Why: Product "what and why" previously had no single home — it was scattered
  across plan documents that aged into noise. One folder with living specs and an
  append-only decision log keeps intent current and its history legible.

### D-002 — Claude Code single-harness now; Codex as a wrapped second harness later
- Date: 2026-08-15
- Version: 6.0.0
- Status: Accepted
- Decision: v6 ships wrapping Claude Code only. Wrapping Codex as a second harness
  is directionally decided but unscheduled (see Backlog); "Claude Code only"
  statements in the engineering rules describe the present, not a permanent stance.
- Why: The rebuild's core simplification was dropping multi-platform packaging.
  The architecture keeps the second harness cheap — skills are self-contained
  markdown plus a bare CLI on PATH — so the future work is packaging plus spike
  verification of Codex's discovery/invocation mechanics, not a redesign.

### D-003 — Backfill all seven area specs at 6.0.0
- Date: 2026-08-16
- Version: process
- Status: Accepted
- Decision: Every shipped area gets its spec now, in one pass — `specs/` covers
  skill-system, cli, hooks, learning, eval, obsidian, and worktrees-loop — and
  the earlier write-on-next-touch stance is retired.
- Why: A spec written later would be reverse-engineered from code by whoever
  next touches the area, without the context the choices were made with.
  Writing all seven while that context is at hand costs one sitting and gives
  every future change a spec to update instead of a blank to fill.
