---
name: arc-researching
description: Use when optimizing any measurable metric through autonomous hypothesis-driven experimentation — build times, algorithm efficiency, prompt quality, model performance, or any target with a numeric signal
---

# arc-researching

Autonomous iterative research: define a measurable optimization target, establish a baseline, then run a hypothesis-driven experiment loop until interrupted.

**Core principle:** "Fixed judge + free player" — the evaluation method is immutable (the judge), while the implementation is free to change (the player). By locking what you measure, you prevent moving goalposts during optimization.

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

**Step 1: Analyze Target**
- Read files, understand the project structure
- Identify what's measurable and what the human likely wants to optimize
- Note existing tests, build scripts, benchmarks

**Step 2: Propose Draft Contract**
- Present a complete draft `research-config.md` covering all 6 sections (below)
- Use one AskUserQuestion with the full proposal
- Include sensible defaults based on what you found

**Step 3: Refine with Human**
- Based on human feedback, adjust section by section
- Clarify scope boundaries (CAN/CANNOT), metric direction, timeout budget
- Ask follow-up questions only if critical information is missing

**Step 4: Lock the Contract**
- Write `research-config.md` to disk
- Get final confirmation from the human
- After lock: the contract is **immutable**. Do not modify it during experiments.

#### research-config.md Template

```markdown
# Research Config: {target}

## Scope
CAN modify: {files/dirs the agent may change}
CANNOT modify: {files/dirs that are off-limits}

## Goal
Metric: {name, e.g., "build_time_seconds", "val_bpb"}
Direction: {lower-is-better | higher-is-better}
Target: {optional, e.g., "< 30s" or "none"}

## Strategy
Hypothesis playbook: {domain-specific approaches, ordered by likelihood}
Research sources: {docs URLs, reference implementations, config files}
First moves: {2-3 concrete experiments after baseline}

## Evaluation
Run command: {exact shell command, e.g., "npm run build 2>&1"}
Extract metric: {grep pattern, e.g., "grep -oP 'Time: \K[\d.]+' build.log"}
Timeout: {seconds per experiment}
Trials: {1 | 3 | 5 — runs per experiment; default 1 if omitted}
Aggregation: {median | mean — default median}

## Constraints
{secondary considerations, e.g., "keep memory under 4GB"}

## Autonomy
Mode: {run-until-interrupted | run-N-times | run-until-target}

## Simplicity Criterion
{Prefer simpler code when results are similar. Removing code for equal results is a win. "0.1% + 20 hacky lines? No." "0.1% from deleting code? Yes." "No improvement but simpler? Keep."}
```

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
6. Start the dashboard: `node scripts/cli.js research dashboard --results results.tsv --config research-config.md`
7. Tell the human: "Dashboard running at http://localhost:3000 — monitor progress there."
8. Commit the baseline state (but NOT results.tsv)

### Phase 3: Experiment Loop (Autonomous)

This is the heart of the skill. **NEVER STOP** — run until interrupted or the stop condition from the contract is met.

```
LOOP (until stop condition):
  1. READ STATE    — git log, results.tsv, research-config.md
  2. HYPOTHESIZE   — pick a direction based on results so far
  3. IMPLEMENT     — modify files within declared scope only
  4. COMMIT        — git commit with descriptive message
  5. RUN           — execute command `trials` times → run-1.log, run-2.log, ... (never tee or raw stdout)
  6. EXTRACT       — grep metric from each log, compute aggregation (median/mean)
  7. DECIDE        — aggregated value improved? keep. Same/worse? revert. Crash? log + revert.
  8. LOG           — append row to results.tsv (every experiment, no exceptions)
  9. ANALYZE       — 3+ failures in same direction? change direction entirely
```

#### Decision Rules

| Outcome | Action | Git | results.tsv Status |
|---------|--------|-----|--------------------|
| Metric improved | Keep the change | Keep commit | `keep` |
| Metric same or worse | Discard the change | `git reset --hard HEAD~1` | `discard` |
| Command crashed/timed out | Log and discard | `git reset --hard HEAD~1` | `crash` |

#### Stuck Protocol

If **3 or more consecutive experiments** fail in the same direction (e.g., all trying to reduce allocations):
1. Stop that line of investigation entirely
2. Read all results so far and identify untried approaches
3. Research — search for domain knowledge you don't have yet:
   - Read documentation for tools/libraries in the target files
   - WebSearch for optimization techniques in this domain
   - Check the Strategy section's research sources for unexplored leads
   - Look at similar projects or reference implementations for patterns
4. Choose a fundamentally different direction informed by your research
5. If all major directions exhausted, try combinations of previously successful changes

**Idea generation when stuck:**
- Re-read the target files for angles you missed on first read
- Search docs/web for domain-specific techniques you haven't tried
- Read the Strategy section's research sources for unexplored leads
- Try combining two previously successful changes
- Try the opposite of your last 3 failed approaches
- Try removing code instead of adding it — simplification often unlocks performance

#### Crash/Timeout Handling

Two types of crashes — handle differently:

**Dumb bug** (typo, missing import, syntax error, off-by-one):
- Fix the bug in-place without reverting
- Re-run the same experiment
- The hypothesis is fine; the implementation had a bug

**Fundamentally broken idea** (OOM, algorithm doesn't converge, approach is wrong):
- Log as `crash` with the error in description
- Reset the commit: `git reset --hard HEAD~1`
- Move on to the next hypothesis

**Timeout:** If the run exceeds the timeout, kill it and treat as a fundamentally broken idea.

Never count crashes toward the "3 failures → change direction" rule — crashes indicate broken code, not a bad hypothesis.

#### Context Discipline

Long-running research burns context. Protect it:
- **Redirect output:** `command > run.log 2>&1` — never `tee`, never raw stdout
- **Extract, don't read:** `grep "metric_pattern" run.log` — never `cat run.log`
- **Tail on crash only:** `tail -n 50 run.log` — read stack traces, not full logs
- **Keep results.tsv and research-config.md as your memory** — re-read them each iteration instead of relying on conversation context

### Phase 4: Report

When the loop ends (interrupted, target reached, or max iterations):
1. Read all results from `results.tsv`
2. Summarize: baseline value, best value, improvement %, total experiments, keep/discard/crash counts
3. List the top 3 most impactful kept experiments
4. If target was set: report whether it was achieved
5. Provide the final commit hash and branch name

## results.tsv Format

Tab-separated values with header row:

```
commit	metric_value	status	description
a1b2c3d	0.997	baseline	Initial baseline measurement
b2c3d4e	0.891	keep	Reduced learning rate by 50%
c3d4e5f	0.912	discard	Added dropout layer 0.3 — regression from 0.891
d4e5f6g	NaN	crash	Segfault in custom allocator — timeout after 300s
```

- **commit**: Short git hash (7 chars)
- **metric_value**: Numeric value, or `NaN` for crashes
- **status**: One of `baseline`, `keep`, `discard`, `crash`
- **description**: What was tried and why it was kept/discarded

**Git status:** Keep results.tsv untracked. If committed, `git reset` after failed experiments will erase the log. The TSV is your persistent memory — it must survive resets.

## Resume Protocol

If the agent is interrupted and resumes in a new session:

1. Check for existing `research-config.md` → if exists, contract is already locked (skip Phase 1)
2. Read `results.tsv` → understand all prior experiments
3. Read `git log` → understand current code state
4. Check current branch starts with `research/` → confirm research context
5. Continue Phase 3 from current state (do not redo Phase 1 or 2)

## Red Flags

**Never:**
- Modify the evaluation command or metric extraction during the loop
- Skip logging an experiment (even crashes)
- Continue after 5+ consecutive crashes (something is fundamentally broken — stop and report)
- Modify files outside the declared scope
- Ask the human questions during the experiment loop

**If results are suspicious:**
1. Check if the metric extraction pattern matches correctly
2. Check if external factors (network, disk, other processes) affect the metric
3. If variance is higher than expected, increase Trials in the contract (requires human approval to unlock and re-lock)

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

**Before:** arc-brainstorming → explore what to optimize and identify measurable targets
**During:** `arc research dashboard` for live monitoring
**After:** Review `research/{tag}` branch, cherry-pick or merge to main, run project tests
