# eval — spec

> Status: shipped v6.4.0 · extended by 6.5.0 (next) · [ROADMAP](../ROADMAP.md)
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
- **B-11 Routing is a trigger rate, measured outside the harness.** Whether a
  named skill fires under real plugin routing is measured with the plugin
  loaded through `claude plugin eval` and a `tool_used: Skill` grader matched
  to that skill (D-025). The reading is a trigger rate, not a verdict: it MUST
  NOT enter the release gate or the benchmark snapshot (B-9). Its cases live
  outside `evals/`, the harness's own directory, and every run keeps its report
  local (`--no-publish`), pins its model (`--model`) and sets a spending cap
  (`--max-cost-usd`), so each reading names the model it measured and no run
  can overrun its budget.

### Discriminability
- **B-3 Preflight kills ceiling scenarios before they cost anything.**
  Preflight runs the baseline alone and BLOCKs the scenario when the baseline
  already passes ≥80% of the time — at a ceiling, a good change and a useless
  one produce the same numbers, so any delta measured there is noise. A BLOCK
  is a verdict about the scenario, not the change. Results are cached per
  scenario content, model, effort, ceiling, turn budget and plugin-dir setting: baseline
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
  nothing scored fails the bar rather than deferring. Under that policy the
  cost-regression flag (a treatment mean of duration or tokens above twice the
  baseline's) on an injection-type treatment is reported, never counted toward
  the verdict: an injected skill adds tokens to every trial by construction.
  The coverage ledger records a `REGRESSED` as measured, never re-booked as a
  pass driven by cost (D-026).
- **B-5 A trial is pass or fail, never partial credit.** Behavioral assertions
  (graded deterministically from the log of what the agent actually did) are
  the preferred evidence — they cost nothing, never drift, and cannot be
  argued with; model-graded text assertions exist for claims about what was
  *said*. A mixed scenario passes at score ≥ 0.8; `code` and `model` graders
  require every assertion to land. Floor assertions count toward that bar as
  the engine computes it today (D-027). The engine has no floor type: a floor
  is a scenario author's label for a check both arms are expected to pass.
  Listed as an assertion, it is one equal share of the score like any other,
  so in a mixed scenario floors can carry a trial over 0.8; a `code` grader's
  floor printed outside its `A<N>:` labels adds nothing to the score but fails
  the trial through the grader's exit code.

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
  credential that lives only in that file. A contained trial runs without
  permission prompts, since it is unattended and the operator's permission mode
  does not reach it. Both arms of a comparison run the
  same `claude` flags apart from the injection itself, and their settings
  files differ only in that the baseline, which loads no plugin, switches every
  hook off; every row records the `model` and `effort` it ran with. The
  exception is a `workflow` A/B with no plugin dir, whose treatment runs on the
  user's full configuration by definition: it refuses to start unless `--model`
  and `--effort` are both given, which is all that keeps the arms on one model
  and one effort. Opting out
  (`--no-isolate`) readmits the surrounding toolkit into the trial — never the
  user's real state. From 6.5.0 the engine also builds a contained trial's
  environment variables and `PATH` rather than passing the operator's on
  (B-18); a `--no-isolate` trial inherits the operator's environment. Isolation is not a sandbox, and that is a limit rather
  than a promise: the agent runs with the operator's filesystem permissions.
  What the runner adds is detection after the fact, within the blind spots the
  guide lists: a trial that wrote inside the repository it ran from is
  recorded as an instrument failure (`trial_wrote_repo`), as is one whose
  repository was too large to check (`repo_check_skipped`), and neither
  enters a scored pool. A session that never started is a third instrument
  failure (`trial_spawn_failed`, B-18), excluded the same way.
- **B-8 Results pool by scenario version.** Every result records the version
  it ran under and every read filters to the current one — editing a
  scenario's *meaning* (task, fixture, assertions) bumps the version and
  empties the pool, because old rows answered a different question; cosmetic
  prose edits do not. A pool is the scenario version plus the run conditions
  (model, effort, ceiling, turn budget, plugin dir, isolation), and readers never combine
  conditions (D-021). From 6.5.0 three more conditions apply to a run that opts
  into them — staged skill files (`stageSkillFiles`, B-19), a baseline skill
  text (`baselineSkillHash`, B-20) and, when that baseline is staged, the
  digest of its staged files (`baselineSkillFilesHash`, B-20); a
  run that uses none records none, so its rows pool with those written
  before 6.5.0 (D-062).
- **B-12 A grader reads what a trial produced; it never runs it.** No grader
  executes code a trial wrote — no probe, no import, no test run over the
  trial's files — because the agent under test wrote it, it would run on the
  operator's machine with the operator's permissions, and isolation is not a
  sandbox (B-7). A claim about what that code does is graded statically, over
  the trial's files. The A5 floor of `eval-speccing-spec-before-code` (#156) is
  such a check: it reads the trial's files for the CSV branch rather than
  probing the exported function with `node -e`. It ships with the scenario's
  other three rubric repairs (#157, #162, #168) in one `## Version` bump, which
  empties the scenario's pool (B-8), and the scenario is re-measured at k=10 in
  both arms. Cost accepted: a static floor can pass on code that reads right
  and does not run (D-043).
- **B-14 No code grader runs with the trial directory importable (6.4.0).**
  The engine runs every code grader from a fresh, empty temporary directory
  that it deletes afterwards, never from the trial directory, so whatever the
  scenario's grader command spells — `python3 -` included — the trial
  directory is not on Python's import path, and a module the trial left
  behind cannot be imported in place of the standard library to forge a
  grade. A grader reaches the trial's files only through the absolute paths
  in `TRIAL_DIR`, `PROJECT_ROOT` and `TRANSCRIPT_PATH`, and reads them as
  data. Importing a planted module is running trial output, which B-12
  already forbids (#250, D-055). Residual: a grader the timeout kills is
  still scored as an ordinary FAIL, not a grade error, so it lands in the
  scored pool as a behavioural failure.
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
  `infraError` and leaves every scored pool (D-018). So is a session that
  never started — the exec fails with no exit status, nothing killed it and
  it printed nothing: `trial_spawn_failed`, with `infraError`, excluded from
  every scored pool, its trial directory removed (B-18, D-062). The ceiling is part of
  the measurement conditions, so a run that moved it MUST be reported with the
  value it used, the way B-9 treats a `--since`-bounded snapshot, and every
  result row records the ceiling its trial ran under (D-018). Residual: a
  refusal that arrives after the agent has already acted — tool calls made,
  output tokens spent — is not distinguished from a completed turn and scores
  as one.
- **B-13 A pool that only failed is flagged, never stood in for.** A
  pool whose rows all carry `infraError` or `gradeError` is never the
  measurement (B-10), and no reader puts another pool's verdict in its place.
  `eval compare` refuses the comparison, naming the arm that has no scored
  trial, and lists the pool as an instrument failure, not a measurement, with
  its row count and run conditions. The dashboard says what `eval list` and
  `eval compare` say: the scenario shows `NO SCORED RUNS` — or its scored
  verdict — with the pool listed as an instrument failure, not a measurement,
  and an A/B view whose arm has no scored trial shows the refusal and its pool
  lines in place of a comparison, never another pool's verdict or a run
  history standing alone (#212, D-048).

### The instrument in 6.5.0
- **B-15 One live eval per checkout, held by a lock (6.5.0).** `eval run`,
  `eval preflight`, `eval ab` and `eval report` take a lock under
  `.eval-trials/` before any fixture `Setup`, session or benchmark write,
  and release it on every exit path — a preflight that ends in BLOCK and
  exits non-zero included. `eval report` takes it because it writes
  `evals/benchmarks/`, a write a live trial's guard would blame on the
  trial. The lock records the holder's process id. A second of those commands
  in the same checkout is refused at once — it does not wait — with a
  message naming the holder's process id and the lock's path. A lock whose
  process no longer exists is reclaimed, not honoured: the run reserves the
  reclaim, and under that reservation removes only the dead lock whose
  `pid` and `started` match what it observed before reserving; anything
  else is refused. A lock file that names no process, or a leftover
  `run.lock.reclaim`, is refused, not reclaimed, until the operator
  removes it by hand; the refusal names the file. The rule exists
  because the write guard (B-7) cannot tell another run's write from a
  trial's, and the lock sits under `.eval-trials/` because the guard does not
  watch that directory (D-058, D-062). Residual: only those four commands
  take the lock, so an operator's edit, or any other write in the checkout,
  during a live run is still reported as the trial's write; the lock is per checkout, so two
  worktrees do not exclude each other; a recycled process id can make a
  dead lock read as held; and a run killed while its trial is running can
  leave the trial's `claude` process alive — the trial is a synchronous
  child the signal does not reach — so the lock is reclaimed when the
  holder's PID is dead, not when the trial is, and the orphan's writes can
  be blamed on the next run's trial.
- **B-16 Preflight writes a result row per trial, apart from every pool
  (6.5.0).** Each preflight trial leaves a result row in its run's directory,
  `evals/results/<scenario>/<runId>/preflight.jsonl` — its grade, its
  assertion results, the conditions it ran under, and any `infraError` or
  `gradeError` — under a condition label of its own, `preflight`, with its
  transcript beside it as `preflight-trial-<n>.txt`. A preflight trial that
  wrote to the repository has its row recorded and the preflight then
  stops, as an A/B arm does (B-7). No reader of pools returns that row: not `eval list`, not the verdict
  `eval run` prints, not `eval compare`, not `eval report`, not the
  dashboard's comparison or scenario views; the dashboard's run listing
  shows preflight rows, labelled as such. So a preflight trial's grade is read from its row, not rebuilt
  from the trial's end state, and a preflight never moves an A/B verdict or
  a benchmark. The record under `evals/preflight/` stays what the `eval ab`
  gate reads (B-2, B-3). Because a row file's name ends in its condition, a
  scenario whose name ends in `-baseline`, `-treatment` or `-preflight` is
  refused before any session and reported by `eval lint`; no shipped
  scenario has such a name (D-062).
- **B-17 Every row names the Node version, the scenario hash and the
  repository commit (6.5.0).** Every result row — A/B, `eval run` and
  preflight, error rows included — and every preflight record carries the
  Node version that ran the engine (`node_version`), the hash of the
  scenario text the run's trials were built from, computed once per run
  (`scenario_hash`), and the commit of the checkout the trials ran from
  (`repo_commit`, null outside a git repository). The raw benchmark export
  carries all three, null for rows written before 6.5.0. None is a pooling
  condition: B-8's conditions are unchanged, a pool is split neither by a
  Node upgrade, nor by a cosmetic edit to a scenario, nor by a new commit,
  and rows written before 6.5.0, which carry none of them, pool as they
  did. The three fields are there so a reader can see that a pool mixes
  them, not so the engine refuses one that does (D-062).
- **B-18 A trial's environment is built, not inherited (6.5.0).** The engine
  starts each contained trial session, and its fixture `Setup`, with an
  environment it builds from an allowlist. A variable is forwarded by name
  (`HOME`, `USER`, `LOGNAME`, `SHELL`, `TERM`, `LANG`, `TZ`, `TMPDIR`,
  `XDG_CONFIG_HOME`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`,
  `CLOUD_ML_REGION`, and the certificate variables `NODE_EXTRA_CA_CERTS`,
  `CURL_CA_BUNDLE`, `REQUESTS_CA_BUNDLE` and
  `NODE_TLS_REJECT_UNAUTHORIZED`), by prefix (`LC_`, `ANTHROPIC_`,
  `CLAUDE_CODE_USE_`, `AWS_`, `GOOGLE_`, `GCLOUD_`, `CLOUDSDK_`,
  `SSL_CERT_`) or by suffix (`_PROXY`, `_proxy`), and `ARCFORGE_HOME` is
  set, redirected as B-7 says. A deny list wins over all three:
  `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_*_MODEL` and
  `ANTHROPIC_SMALL_FAST_MODEL` are dropped — the variables that choose the
  model or change what a `--model` name resolves to — so that the model a
  trial runs is the one `--model` names and the row's `model` records, and
  so are the variables of the Claude Code session an eval was started from
  (`CLAUDECODE`,
  `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SSE_PORT`,
  `CLAUDE_CODE_SESSION_ID`). `docs/guide/eval-system.md` holds the table.
  Everything else the operator's shell exports is dropped. `PATH`
  is built too: a shim directory under `.eval-trials/` holding links to
  `claude`, to `node`, and to the `npm` and `npx` beside it, followed by the
  system directories `/usr/bin`, `/bin`, `/usr/sbin` and `/sbin`. So
  `claude` and `node` resolve, and the entries of the operator's own
  `PATH` do not carry over — not even the directory `claude` is installed
  in, which can hold other tools — so a tool the operator happens to have
  installed — `arcforge` included — is not something a trial can run unless
  the scenario says so. The session itself is not looked up on that `PATH`:
  a contained trial spawns `claude` by the shim's full path,
  `<projectRoot>/.eval-trials/.bin/claude`, so a directory the scenario
  prepends with `PATH^=`, or a `claude` its fixture `Setup` writes there,
  stays on the session's `PATH` and cannot run in the session's place.
  Fixture `Setup` keeps the declared `PATH`. A `--no-isolate` trial is the
  exception: it measures
  the operator's own toolkit (B-7), so it inherits the operator's
  environment, with `ARCFORGE_HOME` redirected and the scenario's
  `## Environment` directives applied, and its session is the bare `claude`
  the operator's `PATH` resolves. A scenario makes its
  statement in an `## Environment` section, which adds to the built `PATH`:
  it may append `PATH` entries, prepend them, remove them, and point cache
  directories — a package manager's, a browser download's, from a fixed
  list of cache variables — at a place under `${TRIAL_DIR}`. Nothing else
  can be declared: `HOME` and a whole-`PATH` assignment are refused, `HOME`
  because the session authenticates from `~/.claude`. The guide,
  `docs/guide/eval-system.md`, holds the full grammar. A line holding a
  control character — a NUL among them — is refused: `eval lint` reports
  it, and a trial refuses it before the fixture exists. The declaration
  applies to both arms alike, since the arms differ in the injection only
  (B-7); `eval lint` checks its form; and every row records it. A session
  that never started — the exec fails with no exit status, nothing killed
  it and it printed nothing, as when there is no `claude` to run or Node
  refuses to pass the environment on — is an instrument failure of its own
  kind, `trial_spawn_failed`: its row carries `infraError: true`, it is
  excluded from every scored pool exactly like `trial_killed_incomplete`
  (B-10) and `trial_wrote_repo` (B-7), and its trial directory is removed.
  Toolkit
  state stays redirected as B-7 says (D-057, D-062). Residual: this is not
  a sandbox. A trial still runs with the operator's filesystem permissions
  and `HOME`, and a cache no scenario redirected is still the operator's,
  shared from one trial to the next. The deny list is a list of names and
  one pattern, so a new provider variable that remaps a model name is
  forwarded by its family's prefix until it is added. Because `HOME` is kept, Claude
  Code
  still sources the operator's shell startup file (`~/.zshrc` or
  `~/.bashrc`) when it builds its shell snapshot, so the operator's shell
  functions and aliases still reach the commands a trial runs; the built
  environment does not change that. A startup file that itself changes
  `PATH` may put the operator's directories back in front of those
  commands, and no engine test establishes whether it does, so the built
  `PATH` is a statement about what the engine passes, not a proof of what a
  trial's shell resolves: a measurement that depends on a tool being absent
  shows the absence inside a real trial, in its design gate, before it
  spends a session. A code grader runs on the engine's side with the
  operator's full environment — seven graders in the corpus call
  `arcforge` and nine call `npm` — so this item bounds the trial, not the
  grader. And a scenario that prepends a directory of its own can shadow
  the `claude` a trial's own commands look up by name — not the session,
  which is spawned by path — an authoring error `eval lint` does not catch.
  A `claude` that starts, exits non-zero and prints nothing parseable is
  not a spawn failure: it is still scored as a behavioural `error` row, as
  it was before 6.5.0. The
  environment is not a pooling
  condition, so rows from before and after this change pool together though
  their trials did not see the same `PATH`.
- **B-19 A skill's files can be staged for the arm injected with it
  (6.5.0).** By default a skill-scope A/B injects the text of the skill's
  `SKILL.md` and nothing else (B-1). With `--stage-skill-files`, `eval ab`
  copies the directory that skill file sits in to a temporary directory
  outside the trial tree and opens the injection with a line in the host's
  own form, "Base directory for this skill:" followed by the copy's path, so
  the injected arm reaches the skill's scripts and references the way a
  session with the skill loaded would. The files are part of the injection:
  an arm injected with nothing gets no staged directory and cannot list one
  from inside its trial. The trial's instruction to stay inside its own
  directory names the staged directory as its one exception, and the copy
  is removed when the run ends. Staging is a run condition that pools (B-8):
  a run without the flag records none and pools with rows written before
  6.5.0, and a run with it forms a pool of its own (D-049, D-057, D-062).
  Residual: nothing but the write guard and the advice in the prompt keeps
  an arm away from a directory it was not given.
- **B-20 An A/B can compare two skill texts (6.5.0).**
  `eval ab --baseline-skill-file <path>` injects the baseline with that
  file's text where it otherwise gets none, so the arms differ in which text
  each was given — the comparison that isolates an edit to a skill, where
  text against no text measures the skill as a whole (B-1). With
  `--stage-skill-files` each arm gets a staged directory and a
  base-directory line of its own (B-19), the baseline's taken from the
  directory its file sits in. Every row records a hash of the text its arm
  was injected with and, for a staged arm, a digest of the directory
  staged for it. The baseline's text, and its staged files' digest when it
  is staged, are run conditions that pool
  (B-8): a two-text run's rows form a pool of their own per baseline text
  and per baseline staged content, and are never combined with a run whose baseline was given no text, and a
  run without the flag pools as before. `eval preflight` takes the same
  flag, and `--stage-skill-files` with it, and runs the baseline the A/B
  will run; its record is keyed on the baseline text's hash and, when the
  baseline is staged, on its staged files' digest, on top of B-3's
  conditions, so `eval ab` is refused until a preflight exists for that
  baseline (D-057, D-062). Residual: the treatment's text hash is recorded
  but, as before 6.5.0, is not a pooling condition, so a skill edited and
  re-measured under an unchanged scenario version joins the earlier
  treatment pool. When both arms are given one text and differ only in
  their staged files, the text hashes do not tell the arms apart, so the
  baseline's staged content is part of the pool's identity and of the
  preflight key: a preflight record is not found by a run whose baseline
  was staged with different files, and the rows of two such runs do not
  pool. The treatment's digest is recorded, not pooled, like its text
  hash (D-059, D-062).
- **B-21 `eval compare` can skip the analyzer (6.5.0).** On a model- or
  human-graded scenario `eval compare` computes the verdict and then starts
  an eval-analyzer session for a qualitative reading. With `--no-analyzer`
  it starts no analyzer session and prints one line saying the analyzer was
  skipped where the analyzer's banner would have been, so an operator can
  tell a skipped analyzer from a code-graded scenario, which prints
  neither; the delta, the interval and the verdict
  print as they would have, since they come from the rows alone (B-4). On a
  code-graded scenario, which never starts the analyzer, the flag changes
  nothing (D-062).

### Benchmarks
- **B-9 Snapshots keep history and gate releases.** `eval report` writes
  `latest.json`, overwritten each time, plus a date-stamped copy under
  `evals/benchmarks/`, and the per-trial export under `evals/benchmarks/raw/`
  under the same name as its aggregate. A copy is never overwritten: each
  report takes the first of `YYYY-MM-DD.json`, `YYYY-MM-DD-2.json`,
  `YYYY-MM-DD-3.json`, … not yet used for its date, for the aggregate and the
  raw export together, and creates it exclusively, so two concurrent reports
  never share a name. `eval history` lists every file named for a date, alone
  or followed by `-` and any suffix — a hand-kept `2026-10-01-v6.1.1.json`
  included — oldest first by the instant its `generated` field records, since
  names do not sort in that order. A listed file that is not a snapshot with an
  ISO 8601 `generated` carrying `Z` or an offset fails the command, naming the
  file (#242, D-048). A release
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
`errorType: trial_killed_incomplete` and `infraError: true`, and from 6.5.0 one
whose session never started carries `errorType: trial_spawn_failed` and the same
flag (B-18) —
`scripts/lib/eval-trial-outcome.js` owns the four predicates (killed, output
complete, provider refusal, spawn failure) — and `scorableResults` in `eval-stats.js` drops every `infraError` /
`gradeError` row from every scored pool (`eval run`, A/B, benchmark), while
preflight fails closed on the same flags (B-10). Every result row records
`trialTimeoutMs`, the ceiling its trial ran under, so a pool that mixes ceilings
can be seen from its rows. From 6.5.0 a row also records the Node version, the repository commit, the
scenario hash, the scenario's declared trial environment, whether skill files were
staged, a hash of the text its arm was injected with, and a digest of the files
staged for its arm (`skillFilesHash`) (B-17 to B-20). Of those,
only staging, the baseline's text and the baseline's staged files' digest are
pool conditions, and
`scripts/lib/eval-pools.js` owns the list of fields that are.

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
- **D-025** — `claude plugin eval` measures routing only and stays out of the
  release gate (B-9, B-11).
- **D-026** — the ledger records answering-feedback's REGRESSED, and the cost
  flag is informational for an injected treatment (B-4).
- **D-027** — floor assertions keep the weight the engine gives them today,
  written down before 6.1.1's results are read (B-5).
- **D-045** — the four ceiling BLOCKs of 6.1.1's round are findings about the
  scenarios, not the skills; those skills keep their pre-repair evidence (B-3).
- **D-047** — 6.2.0's round: the supersede scenario's ceiling BLOCK is a
  finding about the scenario, and the no-bootstrap scenario measured after its
  one pre-registered redesign (B-3, B-8).
- **D-054** — 6.3.0's round: a preflight PASS goes to an A/B only when the
  assertions that earned it measure the behavior under test, and a scenario
  whose recorded baselines already do the behavior is a finding without a
  session — both read B-3's ceiling, neither changes the gate (B-3).
- **D-020** — 6.2.0 carries the scenario rubric fixes with their own
  measurement round (B-8).
- **D-043** — graders never execute trial output (B-6, B-7, B-8, B-12).
- **D-048** — 6.2.1 makes same-day snapshots additive and shows a failed pool
  on the dashboard, with no live session spent (B-9, B-13).
- **D-055** — 6.4.0 runs code graders from an empty directory, so a trial's
  modules are never importable (#250), and its round
  measures the `diagramming-obsidian` verify-exit sentence only if a scenario
  can make the arms differ (B-3, B-12, B-14).
- **D-057** — that sentence is not measurable on the current engine, which
  injects `SKILL.md` alone, overrides no trial's `PATH` or `HOME`, and has no
  two-skill-text A/B, so it is a finding at 0 sessions (B-1, B-7) — the
  three limits it names are lifted in 6.5.0 by B-18, B-19 and B-20
  (D-062).
- **D-058** — 6.4.0's round: the write guard cannot tell another run's write
  from a trial's, so one checkout runs one live eval at a time (B-7).
- **D-059** — 6.5.0's round puts four measurements each behind an offline
  design gate and runs them one at a time, the router scenario not among
  them (B-3, B-15).
- **D-062** — 6.5.0's instrument: the run lock, preflight rows, the Node
  version, scenario hash and repository commit on every row, a built trial
  environment a
  scenario can declare, staged skill files, a two-text A/B, and a compare
  that can skip the analyzer (B-8, B-15 to B-21).
