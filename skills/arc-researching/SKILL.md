---
name: arc-researching
description: Optimize a measurable metric through autonomous hypothesis-driven experimentation. Use when a target has a numeric signal — build times, algorithm efficiency, prompt quality, model performance — and you want iterative measured gains.
category: discipline
status: promoted
---

# arc-researching

Autonomous iterative research: define a measurable optimization target, establish a baseline, then run a hypothesis-driven experiment loop until interrupted.

**Core principle:** "Fixed judge + free player" — the evaluation method is immutable (the judge), while the implementation is free to change (the player). Locking what you measure prevents moving goalposts during optimization.

## When to Use

- Have a measurable metric? **No** → define metric first
- Have a metric + structured task list? → **arc-looping** (DAG tasks across sessions)
- Have a metric + free-form iteration? → **arc-researching** (hypothesis loop, single session)
- Have a metric + known solution? → **arc-implementing** (structured plan)

## Iron Laws

1. **NEVER modify files outside the declared scope** — the research contract defines what you CAN and CANNOT touch
2. **NEVER modify the evaluation method** — it is the fixed judge. If the eval is wrong, stop and tell the human.
3. **NEVER stop mid-loop to ask the human** — you are autonomous. Make decisions, log them, keep going.
4. **ALWAYS reset on failure or regression** — no half-committed experiments. `git reset --hard HEAD~1` immediately.
5. **ALWAYS log every experiment to results.tsv** — even crashes, even reverts. The record must be complete.
6. **ALWAYS establish baseline before experimenting** — you need a reference point to measure improvement.

## The Process

### Phase 1: Build Research Contract (Interactive)

Agent proposes, human reacts, refine iteratively, then lock.

1. **Analyze target** — read files, understand structure, identify what's measurable, note existing tests/build scripts/benchmarks.
2. **Propose draft contract** — present a complete draft `research-config.md` covering all six sections in one AskUserQuestion, with sensible defaults based on what you found.
3. **Refine with human** — adjust section by section; clarify scope boundaries (CAN/CANNOT), metric direction, timeout budget.
4. **Lock the contract** — write `research-config.md` to disk, get final confirmation. After lock the contract is **immutable**.

Write the config using the six-section template in `references/research-config-template.md` (keep the `## Goal` field names — the dashboard parses them).

#### Choosing Trial Count

| Judge Type | Signal Stability | Recommended Trials |
|------------|-----------------|-------------------|
| Deterministic (build time, algorithm) | Stable ±2% | `1` |
| Semi-stochastic (E2E tests, flaky metrics) | Varies ±10% | `3` |
| Stochastic (LLM-graded eval, model behavior) | Varies ±30% | `5` with median |

The contract author decides at lock time, not the loop at runtime. If Trials is omitted from an existing contract, default to `1`.

### Phase 2: Establish Baseline

1. Create a research branch: `git checkout -b research/{tag}`
2. Run the evaluation command from the contract
3. If the baseline crashes or produces no metric, STOP. Tell the human to fix the evaluation environment. Do not debug infrastructure — it is outside scope.
4. Extract the baseline metric value
5. Log baseline to `results.tsv` with status `baseline` — do NOT commit results.tsv (keep it untracked so experiment history survives resets)
6. Start the dashboard (run in the background; do not block on this step):

   ```bash
   : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
   node "${ARCFORGE_ROOT}/scripts/cli.js" research dashboard --results results.tsv --config research-config.md
   ```
7. Tell the human: "Dashboard running at http://localhost:3000 — monitor progress there."
8. Commit the baseline state (but NOT results.tsv)

### Phase 3: Experiment Loop (Autonomous)

The heart of the skill. **NEVER STOP** — run until interrupted or the contract's stop condition is met.

```
LOOP (until stop condition):
  1. READ STATE    — git log, results.tsv, research-config.md
  2. HYPOTHESIZE   — pick a direction based on results so far
  3. PREDICT       — record predicted direction + rough magnitude in the run log BEFORE running (pre-registration)
  4. IMPLEMENT     — modify files within declared scope only
  5. COMMIT        — git commit with descriptive message
  6. RUN           — execute command `trials` times → run-1.log, run-2.log, ... (never tee or raw stdout)
  7. EXTRACT       — grep metric from each log, compute aggregation (median/mean)
  8. DECIDE        — aggregated value improved? keep. Same/worse? revert. Crash? log + revert.
  9. LOG           — append row to results.tsv (every experiment, no exceptions)
  10. ANALYZE      — 3+ failures in same direction? change direction entirely
```

#### Pre-Registration (PREDICT)

Before running, commit to a prediction — direction (improve/regress) and rough magnitude (e.g., "−5% build time") — in the run log or as the results.tsv `description` you complete at LOG. **No run until the prediction is recorded.** A result that contradicts your prediction is a signal to audit the measurement, not just a number to log.

#### Decision Rules

| Outcome | Action | Git | results.tsv Status |
|---------|--------|-----|--------------------|
| Metric improved | Keep the change | Keep commit | `keep` |
| Metric same or worse | Discard the change | `git reset --hard HEAD~1` | `discard` |
| Command crashed/timed out | Log and discard | `git reset --hard HEAD~1` | `crash` |

#### Measurement Audit (required for surprising wins)

Before recording a *surprising* win as `keep` — one that beats your prediction or looks too good — manually compare a sample of raw `run-N.log` lines against the extraction/grep pattern. Confirm it matches real metric output (not an echoed template line counted as a hit) and is not over- or under-counting.

If the audit shows the number was a measurement artifact, don't silently fix it: mark the original row `retracted` (kept as the audit trail) and log the corrected re-run as `remeasured`.

#### Stuck Protocol

If **3+ consecutive experiments** fail in the same direction (e.g., all trying to reduce allocations):
1. Stop that line of investigation entirely
2. Read all results and identify untried approaches
3. Research the domain knowledge you're missing — read docs for the target's tools/libraries, search the web for optimization techniques, check the Strategy section's research sources and similar reference implementations
4. Choose a fundamentally different direction informed by that research
5. If all major directions are exhausted, try combining previously successful changes — or try removing code instead of adding it; simplification often unlocks performance

#### Crash/Timeout Handling

Two types of crashes — handle differently:

- **Dumb bug** (typo, missing import, syntax error, off-by-one): fix in-place without reverting and re-run the same experiment. The hypothesis is fine; the implementation had a bug.
- **Fundamentally broken idea** (OOM, doesn't converge, wrong approach): log as `crash` with the error in description, `git reset --hard HEAD~1`, move to the next hypothesis.

**Timeout:** if the run exceeds the timeout, kill it and treat as a fundamentally broken idea. Never count crashes toward the "3 failures → change direction" rule — crashes indicate broken code, not a bad hypothesis.

#### Context Discipline

Long-running research burns context. Protect it:
- **Redirect output:** `command > run.log 2>&1` — never `tee`, never raw stdout
- **Extract, don't read:** `grep "metric_pattern" run.log` — never `cat run.log`
- **Tail on crash only:** `tail -n 50 run.log` — read stack traces, not full logs
- **Keep results.tsv and research-config.md as your memory** — re-read them each iteration instead of relying on conversation context

### Phase 4: Report

When the loop ends (interrupted, target reached, or max iterations): read all results, summarize (baseline value, best value, improvement %, total experiments, keep/discard/crash counts), list the top 3 most impactful kept experiments, report whether any target was achieved, and give the final commit hash and branch name.

## results.tsv Format

Tab-separated values with header row:

```
commit	metric_value	status	description
a1b2c3d	0.997	baseline	Initial baseline measurement
b2c3d4e	0.891	keep	Reduced learning rate by 50%
c3d4e5f	0.912	discard	Added dropout layer 0.3 — regression from 0.891
d4e5f6g	NaN	crash	Segfault in custom allocator — timeout after 300s
e5f6g7h	0.260	retracted	Suspicious -74% win — audit found grep counted template echo, not hits
f6g7h8i	0.590	remeasured	Honest re-run of e5f6g7h — real result -41%
```

- **commit**: Short git hash (7 chars)
- **metric_value**: Numeric value, or `NaN` for crashes
- **status**: One of `baseline`, `keep`, `discard`, `crash`, `retracted`, `remeasured`
- **description**: What was tried and why it was kept/discarded

**Git status:** Keep results.tsv untracked. If committed, `git reset` after failed experiments will erase the log. The TSV is your persistent memory — it must survive resets.

## Resume Protocol

If interrupted and resuming in a new session:
1. `research-config.md` exists → contract is already locked (skip Phase 1)
2. Read `results.tsv` → understand all prior experiments
3. Read `git log` → understand current code state
4. Confirm the current branch starts with `research/`
5. Continue Phase 3 from current state (do not redo Phase 1 or 2)

## Red Flags

**Never:** modify the evaluation command or metric extraction during the loop; skip logging an experiment; continue after 5+ consecutive crashes (something is fundamentally broken — stop and report); modify files outside declared scope; ask the human questions during the loop.

**If results are suspicious:** run the Measurement Audit (above), check whether external factors (network, disk, other processes) affect the metric, and if variance is higher than expected, increase Trials (requires human approval to unlock and re-lock).

## Common Rationalizations

| Rationalization | What to Do Instead |
|----------------|-------------------|
| "The eval has a bug, let me fix it" | You're the player, not the judge. Stop and tell the human. |
| "The metric barely regressed, I'll keep it" | Binary rule: improved or not. Revert. |
| "I should ask the human about this" | You are autonomous. Decide, log reasoning, keep going. |

## Completion Format

```
✓ RESEARCH COMPLETE
  Target: {target name}
  Baseline: {baseline value}
  Best: {best value} ({improvement}% {direction})
  Experiments: {total} ({kept} kept, {discarded} discarded, {crashed} crashed)
  Branch: research/{tag}
  Best commit: {hash}
```

## Blocked Format

```
✗ RESEARCH BLOCKED
  Reason: {why the loop cannot continue}
  Last experiment: {commit hash}
  Suggestion: {what the human should investigate}
```

## Integration

**Before:** arc-brainstorming → identify measurable targets. **During:** `arc research dashboard` for live monitoring. **After:** review the `research/{tag}` branch, cherry-pick or merge to main, run project tests.
