# eval — spec

> Status: shipped v6.0.0 · extended by 6.2.0 (next) · [ROADMAP](../ROADMAP.md)
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
  scenario content, model, turn budget and plugin-dir setting: baseline
  competence is not transferable, and an A/B run whose baseline conditions
  differ from the cached preflight is refused until preflight is rerun under
  them. Non-regression
  scenarios (`must not get worse`) opt out with an explicit `skip`.

### Verdicts
- **B-4 Verdicts come from confidence intervals, not thresholds.** `IMPROVED`
  / `REGRESSED` only when the 95% CI on the delta clears zero entirely;
  straddling zero is `INCONCLUSIVE` — a real answer, not a failure to get one.
  Under 5 trials per arm the harness returns `INSUFFICIENT_DATA` rather than
  guessing. A `non-regression` verdict policy replaces the delta with a strict
  bar: the verdict is `PASS` when the treatment arm has at least one scored
  trial and every one of them passes, `REGRESSED` otherwise — an arm with
  nothing scored fails the bar rather than deferring.
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
  learning state — unconditionally. Nor does the user's configuration reach
  the trial. On top of that, isolation is the default: plugins and MCP servers are
  stripped, `CLAUDE.md` files and rules are excluded, the output style is
  pinned to the default, hooks are disabled, and the user settings file is
  not read, so the operator's hooks, output style, model, effort level, env
  and permissions reach neither arm. A plugin-dir trial is contained the same
  way, `CLAUDE.md` excludes included, but keeps the plugin under test with its
  own hooks; the user settings file is dropped there too, which costs a
  credential that lives only in that file. Both arms of a comparison run the
  same `claude` flags apart from the injection itself, and their settings
  files differ only in that the baseline, which loads no plugin, switches every
  hook off; every row records the `model` and `effort` it ran with. The
  exception is a `workflow` A/B with no plugin dir, whose treatment runs on the
  user's full configuration by definition: it refuses to start unless `--model`
  and `--effort` are both given, which is all that keeps the arms on one model
  and one effort. Opting out
  (`--no-isolate`) readmits the surrounding toolkit into the trial — never the
  user's real state. Isolation is not a sandbox, and that is a limit rather
  than a promise: the agent runs with the operator's filesystem permissions.
  What the runner adds is detection after the fact, within the blind spots the
  guide lists: a trial that wrote inside the repository it ran from is
  recorded as an instrument failure (`trial_wrote_repo`) and leaves every
  scored pool.
- **B-8 Results pool by scenario version.** Every result records the version
  it ran under and every read filters to the current one — editing a
  scenario's *meaning* (task, fixture, assertions) bumps the version and
  empties the pool, because old rows answered a different question; cosmetic
  prose edits do not.
- **B-10 A trial the runner cut off is an instrument failure, not a
  measurement.** Every trial's `claude -p` session runs under a per-trial
  ceiling: 900 s, unless `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS` moves it for one run —
  unset or empty means the default, and any value that is not a positive
  integer of milliseconds is refused before the run begins, ahead of any
  fixture `Setup` and any session (D-018). A trial the runner killed before the agent finished its turn is
  recorded as `trial_killed_incomplete` and excluded from every scored pool —
  a preflight containing one BLOCKs outright rather than rating the rest —
  because its half transcript would otherwise grade as if the
  agent had chosen to stop there; it neither moves the delta against the arm
  nor counts as a scored trial under B-4's strict bar. A killed trial that had
  already delivered its answer is a valid measurement and scores. A provider
  refusal — a session-limit or quota message returned in place of the agent's
  turn — is an instrument failure of the same kind: its row carries
  `infraError` and leaves every scored pool (D-018). The ceiling is part of
  the measurement conditions, so a run that moved it MUST be reported with the
  value it used, the way B-9 treats a `--since`-bounded snapshot, and every
  result row records the ceiling its trial ran under (D-018). Residual: a
  refusal that arrives after the agent has already acted — tool calls made,
  output tokens spent — is not distinguished from a completed turn and scores
  as one.

### Benchmarks
- **B-9 Snapshots keep history and gate releases.** `eval report` writes
  `latest.json` plus a date-stamped copy under `evals/benchmarks/`; a release
  tag is blocked by CI when the benchmark is stale — when eval-backed surface
  (skills, scenarios, fixtures) changed since the previous release tag. A
  `--since`-bounded snapshot is a different measurement from a full-history
  one and MUST be reported as such.

## Data / domain model

A **scenario** is markdown with a fixed section set; `scripts/lib/eval-scenario.js`
owns its parsing, discovery, and evidence claim types. A **result** is a JSONL row
under `evals/results/` that records the scenario version it ran under — the field
that makes a pool version-scoped (B-8) — and a **benchmark** is the snapshot
`eval report` writes under `evals/benchmarks/` (B-9). The A/B verdict vocabulary and
the arithmetic that produces it belong to `scripts/lib/eval-stats.js`; no other
module invents a verdict. Delta-CI judging returns `IMPROVED`, `REGRESSED`,
`INCONCLUSIVE`, or `INSUFFICIENT_DATA` from the interval; a scenario declaring the
`non-regression` verdict policy is judged by the strict bar instead and returns
`PASS` or `REGRESSED` — never `INSUFFICIENT_DATA`, because an empty treatment arm
fails the bar rather than deferring. That `PASS` is a distinct token from the
preflight `PASS` in B-3, which is a discriminability outcome (`PASS` / `BLOCK`), not
an A/B verdict. A result the runner killed before the agent finished carries
`errorType: trial_killed_incomplete` and `infraError: true` —
`scripts/lib/eval-trial-outcome.js` owns the three predicates (killed, output
complete, provider refusal) — and `scorableResults` in `eval-stats.js` drops every `infraError` /
`gradeError` row from every scored pool (`eval run`, A/B, benchmark), while
preflight fails closed on the same flags (B-10). Every result row records
`trialTimeoutMs`, the ceiling its trial ran under, so a pool that mixes ceilings
can be seen from its rows.

## Decisions

The measurement culture — two-arm evidence, the preflight ceiling gate,
refuse-don't-guess verdicts — predates this log; rationale inline above.
Scenario mechanics are taught by the `evaluating` skill and specified in
`docs/guide/eval-system.md`. D-017 pins the per-run override of the trial
ceiling (B-10); the exclusion of killed-incomplete trials predates the log, and
its rationale is inline at B-10.

- **D-018** — 6.1.1 repairs the instrument before the release benchmark is
  measured on it (B-7, B-9, B-10).
- **D-021** — 6.1.1's benchmark reruns only the scenarios whose subject changed;
  the pools not re-run are recorded as measured on the pre-repair instrument
  (B-9).
- **D-025** — *proposed*: `claude plugin eval` measures routing only and stays
  out of the release gate (B-1, B-9).
- **D-026** — *proposed*: the ledger records answering-feedback's REGRESSED, and
  the cost flag is informational for an injected treatment (B-4).
- **D-027** — *proposed*: floor assertions keep the weight the engine gives them
  today, written down before 6.1.1's results are read (B-5).
- **D-020** — 6.2.0 carries the scenario rubric fixes with their own
  measurement round (B-8).
- **D-043** — *proposed*: graders never execute trial output (B-6, B-7).
