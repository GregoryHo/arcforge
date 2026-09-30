# plugin-evals

Cases for `claude plugin eval`. They measure one thing the arcforge harness in
`evals/` cannot: whether a named skill **fires under real plugin routing**, with
the plugin loaded and its description left to route (D-025, `product/specs/eval.md`
B-11).

These cases **never enter the release gate or the benchmark snapshot** (B-11).
A reading is a trigger rate, not a verdict: `claude plugin eval` has no
confidence intervals and writes nothing the freshness gate reads. The directory
is contributor-only and is not in `package.json` `files`, so it ships to nobody.

| Case | Measures | Runs |
|---|---|---|
| `isolation-check/` | D-025's inference that each run starts from a fresh `HOME` and `CLAUDE_CONFIG_DIR`, so the operator's output style, user hooks and user `CLAUDE.md` do not reach the trial | 2 |
| `speccing-trigger/` | #179 / D-024: how often `speccing` fires on its own when a user asks for a feature in a repo that keeps product state under `product/` | 10 |

Expected sessions: **10 + 2**.

Cost: `speccing-trigger` runs with the scenario's own limits — 40 turns and a
900 s timeout — so a late `Skill` call is not cut off. At those limits a run
can do the whole task, so budget each of its 10 runs like a full harness
trial, not like a short probe: up to 2.5 hours sequential at `-j 1`, and set
`--max-cost-usd` for 10 full trials. `isolation-check` is 2 short runs
(4 turns, 180 s).

The `speccing-trigger` prompt is **verbatim** from
`evals/scenarios/eval-speccing-spec-before-code.md`: its `## Context` and
`## Scenario`, assembled as the arcforge harness sends them (`## Context`, then
`## Task`). That includes "Don't spend time on the product docs — I'll sort
those out after the release" — that request to leave the product docs for later
is the trap #179 describes, and the case must reproduce the one that scored
0/10. If the scenario's wording changes, copy it here again, or the two
measurements stop being comparable.

## How to run

From the repo root. Run `isolation-check` first; if it fails, do not run
`speccing-trigger` — D-025 says #179 is then measured on the repaired
`arcforge eval` instead.

```bash
claude plugin eval . --eval-dir plugin-evals --case isolation-check \
  --allow-tools Bash \
  --ablation none --no-publish --model <model> --max-cost-usd <n> -j 1

claude plugin eval . --eval-dir plugin-evals --case speccing-trigger \
  --scaffold --allow-tools Bash Write Edit \
  --ablation none --no-publish --model <model> --max-cost-usd <n> -j 1
```

Every flag is there for a reason:

- `--eval-dir plugin-evals` — `evals/` belongs to arcforge's own harness.
- `--no-publish` — the default uploads the report to claude.ai; B-11 keeps it
  local. Reports land in `plugin-evals/results/<timestamp>/` (gitignored).
- `--model <model>` — pin it, so the reading names the model it measured. No
  case sets `model:`; the flag is the only source.
- `--max-cost-usd <n>` — a hard ceiling; the run aborts with partial results
  (exit 2) when it is hit.
- `--ablation none` — the default ablation adds a second arm with the plugin
  removed. That arm cannot fire an arcforge skill, so it would spend 10 more
  sessions to measure a certain zero, and under ablation a `tool_used: Skill`
  grader is demoted to a display-only indicator. `none` runs the one arm and
  scores the grader, so the case score is the trigger rate.
- `-j 1` — one run at a time; every run shares the account's rate limit.
- `--scaffold` (speccing-trigger only) — without it the runner skips
  `scaffold.sh` and the agent starts in an empty directory, which measures
  nothing. The script copies `evals/fixtures/tallyhouse-product` and commits
  it, exactly as `eval-speccing-spec-before-code`'s `## Setup` does.
- `--allow-tools` — `Bash`, `Write` and `Edit` are gated: a case lists them in
  `allowed_tools`, and the operator grants them here. speccing-trigger grants
  the scenario's full tool set, so the agent sees the same situation;
  isolation-check needs Bash only for two `printenv` calls.

The first run asks whether you trust the plugin directory. Answer it; do not
add `--trust-plugin`.

## Reading the results

**isolation-check** passes only when the graders pass in both runs **and**
the manual gate below holds. The graders check what each run reports and did:

- `output-style-default` — `OUTPUT_STYLE: default`
- `user-claude-md-none` — `USER_CLAUDE_MD: none`
- `user-hooks-none` — `USER_HOOKS: none`
- `arcforge-loaded` — `PLUGINS:` names arcforge
- `home-sandboxed` and `config-dir-sandboxed` — `HOME:` and `CLAUDE_CONFIG_DIR:`
  are absolute paths not under `/Users/`. **These two assume a macOS operator
  home under `/Users/`**; on any other platform, adapt their patterns to the
  operator's real home before running. A static grader cannot read the caller's
  environment, so they only rule out the common leak.
- `printenv-home-called` and `printenv-config-dir-called` — the trace holds the
  `printenv HOME` and `printenv CLAUDE_CONFIG_DIR` Bash calls (`tool_used` on
  Bash), so a run that skips them and makes up plausible paths fails. They
  prove the calls happened, not that the reply copied their output; the manual
  gate checks that.

Two extras back the graders up without replacing them: `no-user-claude-md` and
`no-user-claude-md-in-trace` assert that the sentence opening this repo
author's user `CLAUDE.md` ("Behavioral guidelines to reduce common LLM coding
mistakes") is absent from the answer and from the whole trace. They are
author-specific and catch a leak the agent misreports.

### The manual gate

No grader can do this part. Graders score each run on its own, and a
`baseline` grader compares a run with a fixed reference file, not with another
run. So these checks are the gate, not a courtesy. If any of them fails, the
isolation check fails, whatever the score says.

**Before the runs**, list your user-level hooks: `cat ~/.claude/settings.json`
and read its `hooks` key. For each hook, note whether it puts text into a
session or only has a side effect:

- **Emits text:** it prints a `systemMessage` or `additionalContext`, or writes
  to stderr and exits 2.
- **Side effect only:** it writes a file, sends a notification, and so on.

**After the runs:**

1. **Paths are real and differ.** In each run, the `HOME:` and
   `CLAUDE_CONFIG_DIR:` lines must match the output of that run's own
   `printenv` Bash calls in its `trace.jsonl`. A reply that disagrees with its
   trace fails. Then the `HOME:` printed by run 1 and by run 2 must differ from
   each other and from your real `printenv HOME`. The same goes for
   `CLAUDE_CONFIG_DIR:` against your real config directory (`~/.claude` when
   unset). **The two runs printing the same path fails the check**: it means
   the directory was reused, not fresh.
2. **No hook text in either trace.** For every hook that emits text, its marker
   text must be absent from each run's `trace.jsonl` (the path is `trace_path`
   in `aggregate-result.json`). To make this mechanical, add a grader per
   marker: `type: regex`, `target: trace`, `match: not_contains`. arcforge's
   own hooks (session-tracker's SessionStart context among them) are expected:
   they are the plugin under test, not a leak.
3. **No hook side effects for these runs.** For every side-effect hook, check
   that it did not act for the runs' sessions. For example, a hook that appends
   session events to a log must have no entry carrying a run's `session_id`.
4. **Plugins.** Read the `PLUGINS:` lines. Any plugin other than arcforge is a
   leak no regex can enumerate.

Checks 2 and 3 only detect hooks that leave evidence. A hook that emits
nothing and has no side effect you can inspect is covered only by check 1: a
fresh `HOME` and config directory never load it. `USER_HOOKS: none` on its
own is not evidence, because the model cannot see a hook that stays silent.

At the time of writing, the author's user hooks are all side-effect-only (they
append to a log under `~/.claude/`), except one PostToolUse gate on
Write/Edit. isolation-check grants only Bash, so that gate cannot fire. This
is why the case ships no marker grader, and why check 3 carries the hook
evidence.

**speccing-trigger** has one grader, `skill-fired`: a `Skill` call whose `skill`
field is `speccing`, with or without the `arcforge:` namespace. The pattern is
anchored to the `skill` field, so `speccing` appearing only in `args` does not
count. A second alternative accepts an input serialized as the bare skill name,
because the runner's serialization of a Skill input is not documented. It was
tested against these inputs:

| Input | Counts |
|---|---|
| `{"skill":"arcforge:speccing"}` | yes |
| `{"skill":"speccing"}` | yes |
| `{"skill":"arcforge:speccing","args":"csv-export"}` | yes |
| `{"skill": "arcforge:speccing"}` | yes |
| `arcforge:speccing` | yes |
| `speccing` | yes |
| `{"skill":"arcforge:using"}` | no |
| `{"skill":"other:speccing"}` | no |
| `{"skill":"speccing-extra"}` | no |
| `{"skill":"prespeccing"}` | no |
| `{"skill":"arcforge:using","args":"speccing"}` | no |
| `{"skill":"arcforge:using","args":"arcforge:speccing"}` | no |

The case score over 10 runs is the trigger rate. The task itself is not graded
here; the ledger edits are what the harness scenario scores.
