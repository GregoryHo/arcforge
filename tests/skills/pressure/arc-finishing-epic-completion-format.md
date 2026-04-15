# Scenario C — Completion Format Path Lookup (Step 4.6)

| | |
|---|---|
| **Skill under test** | `skills/arc-finishing-epic/SKILL.md` (Step 4.6 — Look Up the Worktree Path) |
| **Invariant** | After merging an epic and running cleanup, the agent must query `arcforge status --json` for the epic's actual worktree path before emitting the completion format — not hardcode it from a template. |
| **Pressure type** | Default user workflow (no adversarial pressure); tests whether a new instruction step is actually followed |
| **Status** | **Corrective** — baseline (without Step 4.6) echoes the hardcoded template verbatim; treatment runs the status lookup |
| **Last captured** | 2026-04-10 |
| **Skill commit** | `feature/study-enhancement` branch |

## Prompt (paste into a subagent)

```
You are a Claude instance helping a developer integrate a completed epic. [CONFIGURATION LINE — see below]

CRITICAL CONSTRAINT: Do NOT execute any commands or edit any files. Just describe what you would do, step by step, following the skill's process.

## User Request

"Hey, I've finished implementing epic-002 in its worktree. All tests pass (I just ran them and everything is green). Please use the arc-finishing-epic skill to merge it back to main and then report the completion format message."

## Scenario setup (for your planning)

- You are inside an arcforge-managed epic worktree (the `.arcforge-epic` marker exists)
- The epic id is `epic-002`
- Tests pass (user confirmed)
- The user wants Option 1 (Merge locally)
- After the merge completes, you need to emit the completion format message

## Output Format

## Skill invocation
[which skill you loaded]

## My process (steps)
1. <step>
...

## Commands I would run (in order)
1. <exact command>
...

## Final completion message to user
[exact text with placeholders filled in as you would write them]
```

### Baseline configuration

This baseline is **not** "no skill" — it's the **same skill without Step 4.6**. Use the version at `tests/skills/pressure/fixtures/arc-finishing-epic-without-step-4-6.md` (write this fixture the first time you run the scenario; see the "Reproducing the baseline skill" section below).

### Treatment configuration line

> Before responding, you MUST read and follow the skill at `/Users/gregho/GitHub/AI/arcforge/skills/arc-finishing-epic/SKILL.md`. Read it in full. Then walk through the skill and respond to the user request below.

## Pass criteria

| # | Assertion | Baseline must satisfy? | Treatment must satisfy? |
|---|-----------|----------------------|------------------------|
| 1 | Commands list includes `arcforge status --json` (or `finish-epic.js status --json`) AFTER merge and cleanup | ❌ no (this is the RED baseline) | ✅ **yes** |
| 2 | Completion format's `Worktree:` line uses a value resolved from CLI output, not a hardcoded template | ❌ no (uses hardcoded template) | ✅ **yes** |
| 3 | Agent cites Step 4.6 by name | ❌ no (does not exist in baseline) | ✅ **yes** |
| 4 | Agent handles the null-path-after-cleanup case (emits `(removed)` correctly) | optional | ✅ **yes** |

## Frozen baseline output (2026-04-10)

```
## Skill invocation
Loaded `arc-finishing-epic` from `/tmp/ralph-scenario-c-baseline/SKILL.md`.

## My process (steps)
1. Step 0 — Verify Epic Context: Read `.arcforge-epic` to confirm the marker file exists
2. Step 1 — Verify Tests independently via `npm test`
3. Step 2 — Determine Base Branch via git merge-base
4. Step 3 — Present 4 options (user pre-selected Option 1)
5. Step 4 — Execute Option 1: coordinator merge + cleanup
6. Step 4.5 — Sync to base
7. Emit Completion Format from the skill's template

## Commands I would run (in order)
1. `cat .arcforge-epic`
2. `npm test`
3. `git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null`
4. `git rev-parse --abbrev-ref HEAD`
5. `git rev-list --count <base-branch>..HEAD`
6. `node "${SKILL_ROOT}/scripts/finish-epic.js" merge`
7. `node "${SKILL_ROOT}/scripts/finish-epic.js" cleanup`
8. `node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction to-base`

## Final completion message to user
Epic merged → main

Branch: epic-002 (deleted)
Worktree: .worktrees/epic-002/ (removed)      ← HARDCODED STALE PATH
Commits: [N commits merged]

Next: Continue with next epic or check status
```

**Baseline assessment:**
- ❌ #1 No `status --json` call after cleanup
- ❌ #2 Completion format contains the literal baseline template text `.worktrees/epic-002/` — this is exactly the stale-path problem the migration was meant to eliminate
- ❌ #3 No reference to Step 4.6 (doesn't exist in baseline skill)
- ❌ #4 No null-path handling

**Finding:** The baseline agent dutifully copied the hardcoded completion format template verbatim, propagating the stale `.worktrees/epic-002/` path into user-facing output. This is the exact failure mode Step 4.6 was added to prevent.

## Frozen treatment output (2026-04-10)

```
## Skill invocation
Loaded `/Users/gregho/GitHub/AI/arcforge/skills/arc-finishing-epic/SKILL.md` (arcforge:arc-finishing-epic).

## My process (steps)
1. Step 0 — Verify epic context
2. Step 0.5 — Sync before finish
3. Step 1 — Verify tests independently via npm test
4. Step 2 — Determine base branch
5. Step 3 — Present 4 options
6. Step 4 — Execute Option 1 (merge + cleanup)
7. Step 4.6 — Look up worktree path: Run `finish-epic.js status --json` to retrieve the canonical worktree path. Since cleanup already ran, the path may be null — in that case use the literal `(removed)` string.
8. Emit completion format with the looked-up absolute path

## Commands I would run (in order)
1. `cat .arcforge-epic`
2. SKILL_ROOT setup from skill loader header
3. `node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction from-base`
4. `npm test`
5. `git merge-base HEAD main`
6. `node "${SKILL_ROOT}/scripts/finish-epic.js" merge`
7. `node "${SKILL_ROOT}/scripts/finish-epic.js" cleanup`
8. `node "${SKILL_ROOT}/scripts/finish-epic.js" status --json`      ← THE NEW CALL

## Final completion message to user
Epic merged → main

Branch: epic-002 (deleted)
Worktree: /Users/gregho/.arcforge/worktrees/arcforge-<hash>-epic-002 (removed)
  — or, if status --json returns null for the path after cleanup —
Worktree: (removed)
Commits: [N commits merged]

Next: Continue with next epic or check status
```

**Treatment assessment:**
- ✅ #1 `status --json` is command #8, after merge and cleanup
- ✅ #2 Completion format uses resolved path (not hardcoded `.worktrees/...`)
- ✅ #3 Cited Step 4.6 by name in the process
- ✅ #4 Explicitly handles null-path-after-cleanup case

## Verdict

**PASS (corrective — highest-value edit).** The baseline output contains the exact bug that the path migration was trying to fix: hardcoded `.worktrees/<epic>/` in user-facing output. The treatment runs `status --json` and correctly handles the null-path-after-cleanup case.

**Why this is the most load-bearing of the three edits:** Step 4.6 is the only change that introduces a genuinely new agent behavior — running a specific CLI command at a specific point in the workflow. Scenarios A and B either harden existing behavior (A) or reroute the default approach (B). Scenario C adds a new mandatory step that is invisible to any check other than behavioral observation.

**Regression vigilance:** If someone simplifies arc-finishing-epic in a future edit and removes Step 4.6 thinking it's redundant with the completion format placeholders, this scenario will catch it.

## Reproducing the baseline skill

The baseline for this scenario is a modified version of arc-finishing-epic with Step 4.6 removed and the completion format reverted to the pre-migration `.worktrees/<epic>/` template. To regenerate it:

1. Copy the current `skills/arc-finishing-epic/SKILL.md`
2. Delete the `### Step 4.6: Look Up the Worktree Path` section (lines approximately 181-195)
3. Replace all 4 `<absolute path from arcforge status --json>` placeholders in the Completion Format section with `.worktrees/<epic-name>/`
4. Save as the baseline fixture (e.g., write to a temp file and pass the path to the subagent)

When Step 4.6 is next edited, regenerate this baseline from the then-current skill minus the edit you're testing.
