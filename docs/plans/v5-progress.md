# arcforge v5.0.0 — Progress

Overall: **EXECUTING — Wave 1 (resumed 2026-07-12, opus 4.8)**
Plan: `2026-07-12-v5-implementation-plan.md` · Decisions: `2026-07-12-v5-redesign-decisions.md`
Integration branch: `v5/main` · Worktrees: `../arcforge-v5/<ws>/`
Merge policy: green workstreams auto-merge into `v5/main`; `main` untouched until final maintainer review.
Eval scope: full D5.
Last updated: 2026-07-12 (Wave 1 dispatched)

## Workstream status

| ID | Workstream | Wave | Deps | Status | Attempts | Verified | Evidence |
|----|-----------|------|------|--------|----------|----------|----------|
| WS1 | Platform removal (gemini/opencode) | 1 | — | in-progress | 1 | — | branch v5/ws1-platform |
| WS2 | Hook consolidation (behavior-preserving) | 1 | — | in-progress | 1 | — | branch v5/ws2-hooks |
| WS6 | pytest structure-only conversion | 1 | — | in-progress | 1 | — | branch v5/ws6-pytest |
| WS3 | New guards + autopilot denies | 2 | WS2 | waiting | 0 | — | — |
| WS4 | Merges: arc-reviewing / arc-learning | 2 | WS2, WS6 | waiting | 0 | — | — |
| WS5 | Name-graph sweep | 3 | WS4 | waiting | 0 | — | — |
| WS7a | Diet lane: sdd (8 skills) | 4 | WS5, WS6 | waiting | 0 | — | — |
| WS7b | Diet lane: orchestration (6) | 4 | WS5, WS6 | waiting | 0 | — | — |
| WS7c | Diet lane: discipline (5) | 4 | WS5, WS6 | waiting | 0 | — | — |
| WS7d | Diet lane: memory (6) | 4 | WS5, WS6 | waiting | 0 | — | — |
| WS7e | Diet lane: knowledge+meta (5) | 4 | WS5, WS6 | waiting | 0 | — | — |
| WS8 | Descriptions, frontmatter, index | 5 | WS7 | waiting | 0 | — | — |
| WS9 | Eval re-baseline (v5 epoch, full D5) | 6 | WS7, WS8 | waiting | 0 | — | — |
| WS10 | Release 5.0.0 | 7 | all | waiting | 0 | — | — |

## WS7 temp line-budget allowlist burn-down

15 currently-oversized skills enter WS6's temporary allowlist; each WS7
lane removes its entries. Final allowlist: arc-refining 300, arc-finishing 430.
Burn-down: (not started)

## WS9 re-run additions

Skills whose gates/tables/commands were reworded during WS7 (D5 exemption
violated → must re-eval): (none yet)

## Iteration log (append-only, newest first)

- **2026-07-12 (iter 1)** — Maintainer APPROVED the plan (merge policy:
  v5/main auto-merge; eval scope: full D5). Created `v5/main` from `main`;
  committed plan docs + grounding; created worktrees + branches
  v5/ws1-platform, v5/ws2-hooks, v5/ws6-pytest; dispatched 3 parallel
  implementer agents. `main` untouched.
- **2026-07-12** — Plan authored. Grounding complete (4 read-only agents:
  174 items, 44 acceptance commands, 46 risks → `v5-grounding/`). Spike
  ADR-S1/S2/S3 recorded in the decision doc.
