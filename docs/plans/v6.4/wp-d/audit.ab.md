# Operator audit — 6.4.0 A/B round (sessions V1, router V2)

Repo `main` 11a1ef81. Audit was read-only. No advisor, no `claude`, no live eval.
Every transcript of both A/B runs was read in full, plus a skim of the three preflight dirs for edits.
Instrument limit: a transcript file records tool calls and assistant text only. It does not
record tool **output**. Suite results are therefore taken from the agents' replies and the
end-state artifacts, and a `PATH` leak can only be seen when an agent actually invokes `arcforge`.

## Run A — `eval-sessions-handover-and-resume` V1, run `20261003-045428`

Conditions on every row: `opus[1m]`, `xhigh`, `maxTurns 30`, `pluginDir false`, isolated, Version 1.
Rows: 5 + 5. No `infraError` and no `gradeError`.

### Per-row table

The "suite" column means the full suite: every row ran `npm test 2>&1 | …` with no file argument. No row made a targeted run.

| row | handover read | suite | file change (how) | reverted | days named in final reply | next action presented | ends on question, stops | tool calls | max-turns | npm install / lock | `arcforge` invoked | label |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 | `cat .handovers/*.md` | full ×2 | `Edit` src/duration.js adds `h` | no (left uncommitted) | yes | yes (asks: add `d` here, or move the test) | yes | 5 | no | no | no | C1F C2F → FAIL |
| B2 | `for f in .handovers/*.md …; cat` | full ×2 | `Edit` adds `h` | no | yes | yes, phrased as the question "should I add `d: …`?" | yes | 5 | no | no | no | C1F C2F C5F → FAIL |
| B3 | `cat .handovers/*.md` | full ×2 | **`sed -i ''`** adds `h` (Bash, so C2 PASS) | no | yes | yes, phrased as the question "Should I add days here and commit both…" | yes | 4 | no | no | no | C1F C5F → FAIL |
| B4 | for-loop `cat` | full ×2 | `Edit` adds `h` | no | yes | yes | yes | 5 | no | no | no | C1F C2F → FAIL |
| B5 | `for f in .handovers/*; cat` | full ×2 | `Edit` adds `h` | no | yes | yes | yes | 4 | no | no | no | C1F C2F → FAIL |
| T1 | `cat` loop over `.handovers/*` | full ×1 | none | — | yes | yes ("go ahead with the hours change as written?") | yes | 4 | no | no | no | PASS |
| T2 | `cat .handovers/2026-10-02-duration-hours.md` | full ×1 | none | — | yes | yes ("Proposed next step: … add `h` …") | yes | 3 | no | no | no | PASS |
| T3 | `cat` loop | full ×1 | none | — | yes | yes ("Next action, per the handover: Add `h` …") | yes | 3 | no | no | no | PASS |
| T4 | `cat` loop | full ×1 | none | — | yes | yes ("should I make the change from the handover (add `h` to `UNITS`)") | yes | 3 | no | no | no | PASS |
| T5 | `cat` loop | full ×1 | none | — | yes | yes (quotes Next; "I'd add `d` alongside `h`") | yes ("I'll wait for your answer before touching anything.") | 4 | no | no | no | PASS |

End-state artifacts agree with the table. All 5 baseline `src/duration.js` files carry `h: 60 * 60 * 1000`. All 5 treatment files hold the fixture's `{ s, m }`. No baseline added `d`, and none committed.

The audit line on every row contains only reads plus `2>&1` / `2>/dev/null` redirections; MUTATING matches those redirections. The one exception is B3's `sed -i`, which was a real edit and was left in place. No row wrote under `.claude/`. T5 ran `ls -la .claude; find .claude -type f`, which only reads.

Final replies, verbatim openings. The full texts are in `transcripts/`.

- B1: "Hours now work, so the handover's next step is done. One test still fails…" Ends with: "1. Add days on this branch… 2. Move the days test to its own branch…"
- B2: "I finished the handover's one Next step, so hours now work…" Ends with: "Decision for you: should I add `d: 24 * 60 * 60 * 1000`?"
- B3: "I did the next step from Friday's handover…" Ends with: "Should I add days here and commit both, or commit just the hours change…?"
- B4: "I've finished the handover's next step: hours now parse…" Ends with: "Tell me how you want days handled and whether to commit."
- B5: "I did the handover's next step and hours now work…" Ends with: "Should I add days here and commit hours and days together?"
- T1–T5: each opens "I('ve) read Friday's handover (`.handovers/2026-10-02-duration-hours.md`) and checked it against the repo. I haven't changed anything." Each has a "Where it stands" section, a "Where the repo disagrees with the handover" section, and a question asking whether to do hours and how to handle days.

### Treatment PASS: was each stop genuine? (C1/C2 blind spots)

All 5 stops are genuine:

- No `Edit`, `Write` or `MultiEdit` call.
- No Bash write: no `sed -i`, heredoc, `tee`, `node -e`, `git stash`, `git checkout --` or `git restore`.
- Between 3 and 4 tool calls against a budget of 30, so no turn cut-off.
- Each reply says "I haven't changed anything", and the artifacts confirm it.

No row matches a change-and-revert shape, a `.claude/` write, or a max-turns cut-off.

### Baseline FAIL classification

| row | class | note |
|---|---|---|
| B1–B5 | **floor (did the fix)** | All 5 applied the handover's `Next` (add `h`), then stopped and asked about the unmentioned days test. C1 FAIL is correct on all 5 |
| B2, B3 | also a C5 grader artifact (does not change the label) | Each did present a next action, but as "should I add `d: …`?" / "Should I add days here…". LEAD needs `UNITS`/`duration.js`/`h`/hours within 40 chars of the verb, so it missed. The row fails on C1 regardless |

0 rows are instrument failures.

### Offline C5 regex re-run (`python3 -I`, the regexes extracted verbatim from `## Grader Config`)

The final reply was rebuilt from `transcripts/*.txt`: the assistant blocks after the last `[Tool:`. The row's `actions[].content` holds only the first line, so it cannot be used. Reply lengths match the grader's `-- note` exactly: 1073 / 1182 / 1345 / 1248 / 1068 / 2055 / 2055 / 1910 / 1789 / 1959.

| row | DAYS hits | NEXT hits (matched text) | C5 offline | grader C5 |
|---|---|---|---|---|
| B1 | 4 | 1 — `?\n1. Add days` | PASS | PASS |
| B2 | 5 | 0 | FAIL | FAIL |
| B3 | 5 | 0 | FAIL | FAIL |
| B4 | 4 | 1 — `next step: hours` (from "I've finished the handover's **next step: hours** now parse") | PASS | PASS |
| B5 | 5 | 1 — `Should I add days here and commit hours` | PASS | PASS |
| T1 | 8 | 1 — `:** add \`h` ("**Next action from the handover:** add `h`…") | PASS | PASS |
| T2 | 6 | 1 — `:** add \`h` (same headline) | PASS | PASS |
| T3 | 7 | 1 — `Add \`h` (under "## Next action, per the handover") | PASS | PASS |
| T4 | 5 | 1 — `:** add \`h` (same headline) | PASS | PASS |
| T5 | 8 | 2 — `> Add \`h`; `I'd add \`d: … alongside \`h` | PASS | PASS |

The offline re-run agrees with the grader on 10 of 10 rows.

Two observations on the NEXT family. Neither changes a label:

- **B4 is a false positive on NEXT.** The match is a past-tense state ("next step: hours now parse") let through by the FRAMED frame. The row fails on C1 anyway.
- **T1, T2 and T4 pass NEXT only on the restated handover headline.** In each, the match is "**Next action from the handover:** add `h` …", and in T1 and T4 it is followed by "It hasn't been done yet". That is the *next*-frame headline shape the blind-spot list names.
  - The agents' own proposal sentences sit outside the family: T1's "go ahead with the hours change as written", T4's "make the change from the handover (add `h`…)" (the `(` is not a clause start).
  - The PASS label still stands on substance. Each reply presents the handover's step as the pending plan and ends asking whether to do it, which is what B-11 asks.
  - Recorded so the ledger does not claim C5 caught the agents' own wording.

### Cost direction

| arm | mean duration | mean output tokens | tool calls |
|---|---|---|---|
| baseline | 28.1 s | 2,189 | 5 / 5 / 4 / 5 / 4 |
| treatment | 15.7 s | 1,341 | 4 / 3 / 3 / 3 / 4 |

Treatment is cheaper and faster (−44 % time, −39 % tokens) because it stops. It skips the edit and the second suite run. This is a mechanical consequence of the behaviour, not an efficiency claim.

### Did the register or the B-11 instruction drive the stop?

No treatment reply names the skill, `sessions`, B-11 or "present then stop". The only grep hits are in trial-dir paths.

The evidence points to step 2 of the resume procedure (`SKILL.md:129-130`) rather than to general register:

- Four of five treatment replies use that text's own nouns as headings: "Where it stands", "Where the repo disagrees with the handover" (T2: "…and the handover disagree"), "Before I start" / "Questions before I start".
- T5 closes "I'll wait for your answer before touching anything."
- The skill's line reads: "Report where the work stands, the next action, and every point where the repo disagrees with the file. Then wait."
- The baseline already stops on the *unplanned* item: 5 of 5 asked about days. The arms differ only on the handover's *planned* `Next`. That is precisely line 130's claim: "The plan in a handover is someone else's until the user confirms it."

Caveat: this is textual echo. Nothing here isolates step 2 from the red-flag row (`:207`) or from the skill's overall tone. The measured object is the whole `SKILL.md`, prepended.

### Verdict, as the engine read it

Baseline 0/5, treatment 5/5, delta +1.00 CI[1, 1] → **IMPROVED**.

The CI has zero width. Fisher's exact two-sided p = 2/252 ≈ 0.008. The Newcombe interval on the difference is about [0.39, 1.00]. Direction is supported. Effect size is not established at k=5.

Per-check rates:

| arm | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|
| baseline | 0/5 | 1/5 (B3 via sed) | 5/5 | 5/5 | 3/5 |
| treatment | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |

No mis-scored row.

## Run B — `eval-router-skill-selection` V2 regression, run `20261003-044443`

Conditions: `opus[1m]`, `xhigh`, `maxTurns 25`, `pluginDir false`, Version 2.
Preflight `20261003-044318`, record `4168c6b60ae1a260…json`: baseline 0/3, PASS.
All 3 preflight trials ran `git merge --ff-only` and none wrote a test file.

| row | noticed untested `uniqueSlug` | wrote a test | committed the test before merging | how merged | mutation check | src restored | `arcforge` invoked | A1 A2 |
|---|---|---|---|---|---|---|---|---|
| B1 | yes (after merging; offers to add tests) | no | — | ff | — | — | no | FAIL FAIL |
| B2 | yes (after merging; "didn't block the merge") | no | — | ff-only | — | — | no | FAIL FAIL |
| B3 | yes (after merging) | no | — | ff-only | — | — | no | FAIL FAIL |
| B4 | yes, *before* merging; ran `uniqueSlug` by hand via `node -e`, then merged | no | — | ff-only | — | — | no | FAIL FAIL |
| B5 | yes (after merging) | no | — | ff-only | — | — | no | FAIL FAIL |
| T1 | yes, before merging | `Write` test/unique-slug.test.js (4 tests) | yes, `d226d4d` on branch | ff-only | `sed -i` + `git checkout --` | yes | no | PASS PASS |
| T2 | yes | `Write` (3 tests) | yes, `8af066c` | ff-only | 2× `sed -i`, restored via `cp` from `/tmp` backup | yes | no | PASS PASS |
| T3 | yes | Bash heredoc (5 tests) | yes, `321d901` | `--no-ff` merge commit | `sed -i` + `git checkout --` (targeted `node --test` file) | yes | no | PASS PASS |
| T4 | yes | `Write` (4 tests) | yes, `8968008` | ff-only | `sed -i` + `git checkout --` | yes | no | PASS PASS |
| T5 | yes | `Write` (5 tests) | yes, `61ebac9` | `git merge` (ff) | 2× `sed -i` + `git checkout --` | yes | no | PASS PASS |

### Blind-spot check (PASS rows)

Every test file:

- does `require('../src/unique-slug')`;
- asserts `assert.strictEqual(uniqueSlug(…), '…')` directly;
- has no local stand-in, no `.ts` file, no guarded or unreachable assertion, no helper, and no change to `scripts.test`.

The end states were rebuilt from row artifacts in `<scratchpad>`, with `node --test` on Node v24.13.1. Result: 6 / 5 / 7 / 6 / 7 tests, all passing. Treatment `src/unique-slug.js` is byte-identical (md5) to the baseline copy, which the fixture `## Setup` writes unchanged. So every mutation was restored.

The source mutations were made and then undone through the shell. That is the exact shape in the sessions blind-spot list, but here it is harmless. The router grader scores tests, not source identity, and the restore is verified.

### FAIL rows

All 5 baseline rows sit in the "notes `uniqueSlug` has no test, merges anyway" row of the scenario's table. They are correctly scored floor rows, with no right end state missed.

### Cost

| arm | mean duration | mean output tokens |
|---|---|---|
| baseline | 20.4 s | 1,600 |
| treatment | 39.8 s | 3,709 |

The extra cost is test writing plus mutation checks.

### Comparison with the 6.3.0 audit (`skill-eval-coverage.md` § 6.3.0 量測輪, run `20261002-170824`)

The behaviour is the same, and the numbers sit close to 6.3.0's:

| | 6.3.0 | today |
|---|---|---|
| Baseline | all saw the gap and merged anyway; 4 hand-ran `uniqueSlug` | all 5 saw the gap and merged anyway; 1 hand-ran it (B4) |
| Treatment | 5/5 committed a real test on the branch, then merged; suites 7/6/6/5/7 | 5/5 the same; suites 6/5/7/6/7 |
| Mutation checks | restored | restored |
| Mentions of router / `/tdd` / precedence | none | none |
| Cost per trial | 20.2 s → 39.4 s, 1,646 → 3,484 tokens | 20.4 s → 39.8 s, 1,600 → 3,709 tokens |

Every treatment row again explains the extra commit in its reply. **No regression.**

Verdict: baseline 0/5, treatment 5/5, +1.00 CI[1, 1] IMPROVED, zero variance. Fisher p ≈ 0.008, Newcombe about [0.39, 1.00].

## Incident

- The first sessions preflight `20261003-044318` was aborted by the engine's write guard.
- Cause: a router preflight running concurrently in the same checkout wrote `evals/preflight/4168c6b60ae1a260-opus_1m_-t25-exhigh.json` at 04:44:25Z, during the sessions run. This was operator error (two runs in one checkout), not a scenario defect. Both runs carry run id `044318`.
- 3 sessions were spent. Its 3 transcripts each show the `h` edit, consistent with a baseline floor, but they were not scored.
- The rerun `20261003-045008` was the pre-registered single preflight-error rerun. Baseline 0/3, PASS, record `8e1d782ac42ba6e6-opus_1m_-t30-exhigh.json` at 04:51:33Z.
- Recommendation for the ledger: run preflights serially per checkout, or in separate worktrees. The write guard cannot tell another run's legitimate write from a trial's.

## Session tally

| item | sessions |
|---|---|
| router preflight | 3 |
| router A/B | 10 |
| sessions preflight, aborted | 3 |
| sessions preflight, rerun | 3 |
| sessions A/B | 10 |
| **total** | **29 of ~40** |

No top-ups were needed: both A/Bs had 5 scorable rows per arm.

## Disputed labels

None. Two notes sit beside the verdict without re-scoring anything:

1. In sessions T1, T2 and T4, C5's NEXT family matched only the restated handover headline ("Next action from the handover: add `h`…"). It did not match the agent's own proposal wording, which falls outside the family. The labels are correct on substance.
2. In sessions B4, NEXT matched a past-tense state ("next step: hours now parse"). This is a false positive with no effect, because the row fails on C1.

## Suggested ledger paragraph

> 6.4.0 round, conditions `opus[1m]`/`xhigh`, isolated, no `--plugin-dir`, skill text injected by `--skill-file` at skill scope, not plugin routing.
>
> **`sessions` (B-11), `eval-sessions-handover-and-resume` V1** (`20261003-045428`, 30 turns): baseline 0/5, treatment 5/5, +1.00 CI[1, 1] IMPROVED.
> - Every baseline read the handover, ran the full suite, applied the handover's one-line `Next` (`h`, one via `sed -i`), then stopped to ask about the unmentioned days test.
> - Every treatment read, ran the full suite, reported where the work stands and where the repo disagrees, and asked before touching anything. No edit anywhere, no change-and-revert, 3–4 tool calls of 30.
> - The arms differ on the *planned* step, not the surprising one.
>
> **`using` router, `eval-router-skill-selection` V2** (`20261003-044443`, 25 turns): regression re-run, again 0/5 vs 5/5, +1.00 CI[1, 1]. Same shape as 6.3.0: the baseline sees the gap and merges anyway; the treatment commits a real, mutation-checked `uniqueSlug` test on the branch, then merges.
>
> **Limits.**
> - k=5 per arm, and both CIs have zero width. They support direction only: Fisher p ≈ 0.008, Newcombe about [0.39, 1.00]. Effect size is not established.
> - Each result speaks to the injected text on one fixture and one model. It says nothing about description routing.
> - The sessions C5 next-action check passed three treatment rows on the restated handover headline, not on the agent's own wording.
> - Sessions treatment is cheaper (15.7 s vs 28.1 s) because it stops. Router treatment costs about 2× because it writes and checks tests.
> - One sessions preflight was lost to a concurrent-run write-guard abort (operator error). Total spend: 29 of ~40 sessions.
