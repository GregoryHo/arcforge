# arcforge v5.0.0 — Progress

Overall: **EXECUTING — Wave 2 (2026-07-12, opus 4.8)**
Plan: `2026-07-12-v5-implementation-plan.md` · Decisions: `2026-07-12-v5-redesign-decisions.md`
Integration branch: `v5/main` · Worktrees: `../arcforge-v5/<ws>/`
Merge policy: green workstreams auto-merge into `v5/main`; `main` untouched until final maintainer review.
Eval scope: full D5.
Last updated: 2026-07-12 (Wave 1 merged; Wave 2 dispatched)

## Workstream status

| ID | Workstream | Wave | Deps | Status | Attempts | Verified | Evidence |
|----|-----------|------|------|--------|----------|----------|----------|
| WS1 | Platform removal (gemini/opencode) | 1 | — | done | 1 | 2026-07-12 | v5/main e82ce89 (d5248fc,4364863); indep re-verified: deletes+zero-ref+check:versions+check:docs+npm test green |
| WS2 | Hook consolidation (behavior-preserving) | 1 | — | done | 1 | 2026-07-12 | v5/main 8215f9c (bdd426b); 7 entries, sync spawn/Edit=2, hooks 360 pass, +27 new tests |
| WS6 | pytest structure-only conversion | 1 | — | done | 1 | 2026-07-12 | v5/main da383a3 (9b34da0); 32 files→test_skill_structure.py (139 tests), no literal prose, materializer dropped |
| WS3 | New guards + autopilot denies | 2 | WS2 | in-progress | 1 | — | branch v5/ws3-guards |
| WS4 | Merges: arc-reviewing / arc-learning | 2 | WS2, WS6 | in-progress | 1 | — | branch v5/ws4-merges |
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
