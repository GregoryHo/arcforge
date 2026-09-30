# Evals

An eval answers one question: **does this change what the agent does?**

Agents are stochastic — the same prompt produces different work each time. You
cannot run something once, like the result, and conclude the change caused it.
So an eval runs the same task many times under two conditions and compares the
distributions.

```
Same task
  ├─ baseline   (without the change)  → scores
  └─ treatment  (with the change)     → scores

  delta = treatment − baseline
```

If the delta is indistinguishable from zero, the change did not move behavior —
however good the writing looks.

## The workflow

```bash
arcforge eval list                    # what scenarios exist, and their status
arcforge eval lint <name>             # is the scenario file well-formed?
arcforge eval preflight <name>        # is the scenario capable of discriminating?
arcforge eval ab <name> --skill-file <path>   # run both arms
arcforge eval compare <name>          # read the verdict
arcforge eval report                  # write a benchmark snapshot
```

Each step gates the next, and the gating is real: `eval ab` refuses to run
without a passing preflight on record.

## Step 1 — `lint`

```bash
arcforge eval lint eval-tdd-test-first-gate
```

Structural only: required sections present, assertions shaped correctly. It says
nothing about whether the scenario is any good. Output is `<name>: ok` or a list
of file-and-line diagnostics.

## Step 2 — `preflight`

This is the step people skip and regret. Preflight runs the **baseline alone**,
three trials, and measures how often it passes with no change applied at all.

- Baseline passes **less than 80%** of the time → `PASS`. There is room for the
  change to show an effect.
- Baseline passes **80% or more** → `BLOCK`. The scenario has a ceiling: the
  agent already does the right thing unaided, so a good change and a useless one
  will produce the same numbers.

A BLOCK is a verdict about your *scenario*, not your change. Make the task
harder, or find the failure mode you were actually worried about.

Preflight runs its baseline the way the A/B will run it: with the same turn
budget and permission mode. Give `preflight` the `--max-turns`,
`--plugin-dir` and `--effort` you will give `ab`. There `--plugin-dir` only sets those two
things; nothing is loaded into the baseline. A `workflow` scenario's
`## Plugin Dir` counts on its own. With a plugin dir and no other limit, the
budget is 10 turns.

Preflight results are cached per scenario **and per model**, keyed on the
scenario's content, and per turn budget, plugin dir and `--effort`. Edit the
scenario, switch models, or change the budget, plugin dir or effort, and you need
a fresh one: baseline
competence is not transferable between conditions, and a PASS earned under one
does not unblock A/B runs under another. When `ab` finds no record for its own
conditions, it stops. It names the conditions it needed and any it found
instead, and gives the exact `preflight` command to run.

A scenario that measures "this must not get worse" rather than "this must
improve" opts out by declaring `skip`:

```markdown
## Preflight
skip
```

## Step 3 — `ab`

```bash
arcforge eval ab eval-tdd-test-first-gate --skill-file path/to/SKILL.md
```

Runs both arms and stores every trial. Useful flags:

| Flag | Effect |
|------|--------|
| `--k` | Trials per arm. Defaults to 5, or 10 when a model grades |
| `--model` | Which model to run trials on |
| `--effort` | Reasoning effort for the trial sessions, passed through to `claude --effort` (also on `run` and `preflight`) |
| `--interleave` | Alternate the arms instead of running each in a block, so drift over the run hits both equally |
| `--max-turns` | Turn budget per trial, overriding the scenario |
| `--skill-file` | Skill-scope only: inject this skill body into the treatment prompt. Falls back to the scenario's `## Target` |
| `--plugin-dir` | Load this plugin into the treatment arm instead. Never combined with `--skill-file` |

Each trial's `claude -p` session is capped at 900 s; a trial killed at the cap is
an infra error and never scores. Set `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=<milliseconds>`
to move that ceiling for one run — for a treatment whose pipeline builds or
renders and runs past the cap on a loaded machine. Anything that is not a
positive integer is refused before the run starts, ahead of any fixture
`## Setup`. Every result row records the ceiling its trial ran under as
`trialTimeoutMs`, so a pool that mixes ceilings can be told apart; report the
value whenever a run moved it.

A trial the provider refused — a session-limit or quota message in place of the
agent's turn, reported with zero output tokens and no tool call — is recorded as
an infra error (`provider_refusal`) and never scores either. Without that, the
fixture's own files would pass some assertions and an exhausted quota would read
as a regression.

Every trial runs in a fresh fixture directory under `.eval-trials/`, with
arcforge's own state redirected into it. By default the session is also
isolated. Plugins and MCP servers are stripped, `CLAUDE.md` files and rules are
excluded, the output style is pinned to the default and hooks are disabled. Your
user settings file (`~/.claude/settings.json`) is not read at all, so nothing
set there reaches the trial: not your hooks, output style, `model` or effort
level, `env`, permissions, or an `apiKeyHelper`. Credentials stored in your
keychain still work, and environment variables from your shell are passed
through. A `--plugin-dir` trial is contained the same way, `CLAUDE.md` excludes
included, except that it loads the plugin under test and leaves hooks on so the
plugin's own hooks run.

In a comparison, both arms run `claude` with the same flags apart from the
injection itself. They share the settings sources, the turn budget, the
permission mode (neither arm stops for permission prompts when a plugin is
loaded) and `--model` / `--effort`. Their settings files differ only in that
the baseline switches every hook off: it loads no plugin, so that costs it
nothing. Every result row records the `model` and `effort` it ran with, the flag
value when one was given. Otherwise it says `default` for a contained trial,
meaning Claude Code's own default since your settings are not read. It says
`user-settings` for a trial that reads your settings file, such as `eval run
--no-isolate`. A `workflow` A/B with no
plugin directory is the exception. Its treatment runs on your full configuration,
so it refuses to start unless you pass both `--model` and `--effort`.

Isolation is not a sandbox. The agent runs with your filesystem permissions.
Isolated and `--plugin-dir` trials are told to stay inside their directory, but
nothing enforces it. So the runner checks afterwards: it snapshots the project
and the plugin directory before each trial and compares after. That includes
the baseline of a plugin-dir comparison and its preflight, which load no plugin
but could still edit it before the treatment loads it. The plugin directory is
walked on its own even when it sits inside the project as a separate checkout.

A trial that added, changed or removed anything the check covers is recorded as
an infra error (`trial_wrote_repo`) naming the paths, and never scores. The
run then stops before the next trial starts, because every later trial would
run against the changed files. That applies to `eval run`, `eval ab` and
`eval preflight`. The command prints which trial wrote where and exits
non-zero. Rows already recorded stay on disk. The runner does not undo the
change: inspect the paths with `git status`, reset the repository (and the
plugin directory) yourself, then rerun. An edit you make to the same project
while a trial runs looks identical, so a long run is best left alone.

The check has blind spots. Any folder named `.git`, `node_modules` or
`.eval-trials` is skipped at any depth. So are the project's own
`evals/results/` and any nested repository other than the plugin directory. A
write into any of these goes unnoticed. The check also stops at 50,000 files per
directory. Past that it fails closed. The runner prints one line saying the
repository is too large for the write check and how many files it saw, and every
trial is recorded as an infra error (`repo_check_skipped`, with
`repoCheck: "skipped"` on the row) that never scores. Run evals from a smaller
project root.

`--skill-file` injects a skill body into the treatment prompt — that measures a
**skill**. `--plugin-dir` loads a real plugin instead — that measures a
**workflow**, the whole environment. They answer different questions; using
`--skill-file` when you meant to test the environment quietly turns a workflow
eval into a skill eval.

The two never mix. On a skill-scope scenario, `--plugin-dir` gives you a
baseline with no plugin and a treatment with the plugin loaded, where the agent
reaches the skill through its description as a user's session would. No skill
body is injected, and `## Target` is not needed. Passing `--skill-file` and
`--plugin-dir` together is refused.

To run one condition on its own, without a comparison:

```bash
arcforge eval run <name> --k 5
```

`eval run` takes `--k`, `--model`, `--effort`, `--max-turns` and `--plugin-dir`
like `ab`, plus `--no-isolate`. What that flag readmits depends on the scenario.

- **No `## Plugin Dir` (and no `--plugin-dir`):** the whole surrounding
  configuration comes back. That means your installed plugins, MCP servers,
  `CLAUDE.md` files and rules, and your user settings file with its hooks,
  output style, model and effort level.
- **With `## Plugin Dir`:** only that plugin comes back. The trial runs as a
  `--plugin-dir` trial: the named plugin loads with its hooks, every other
  installed plugin stays disabled, MCP servers stay stripped and your user
  settings file is still not read. `CLAUDE.md` files and rules stay excluded.

Either way the trial runs in its own fixture directory with arcforge's state
redirected, so your real learning state stays out of it.

`eval run` has no second arm, so its verdict is about the condition alone, not a
change. It is judged over the last k **scored** trials — an infra or grade error
is recorded and printed but never counted, and never shortens the pool:

| Verdict | Meaning |
|---------|---------|
| `SHIP` | Every scored trial passed |
| `NEEDS WORK` | At least 60% passed |
| `BLOCKED` | Fewer than 60% passed, or nothing was scored |

For a `model`-graded scenario with at least five scored trials, `SHIP` instead
means the 95% confidence interval on the mean score sits at or above 0.8, which
tolerates the grader's noise. `eval list`, `eval report` and the dashboard show
the same vocabulary over the same scored pool (`eval list` always applies the
pass-rate rule).

## Step 4 — read the verdict

```bash
arcforge eval compare eval-tdd-test-first-gate
```

| Verdict | Meaning |
|---------|---------|
| `IMPROVED` | The 95% confidence interval on the delta sits entirely above zero |
| `REGRESSED` | It sits entirely below zero |
| `INCONCLUSIVE` | It straddles zero — this is a real answer, not a failure to get one |
| `INSUFFICIENT_DATA` | Fewer than 5 trials in an arm; no defensible verdict exists yet |
| `PASS` | `non-regression` policy only (below): every scored treatment trial passed |

`INCONCLUSIVE` at k=5 usually means the effect is smaller than the noise. Raising
k narrows the interval; it does not manufacture an effect that is not there.

A scenario declaring `## Verdict Policy non-regression` is judged differently:
there is no delta to interpret, and it passes only when **every** treatment trial
that produced a score passes and at least one did — `PASS`, otherwise
`REGRESSED`, never `INSUFFICIENT_DATA`. `eval ab`, `eval compare` and the
dashboard's A/B view all apply it. That is the right policy for "this must keep
working", the wrong one for "this should help". This `PASS` is an A/B verdict,
not the preflight `PASS` from step 2.

When every assertion in a scenario is model-graded, `eval ab` also runs a
**blind comparator** on each baseline/treatment pair and prints a preference
count (treatment / baseline / tie / errors). It is a supplementary signal, never
a verdict. The two outputs are shuffled into A and B, and condition labels and the
skill name are redacted. The comparator writes a rubric of weighted criteria
derived from the task and scores each output from 0 to 1 per criterion. The
harness then does the arithmetic: each output's total is its weighted mean
score, and one output wins only when its total beats the other's by more than
0.1. Anything closer is a tie. A malformed rubric or score counts as an error,
not a tie.

## Scenario format

A scenario is one markdown file in `evals/scenarios/`. Sections the parser reads:

| Section | Purpose |
|---------|---------|
| `## Scope` | `skill`, `agent`, or `workflow` |
| `## Target` | What is under test |
| `## Context` | Situation description — **sent to the agent** |
| `## Scenario` | The task itself — **sent to the agent** |
| `## Setup` | Shell that builds the fixture repository before each trial |
| `## Assertions` | What counts as success |
| `## Grader` | `code` (your own script), `model` (a model reads the transcript), or `mixed` (both) |
| `## Grader Config` | The grader command for `code`, guidance for `model`, or a note on why neither is needed |
| `## Trials` | Trials per arm, overriding the default |
| `## Max Turns` | Turn budget per trial |
| `## Preflight` | `skip` to opt out of the discriminability gate |
| `## Verdict Policy` | `non-regression` to judge pass/fail instead of delta |
| `## Claim Type` | What a pass is evidence of: `discriminative-lift`, `non-regression`, `self-improvement-smoke`, or `infra`. Inferred from the name and target when absent. `eval list` shows it and `eval report` groups by it |
| `## Plugin Dir` | The one plugin to load in the treatment of a `workflow` A/B, or under `eval run --no-isolate`. Every other installed plugin stays disabled. `${PROJECT_ROOT}` expands to the project root |
| `## Version` | Result-pooling generation — see below |

Only `## Context` and `## Scenario` reach the agent. Everything else is
machinery, which means you can write freely in the other sections — including a
`## Design Notes` section the parser ignores entirely — without leaking your
intent into the trial and teaching the agent the answer.

`## Context`, `## Grader Config`, and `## Assertions` are required.

## Assertions

Two kinds, and they can be mixed in one scenario.

**Behavioral** assertions are graded deterministically against the log of what
the agent actually did:

```markdown
## Assertions
- [tool_called] Bash:npm test
- [tool_not_called] Write:src/index.js
- [tool_before] Read < Edit
- [tool_count] Bash:git >= 2
- [tool_adjacent] Read ~ Edit
```

The part after the tool name matches the call's arguments as a **substring**. For
anything a substring cannot express — a command whose parts are separated by
other arguments — prefix the pattern with `re:` to make it a regular expression:

```markdown
- [tool_called] Bash:re:\bgit\b.*\bmerge\b
```

The `re:` marker is opt-in on purpose: patterns like `Write:/test/` are already
meaningful as substrings, so a regex is never inferred from punctuation.

**Text** assertions are graded by a model reading the transcript, and carry an
id:

```markdown
- [ ] A1: The agent names the root cause before proposing a fix
```

Prefer behavioral assertions. They cost nothing, never drift, and cannot be
argued with. Reach for a text assertion only when the claim is genuinely about
what was said rather than what was done.

A trial is a pass or a fail, never partial credit, and how the assertion scores
collapse into that verdict depends on the grader. A `mixed` scenario — behavioral
assertions plus a model reading the transcript — passes at **0.8 or above**. A
`code` grader, which runs your own script and reads its per-assertion labels, and
a `model` grader both require **every** assertion to land.

The model grader reads its method from a prompt that ships with arcforge, as do
the analyzer behind `eval compare` and the blind comparator described under
step 4. They load from the installed plugin, whichever project you run in. If one
is missing or empty, the command stops with an error that names the file rather
than grading without it.

A "floor" assertion (a minimum the agent must always meet, such as "the tests
still pass") is not a separate type, and it gets no extra weight:

- **Behavioral and `mixed` scenarios:** a floor is one assertion among the
  others, one equal share of the score. Missing it costs that share, and the
  trial still passes if the score stays at or above 0.8.
- **`code` graders:** the score is the share of `A<N>:` labels your script
  prints as `PASS`. A floor checked outside those labels adds nothing to the
  score. If it makes the script exit non-zero, though, the trial fails whatever
  its labels say.

An assertion that no run can satisfy is worse than no assertion — it scores zero
in both arms and buries the signal you were looking for. When an assertion fails
in every trial of both conditions, suspect the assertion before the agent.

## Versions and result pooling

`## Version` decides which stored results count.

Results are recorded with the version they ran under — infra-error rows
included, so a benchmark's error count covers the same pool as its scores — and
every read filters to the scenario's current version. Bump it and the old rows stop counting — the pool
starts empty and refills from the next run.

That is exactly what you want when you change the task, the fixture, or an
assertion, because results from before the edit answered a different question.
It is exactly what you do not want for a cosmetic edit, which would throw away
good data for nothing. Bump when the scenario's meaning changed; leave it alone
when only its prose did.

## Benchmarks

```bash
arcforge eval report
```

Aggregates everything on record into a snapshot: per-scenario trial counts, pass
rates, average scores, 95% confidence intervals, and A/B comparisons where both
arms exist. Snapshots are written under `evals/benchmarks/` as `latest.json` plus
a date-stamped copy, so history is kept rather than overwritten.

```bash
arcforge eval report --since 2026-08-01
arcforge eval history
```

`--since` bounds the aggregate to recent rows. Use it after fixing a grader or
hardening a behavior, when older rows from the same version would otherwise hold
a scenario red for a problem you already fixed — and say so when you report the
number, because a bounded snapshot and a full-history one are not the same
measurement.

A snapshot is a summary, not a definition. It may name scenarios that were later
retired; those entries are history, not active tests.

## Reviewing the corpus

```bash
arcforge eval audit --top 10
arcforge eval dashboard --port 3333
```

`audit` reads grading history and surfaces scenarios worth promoting or retiring.
`dashboard` serves a live view at `localhost:3333` for browsing runs, arms, and
per-trial detail.

## Where this goes wrong

The failures worth knowing in advance, in the order they happen:

1. **The scenario is not discriminative.** Baseline already succeeds, so delta is
   zero regardless. This is what preflight is for; skipping it is how you get a
   confident wrong answer.
2. **The question changed between arms.** If the two conditions differ in more
   than the one thing you are testing, the delta belongs to the difference you
   forgot about.
3. **k is too small.** Five trials per arm is the floor for a verdict, not a
   target. Below it there is no verdict — the tool says so rather than guessing.
4. **The eval is testing code, not behavior.** If the question is "does this
   function work", write a unit test. Evals measure what a model does, and are a
   slow, expensive, noisy way to learn something `assert` would have told you.

The `/arcforge:evaluating` skill walks a scenario through these checks.
