# arcforge v5.0.0 — Progress

Overall: **WS10 release-prep DONE on v5/main (cb64163) — awaiting maintainer sign-off for `v5/main → main` merge + post-merge tag. PR #134 open.**
Maintainer decisions (2026-07-13): (1) the 2 line-budget exceptions (arc-finishing 526, arc-refining 387) are ACCEPTED; (2) WS9 runs the FULL D5 scope. PR #134 (v5/main → main, draft) open for review. main untouched.
WS9 plan: prep (DONE — effort passthrough, dispatch-fidelity repaired, receive-half scenario authored, dangling-target check, exceptions marked accepted; merged to v5/main) → harness smoke (DONE — k=1 AB works on claude-sonnet-5/xhigh, 35s) → CANARY batch running (6 discipline AB gates k=5) → full D5 sweep → eval report → v5 epoch.
Eval model: trials on claude-sonnet-5 + effort xhigh (maintainer); model grader stays default.
YELLOW FLAG (k=1, non-conclusive): eval-arc-tdd-test-first-gate treatment FAILED A3/A4 at k=1 (baseline passed) → single-sample REGRESSED. A4 penalizes Bash/edits/artifacts; likely a re-baseline artifact (sonnet-5/xhigh is highly agentic, jumps to action) rather than a diet regression. Canary k=5 will resolve; if it holds as a real regression on a discipline skill, STOP per S6 and investigate the diet before the full sweep.
Prep finding: eval-arc-evaluating-scenario-audit was NOT flaky (passed 30/30 at k=30, 2026-05-02, unchanged) — the "pass 0/5" grounding premise was stale; live sweep confirmed 100%.

## WS9 sweep results (full D5, claude-sonnet-5 / effort xhigh, ~5h across 3 batches)

Verdict-label note: the AB "REGRESSED" label is `verdictFromAbPolicy` with `non-regression` policy = `passAllK(treatment) ? PASS : REGRESSED` — an ABSOLUTE "treatment passes 5/5" bar, NOT a comparison to baseline or v4. Every scenario's in-run delta (treatment − baseline) was ≥ 0.

- **Prose-dieted skills — NO regression.** Discipline: arc-debugging/arc-reviewing(dispatch+process) 100%; arc-verifying +0.05 (60%→80%); arc-researching **+0.90** (0%→100%); arc-tdd delta 0.00 (baseline==treatment 80%, non-discriminative — model does TDD without the skill; the 1 failing trial is A4 "no Bash/edits", a scenario-vs-strong-model calibration issue). arc-evaluating (9): all treatment ≥ baseline, strong positives adversarial-proxy +0.24 (20%→80%), claim-lifecycle +0.24 (0%→60%), workflow-vs-skill +0.30 (0%→60%). arc-writing-skills: micro-test-control + noninterference 100%.
- **2 regressions vs v4 — NOT v5-caused (model-change artifacts).** activated-skill-behavior v4 1.0 → v5 0.25; dashboard-concurrency-guard v4 1.0 → v5 0.8 (A5). Both test the ACTIVATION RUNTIME (`scripts/lib/learning-curator/activate.js`) + dashboard control-plane code — `git diff main..v5/main` shows v5 NEVER changed those files. The regression is the model change (v4 ran on an older model 2026-05; v5 on sonnet-5/xhigh, which doesn't reliably follow the activated test-skill's marker instruction). Learning subsystem is default-off (D4). Flagged as a sonnet-5 learning-runtime follow-up, orthogonal to the prose redesign.
- **1 scenario infra bug.** eval-arc-writing-skills-match-form-to-failure preflight errored (1/3 trials infraError/gradeError on sonnet-5, ~90min) — a trial-env/grader bug in the scenario, not a skill result. Fix the scenario harness; re-run.
- **v5 epoch committed:** benchmarks/latest.json + 2026-07-13.json (23 evals, all claude-sonnet-5).

D5 verdict (pending maintainer confirm): the v5 skill-prose redesign shows no behavioral regression; the 2 arc-learning regressions are model-change artifacts on v5-unchanged code; the match-form infra bug is a scenario issue. Recommend proceeding to WS10 with the 2 items as post-v5 follow-ups.
Plan: `2026-07-12-v5-implementation-plan.md` · Decisions: `2026-07-12-v5-redesign-decisions.md`
Integration branch: `v5/main` · Worktrees: `../arcforge-v5/<ws>/`
Merge policy: green workstreams auto-merge into `v5/main`; `main` untouched until final maintainer review.
Eval scope: full D5.
Line-budget ruling (2026-07-12, maintainer): push EVERY skill to ≤250 lines; break the cap only where an audit-flagged UNTOUCHABLE block cannot be preserved otherwise. Permanent allowlist stays arc-refining 300 / arc-finishing 430; any skill that lands >250 (candidates: arc-writing-skills audit-310, arc-auditing-spec audit-260) is recorded as a documented exception at burn-down and flagged for maintainer review.
Last updated: 2026-07-12 (Wave 3 merged; Wave 4 dispatched)

## Workstream status

| ID | Workstream | Wave | Deps | Status | Attempts | Verified | Evidence |
|----|-----------|------|------|--------|----------|----------|----------|
| WS1 | Platform removal (gemini/opencode) | 1 | — | done | 1 | 2026-07-12 | v5/main e82ce89 (d5248fc,4364863); indep re-verified: deletes+zero-ref+check:versions+check:docs+npm test green |
| WS2 | Hook consolidation (behavior-preserving) | 1 | — | done | 1 | 2026-07-12 | v5/main 8215f9c (bdd426b); 7 entries, sync spawn/Edit=2, hooks 360 pass, +27 new tests |
| WS6 | pytest structure-only conversion | 1 | — | done | 1 | 2026-07-12 | v5/main da383a3 (9b34da0); 32 files→test_skill_structure.py (139 tests), no literal prose, materializer dropped |
| WS3 | New guards + autopilot denies | 2 | WS2 | done | 1 | 2026-07-12 | v5/main a89d38e (6053bf5); dag-guard+engine twin, secrets warn, arc-guard bypass, autopilot denies; hooks 394 tests (+34); no false-positive → no downgrade |
| WS4 | Merges: arc-reviewing / arc-learning | 2 | WS2, WS6 | done | 1 | 2026-07-12 | v5/main 7b55f36 (1ad0d4c,3307012); arc-reviewing 142L, arc-learning 148L; 4 silent daemon paths repointed+probed; router synced |
| WS5 | Name-graph sweep | 3 | WS4 | done | 1 | 2026-07-12 | v5/main 55e... (7992b67); sweep-clean, check:docs green, CHANGELOG mapping seeded, eval scenario renamed; skill-eval-coverage.md kept as measurement-history exception |
| WS7a | Diet lane: sdd (8 skills) | 4 | WS5, WS6 | done | 1 | 2026-07-12 | v5/main (fc50ca9); review=pass; brainstorming 360→248, planning 260→214, auditing-spec 336→247, writing-tasks 151→107, executing 196→135, implementing 144→89 |
| WS7b | Diet lane: orchestration (6) | 4 | WS5, WS6 | done | 1 | 2026-07-12 | v5/main (e3777e1); review=pass; agent-driven 306→133, dispatching-parallel 338→159, looping 301→191 (+refs) |
| WS7c | Diet lane: discipline (5) | 4 | WS5, WS6 | done | 1 | 2026-07-12 | v5/main (122fa91); review=pass; tdd 413→184, debugging 296→231, verifying 172→109, researching 287→200 (+refs) |
| WS7d | Diet lane: memory (6) | 4 | WS5, WS6 | done | 1 | 2026-07-12 | v5/main (cd8c16d); review=pass; journaling 312→173, reflecting 416→205, managing-sessions 241→125 (+refs) |
| WS7e | Diet lane: knowledge+meta (5) | 4 | WS5, WS6 | done | 2 | 2026-07-12 | v5/main (71d9741+dc02029); review flagged arc-evaluating Red Flags deletion → restored verbatim (attempt 2); writing-skills 673→**249**, diagramming 320→248, using 157→112 |
| WS8 | Descriptions, frontmatter, index | 5 | WS7 | done | 1 | 2026-07-12 | v5/main (b32d7be,15019ce); 27 model-invoked 150–280 chars, 3 DMI ≤120 (auditing-spec/recalling/writing-skills, hook-safety verified); category+status frontmatter; index rebuilt; body-only line budget |
| WS9 | Eval re-baseline (v5 epoch, full D5) | 6 | WS7, WS8 | done | 1 | 2026-07-13 | v5/main; full D5 swept on sonnet-5/xhigh; clean v5 epoch (23 evals). NO prose-diet regressions. Root-caused the 2 v4-regressions to transcript level: activated-skill = transient API errors (clean re-run 5/5); dashboard = a real fixture path bug (prompt said queue.jsonl, Setup writes queue-dir/queue.jsonl) forcing agentic Bash-find → A5 fail; corrected the path (reasoning test A1-A4 unchanged) → concurrency-guard 4/5, promote-gate 3/5. Residual A5 misses = genuine sonnet-5 occasional-Bash on v5-UNCHANGED learning code (default-off); NOT gamed away. |
| WS10 | Release 5.0.0 | 7 | all | done (on-branch) | 1 | 2026-07-22 | v5/main cb64163; CHANGELOG 5.0.0 (authored + adversarially verified, 5 draft claims corrected), 9-location bump→5.0.0 (check:versions green), README doc-audit nits, full suite+lint+check:docs green, benchmark fresh. Gated remainder (main merge, tag, wiki ingest, marketplace, ws* cleanup) left for maintainer. |

## WS7 temp line-budget allowlist burn-down — DONE

Temp allowlist emptied. 30 skills: 28 within the 250 hard cap; 2 at
documented permanent floors. **⚠️ MAINTAINER-FLAG:** the two permanent
exceptions landed ABOVE their D7 targets because untouchable content alone
exceeds them:
- **arc-finishing 529** (D7 target 430) — ~440 lines of worktree-safety git
  mechanics kept verbatim; the 430 target was always gated on a future
  `scripts/finish-epic.js` extraction (5.x follow-up).
- **arc-refining 390** (D7 target 300) — 6 CLI heredoc sdd-gate recipes +
  three-legal-moves + delta accumulation + attended/unattended split +
  pytest-pinned Boundary, all untouchable.
Both preserved untouchable content per the maintainer ruling ("break the
cap only where an untouchable block can't be preserved otherwise"). The
line-budget check now allows 390/529 for these two; review at v5/main
sign-off.
arc-writing-skills reached **249** (D7 audit target was 310) — no exception
needed; the "push to 250 first" ruling worked.

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
