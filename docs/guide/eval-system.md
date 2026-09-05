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

Preflight results are cached per scenario **and per model**, keyed on the
scenario's content. Edit the scenario or switch models and you need a fresh one —
baseline competence is not transferable between models, and a PASS earned under
one does not unblock A/B runs under another.

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
| `--interleave` | Alternate the arms instead of running each in a block, so drift over the run hits both equally |
| `--max-turns` | Turn budget per trial, overriding the scenario |
| `--plugin-dir` | Load a plugin directory into the treatment arm |

`--skill-file` injects a skill body into the treatment prompt — that measures a
**skill**. `--plugin-dir` loads a real plugin instead — that measures a
**workflow**, the whole environment. They answer different questions; using
`--skill-file` when you meant to test the environment quietly turns a workflow
eval into a skill eval.

To run one condition on its own, without a comparison:

```bash
arcforge eval run <name> --k 5
```

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

`INCONCLUSIVE` at k=5 usually means the effect is smaller than the noise. Raising
k narrows the interval; it does not manufacture an effect that is not there.

A scenario declaring `## Verdict Policy non-regression` is judged differently:
there is no delta to interpret, and it passes only when **every** treatment trial
that produced a score passes and at least one did. That is the right policy for
"this must keep working", the wrong one for "this should help".

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

An assertion that no run can satisfy is worse than no assertion — it scores zero
in both arms and buries the signal you were looking for. When an assertion fails
in every trial of both conditions, suspect the assertion before the agent.

## Versions and result pooling

`## Version` decides which stored results count.

Results are recorded with the version they ran under, and every read filters to
the scenario's current version. Bump it and the old rows stop counting — the pool
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
