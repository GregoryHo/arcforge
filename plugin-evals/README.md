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

**isolation-check** passes only if every grader passes, in both runs. The gate
is what the agent reports:

- `output-style-default` — `OUTPUT_STYLE: default`
- `user-claude-md-none` — `USER_CLAUDE_MD: none`
- `user-hooks-none` — `USER_HOOKS: none`
- `arcforge-loaded` — `PLUGINS:` names arcforge
- `home-sandboxed` and `config-dir-sandboxed` — `HOME:` and `CLAUDE_CONFIG_DIR:`
  are absolute paths not under `/Users/`. **These two assume a macOS operator
  home under `/Users/`**; on any other platform, adapt their patterns to the
  operator's real home before running. A static grader cannot read the caller's
  environment, so they only rule out the common leak.

Two extras back the gate up without replacing it: `no-user-claude-md` and
`no-user-claude-md-in-trace` assert that the sentence opening this repo
author's user `CLAUDE.md` ("Behavioral guidelines to reduce common LLM coding
mistakes") is absent from the answer and from the whole trace. They are
author-specific and catch a leak the agent misreports.

Then read by hand, before trusting the routing run:

- Compare the printed `HOME:` and `CLAUDE_CONFIG_DIR:` against your real ones
  (`printenv HOME`, `printenv CLAUDE_CONFIG_DIR` in your own shell). They must
  differ; the regexes cannot check that.
- Read the `PLUGINS:` and `USER_HOOKS:` lines: any plugin other than arcforge,
  or any hook, is a leak no regex can enumerate.

**speccing-trigger** has one grader, `skill-fired`: a `Skill` call whose input
names `speccing`, with or without the `arcforge:` namespace. The case score
over 10 runs is the trigger rate. The task cannot finish in 8 turns and is not
graded; the ledger edits are what the harness scenario scores.
