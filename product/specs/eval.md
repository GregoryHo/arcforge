# eval — spec

> Status: shipped v6.0.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

The eval harness answers one question with statistics instead of vibes: **does
this change what the agent does?** Agents are stochastic, so a single good run
proves nothing; the harness runs the same task repeatedly under two conditions
and compares the distributions. It is what backs the toolkit's evidence bar —
a behavioral claim about a skill ships with a measured delta, not a self-report.

## Scope

- **In scope:** the controlled-comparison model; the gated workflow; the
  discriminability gate; verdict semantics; assertion grading; result pooling;
  benchmarks as a release gate.
- **Out of scope:** scenario authoring practice (the `evaluating` skill and
  `docs/guide/eval-system.md`); which skills currently carry evidence
  ([skill-system](skill-system.md) B-9).

## Behavior

### The comparison model
- **B-1 Two arms or no claim.** An eval runs baseline (without the change) and
  treatment (with it) on the same task, k trials per arm, and judges the delta
  between score distributions. `eval ab --skill-file` injects the skill body
  into the treatment prompt and therefore measures a **skill**; `--plugin-dir`
  loads a real plugin and measures a **workflow** — they answer different
  questions and MUST NOT be conflated. `eval run` executes one condition alone —
  with no second arm to compare against, it cannot attribute what it observes
  to a change.
- **B-2 The workflow is gated, and the gates are real.** `lint` (structural) →
  `preflight` (discriminability) → `ab` (trials) → `compare` (verdict).
  `eval ab` refuses to run without a passing preflight on record.

### Discriminability
- **B-3 Preflight kills ceiling scenarios before they cost anything.**
  Preflight runs the baseline alone and BLOCKs the scenario when the baseline
  already passes ≥80% of the time — at a ceiling, a good change and a useless
  one produce the same numbers, so any delta measured there is noise. A BLOCK
  is a verdict about the scenario, not the change. Results are cached per
  scenario content **and per model**: baseline competence is not transferable,
  and a PASS under one model never unblocks runs under another. Non-regression
  scenarios (`must not get worse`) opt out with an explicit `skip`.

### Verdicts
- **B-4 Verdicts come from confidence intervals, not thresholds.** `IMPROVED`
  / `REGRESSED` only when the 95% CI on the delta clears zero entirely;
  straddling zero is `INCONCLUSIVE` — a real answer, not a failure to get one.
  Under 5 trials per arm the harness returns `INSUFFICIENT_DATA` rather than
  guessing. A `non-regression` verdict policy replaces the delta with a strict
  bar: every treatment trial must pass.
- **B-5 A trial is pass or fail, never partial credit.** Behavioral assertions
  (graded deterministically from the log of what the agent actually did) are
  the preferred evidence — they cost nothing, never drift, and cannot be
  argued with; model-graded text assertions exist for claims about what was
  *said*. A mixed scenario passes at score ≥ 0.8; `code` and `model` graders
  require every assertion to land.

### Trial integrity
- **B-6 The agent never sees the grading.** Only a scenario's `Context` and
  `Scenario` sections reach the agent; assertions, grader config, and design
  notes are machinery — intent cannot leak into the trial and teach the agent
  the answer.
- **B-7 Trials cannot contaminate the user.** Every trial runs in a clean
  fixture directory with toolkit state redirected away from the user's real
  learning state — unconditionally. On top of that, isolation is the default:
  the trial session is stripped of plugins and MCP servers, and opting out
  (`--no-isolate`) readmits the surrounding toolkit into the trial — never the
  user's real state.
- **B-8 Results pool by scenario version.** Every result records the version
  it ran under and every read filters to the current one — editing a
  scenario's *meaning* (task, fixture, assertions) bumps the version and
  empties the pool, because old rows answered a different question; cosmetic
  prose edits do not.

### Benchmarks
- **B-9 Snapshots keep history and gate releases.** `eval report` writes
  `latest.json` plus a date-stamped copy under `evals/benchmarks/`; a release
  tag is blocked by CI when the benchmark is stale — when eval-backed surface
  (skills, scenarios, fixtures) changed since the previous release tag. A
  `--since`-bounded snapshot is a different measurement from a full-history
  one and MUST be reported as such.

## Decisions

The measurement culture — two-arm evidence, the preflight ceiling gate,
refuse-don't-guess verdicts — predates this log; rationale inline above.
Scenario mechanics are taught by the `evaluating` skill and specified in
`docs/guide/eval-system.md`.
