# 6.6.0 measurement round — ledger

Pre-registration: `product/ROADMAP.md` D-068. Measurement commit: `61b19e46`
(main after #317; the round first opened at `2b633b76`, main after #316, and
moved when #317 changed `evals/scenarios/` after run 1 — see below). Recorded
here as the round runs; this file rides with the round's docs PR.

## D-068 (4) — digests recomputed at the measurement commit

Recomputed 2026-10-22 ~08:50 UTC at `2b633b76`, offline, with
`digestSkillDir` / `hashSkillText` / `resolveSkillOptions` / `preflightBaseline`
(no session spent).

| Item | Registered (D-068) | Recomputed | |
|---|---|---|---|
| D1 `skills/core/executing` | `1ef6e3967679cf2b` | `1ef6e3967679cf2b` | MATCH |
| D1 `skills/core/dispatching` | `9479e63210fdc2be` | `9479e63210fdc2be` | MATCH |
| D1 text hash (`executing/SKILL.md`, both arms) | `17fa36f1535cb446` | `17fa36f1535cb446` | MATCH |
| D2 baseline directory (materialised) | `0f3c574c1e448946` | `0f3c574c1e448946` | MATCH |
| D2 current `skills/core/diagramming-obsidian` | `42ec93e5d9d42cec` | `42ec93e5d9d42cec` | MATCH |

D1 preflight key conditions (`preflightBaseline`):
`{"baselineSkillHash":"17fa36f1535cb446","baselineSkillFile":"skills/core/executing/SKILL.md","baselineSkillFilesHash":"1ef6e3967679cf2b"}`.
`resolveSkillOptions` with `--also-stage skills/core/dispatching` returned
`alsoStage.name = dispatching` and the full one-line description; no refusal.

D2 baseline directory, assembled outside the repository per the D2 gate's
recipe (`git archive HEAD:skills/core/diagramming-obsidian`, then
`references/layout-heuristics.md` replaced by `git show 1fed56d0~1:…`):
`/private/tmp/claude-501/-Users-gregho-GitHub-AI-arcforge/8b88cce2-b354-4abc-8133-f5f9c76d4689/scratchpad/arcforge-d2-baseline/diagramming-obsidian`
(session scratchpad; re-assemble with the same recipe if it is gone, and
re-check the digest).

No run lock (`.eval-trials/run.lock` absent) before the first live eval.

Recomputed again 2026-10-22 09:16 UTC at `61b19e46` (after #317, which changed
only the scenario's Setup): all five values and the preflight key conditions
identical to the table above — MATCH. `git diff --stat 2b633b76..61b19e46 --
skills evals/scenarios evals/fixtures` is the one-line Setup change of #317
and nothing else.

## Runs

| # | Item | Command | Started (UTC) | Sessions | Result |
|---|---|---|---|---|---|
| 1 | D1 preflight k=3 | `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 node scripts/cli.js eval preflight eval-executing-dispatch-acceptance --model 'opus[1m]' --effort xhigh --stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md` | 2026-10-22 08:40:00 | 0 | BLOCK, infrastructure: 3/3 rows `setup_failed`, no session spawned. Record `evals/preflight/7e87d69148242413-opus_1m_-exhigh-c1800000-b17fa36f1535cb446-s1ef6e3967679cf2b.json`, rows `evals/results/eval-executing-dispatch-acceptance/20261022-084000/preflight.jsonl`. Cause: the Setup's `git commit -qm "fixture"` tried to SSH-sign — the operator's `~/.gitconfig` has `includeIf "gitdir:~/GitHub/"` → `commit.gpgsign=true`, the trial directory `<repo>/.eval-trials/…` is under `~/GitHub/`, and the trial environment forwards no `SSH_AUTH_SOCK` (B-18), so `ssh-keygen` asked for a passphrase and failed. Counts as preflight infrastructure-error rerun 1 of ≤2 (D-068 (5)). Fix: Setup adds `git config commit.gpgsign false` after `git init`, the pattern `eval-sessions-handover-and-resume` already uses. |
| 2 | D1 preflight k=3 (infrastructure rerun 1 of ≤2) | same command, at `61b19e46` | 2026-10-22 09:17:06 | 3 | **BLOCK at ceiling**: 3/3 PASS, pass rate 1.0 ≥ 0.8. Scenario hash `bf1704589d7cb9cd` (the Setup change moved it from `7e87d69148242413`). Rows `evals/results/eval-executing-dispatch-acceptance/20261022-091706/preflight.jsonl`, 261 s / 410 s / 495 s, 13.6k / 16.4k / 15.9k output tokens. Every row: one Agent call, classified writer, criteria 3/3 word for word, spec path in the prompt, `specs/limiter.md` opened, no staged `SKILL.md` read (this arm stages only the `executing` copy, whose text is already injected; there is no `dispatching` copy to read), model tier none, no arcforge error, `outside the trial tree: none` by the grader's definition (scratch writes to `/tmp` are not in its patterns — see `audit.d1.md`). Per D-068 (5)–(6): a finding — no rerun, no D1 A/B; #184 closes as a finding once the result decision is in. D1 has ended; D2 may start. |
| 3 | D2 preflight k=3 | `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 node scripts/cli.js eval preflight eval-diagramming-obsidian-layout-grid --model 'opus[1m]' --effort xhigh --stage-skill-files --baseline-skill-file <materialised>/SKILL.md` (the scratchpad directory above, digest `0f3c574c1e448946`), at `61b19e46`; scenario hash `57ac855bb7f12eef` (Version 2) | 2026-10-22 09:39:16 | 1 (partial, 65 s, 6.6k output tokens) | **Stopped by the trial guard, operator error**: while trial 1 ran, the operator (this session) wrote three files into the main checkout — `docs/plans/v6.6/wp-d/round.md` and the two `preflight.eval-executing-dispatch-acceptance-*.json` copies — and the guard attributed them to the trial: row 1 `trial_wrote_repo` (`infraError`), run stopped after trial 1, no record written. Rows `evals/results/eval-diagramming-obsidian-layout-grid/20261022-093916/preflight.jsonl`. Not a scenario or engine fault; the trial wrote nothing outside its directory. Counts as preflight infrastructure-error rerun 2 of ≤2 (D-068 (5)) — the last one in the round. Rule from here: nothing is written anywhere in the main checkout while a live eval runs; ledger and audit writes happen between runs or in the scratchpad. |
| 4 | D2 preflight k=3 (infrastructure rerun 2 of ≤2, the last) | same command as run 3 | 2026-10-22 09:43:18 | 3 | **BLOCK at ceiling**: 3/3 PASS, pass rate 1.0 ≥ 0.8. Record `evals/preflight/57ac855bb7f12eef-opus_1m_-exhigh-c1800000-b51fe7cc9f5373b7e-s0f3c574c1e448946.json` (copy: `preflight.eval-diagramming-obsidian-layout-grid-3.json`; `-1` and `-2` are Version 1's, in `docs/plans/v6.5/wp-d/`), rows `evals/results/eval-diagramming-obsidian-layout-grid/20261022-094318/preflight.jsonl`, 60 s / 62 s / 82 s, 5.1k / 6.2k / 7.0k output tokens. Every row: six boxes of width 180 in one row, all six `text` three lines and Primary-sized, adjacent gaps 80 (trial 1) or 60 (trials 2–3) on a 260 / 240 column pitch, the staged old `layout-heuristics.md` read with `cat`, no `uv` command, nothing outside the trial tree, `layout.json` written at an absolute path in the trial directory. Every row took the D2 gate's escape route 3: the agent noticed that 180-wide boxes on the old 200 px grid leave 20 px, under the 40 px minimum, and widened the column pitch (trial 3 also cited the toolkit's 60–100 px peer gap, route 2); see `audit.d2.md`. Per D-068 (6): a finding; Version 2 was #185's second and last design, so #185 closes as a finding once the result decision is in. No D2 A/B. **The round has ended: both items BLOCK at ceiling.** |

Budget: cap ~45; nominal 26 (6 preflight + 20 A/B); top-ups ≤8; preflight
infra reruns ≤6 (≤2 in the round). Spent in the round: 7 sessions (run 1 spent 0;
run 2 spent 3; run 3 spent 1, a 65 s trial the guard stopped; run 4 spent 3).
No A/B ran, so the nominal 26 became 6 preflight sessions plus 1 lost to the
guard stop; both infrastructure reruns were used (one for the fixture's
signing config, one for the operator's write during a trial).
