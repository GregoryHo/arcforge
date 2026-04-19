---
name: arc-finishing-epic
description: Use when epic implementation in a worktree is complete (.arcforge-epic file exists), all tests pass, and you need to decide how to integrate
---

# arc-finishing-epic

## Overview

Guide completion of epic work in a worktree by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Read epic metadata → Present options → Execute choice → Clean up.

**REQUIRED BACKGROUND:** You MUST use verification mindset. See `arc-verifying`.

**Use ONLY when** `.arcforge-epic` file exists in the worktree. Otherwise → use `arc-finishing`.

## The Process

### Step 0: Verify Epic Context

```bash
# Must be in a worktree with .arcforge-epic
cat .arcforge-epic
```

**If `.arcforge-epic` is missing or empty:** Use blocked format and STOP.

### Step 0.5: Sync Before Finish

```bash
# Set SKILL_ROOT from skill loader header, then sync
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-finishing-epic}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction from-base
```

**Purpose:** Verify no dependency changes since last sync. If dependencies changed (e.g., a blocking epic was reverted), the synced section will reflect this.

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Auto-detect test command from project files
if [ -f package.json ]; then
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ] || [ -f setup.py ]; then
  pytest
elif [ -f go.mod ]; then
  go test ./...
else
  echo "No test command detected. Specify manually."
fi
```

**If tests fail:** Use blocked format and STOP. Do NOT offer options.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3: Present Options

Present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 4: Execute Choice

#### Option 1: Merge Locally

**Use coordinator merge (NOT git merge directly):**

```bash
# Merge via coordinator (auto-detects epic + base)
node "${SKILL_ROOT}/scripts/finish-epic.js" merge

# Clean up merged worktrees
node "${SKILL_ROOT}/scripts/finish-epic.js" cleanup
```

**If the merge produces a conflict** (coordinator returns non-zero, or `git status` shows unmerged paths), STOP before resolving. Go to **Step 4.1: Merge Conflict Handling** below. Do NOT auto-resolve, hand-edit conflict markers, or retry blindly.

Report completion format when done.

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <epic-name>

# Create PR
gh pr create --title "feat: <Epic Title>" --body "$(cat <<'EOF'
## Summary
Epic: <epic-name> complete. All tests passing.

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Keep worktree until PR merged.

#### Option 3: Keep As-Is

```bash
# Push for backup
git push -u origin <epic-name>

# Tag completion state
git tag -a epic/<epic-name>-complete -m "Epic complete, all tests pass"
git push origin epic/<epic-name>-complete
```

Report: "Keeping epic <name>. Worktree preserved."

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <epic-name>
- All commits on the branch
- The epic's worktree (absolute path from `arcforge status --json`)

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
# Update DAG and sync BEFORE destroying the worktree.
# The per-spec dag.yaml lives in the base worktree (specs/<spec-id>/dag.yaml);
# the current worktree carries only the .arcforge-epic marker, which the
# coordinator uses to reconnect to that dag and push local status back.
if [ -f .arcforge-epic ]; then
  node "${SKILL_ROOT}/scripts/finish-epic.js" block <epic-name> "Cancelled by user"
  node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction to-base
fi

# Delegate worktree removal to the coordinator — it derives the canonical
# path via scripts/lib/worktree-paths.js and handles force-remove of the
# .arcforge-epic marker. Never call `git worktree remove` by hand.
node "${SKILL_ROOT}/scripts/finish-epic.js" cleanup <epic-name>
git branch -D <epic-name>
```

### Step 4.1: Merge Conflict Handling (Option 1 only)

A merge conflict during epic finishing means another change has landed on the base branch since your epic started. In a multi-teammate dispatch (epics dispatched via `arc-dispatching-teammates`), the conflict typically comes from another teammate's already-merged epic touching a shared file.

**First, always abort to a clean state.** Do not leave a half-merged worktree:

```bash
git merge --abort
git status  # expect: clean working tree on epic branch
```

**Then decide based on context:**

| Context | Resolution Path |
|---|---|
| **Solo epic** — you (or a human user) invoked this skill directly, no team-lead in the loop | Present the conflict to the user. Show the unmerged files, the conflicting hunks verbatim, and ask for resolution guidance. Wait for explicit direction before editing. |
| **Multi-teammate dispatch** — you are a teammate spawned via `arc-dispatching-teammates`, a lead is present, conflict is on a file listed in your spawn prompt's Shared Files section | **SendMessage to `team-lead`** using the Merge Conflict (Multi-Teammate) blocked format below. Do NOT auto-resolve. The lead has the global view of which teammates landed in what order and is the correct arbiter. |
| **Multi-teammate dispatch, conflict on a file NOT listed in your Shared Files section** | Same as above (SendMessage lead) — AND flag that the shared-file scan missed this file. The lead needs to update the other teammates' ownership if they're still running. |

**Never:**
- Auto-resolve conflicts by taking "ours" / "theirs" / a guessed union
- Hand-edit conflict markers without explicit authorization (from user or lead)
- Silently retry `finish-epic.js merge` hoping git produces a different result
- Report completion until the conflict is resolved AND tests re-verified

**Why escalation beats auto-resolve in the multi-teammate case:** teammates work in isolation and see only their own epic's spec. The conflicting hunks may come from a teammate who will still make more changes, or from a semantic disagreement the other teammate needs to know about. The lead is the only role that can verify the resolution is globally consistent.

After the user or lead provides resolution guidance and you edit/commit, re-run the test suite (per arc-verifying's iron law: no completion without fresh evidence) and then return to Step 4.5 as if the merge had succeeded on the first try.

### Step 4.5: Sync After Choice

**After Option 2 (PR) — merge delegates to base internally, keep has no DAG change, discard syncs inline above:**

```bash
# Sync to base to ensure DAG reflects new status
node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction to-base
```

**Purpose:** Ensure the base DAG reflects the epic's final status (completed or merged).

### Step 4.6: Look Up the Worktree Path

Before emitting the completion format, query the coordinator for the epic's
absolute worktree path — don't reconstruct it from pattern knowledge, because
the derivation rule can change and the cached value is authoritative:

```bash
node "${SKILL_ROOT}/scripts/finish-epic.js" status --json
```

Extract the epic's `worktree` / `path` field from the JSON. Use that literal
string in the "Worktree:" line of the completion format. If the epic has
already been cleaned up (Option 1 or Option 4), the path may be null — in
that case use the exact text `(removed)` instead of a path.

## Completion Format

### If Merged (Option 1)

```
Epic merged → <base-branch>

Branch: <epic-name> (deleted)
Worktree: <absolute path from arcforge status --json> (removed)
Commits: [N commits merged]

Next: Continue with next epic or check status
```

### If PR Created (Option 2)

```
Pull request created → #<PR-number>

URL: <PR-URL>
Branch: <epic-name>
Worktree: <absolute path from arcforge status --json> (kept for now)

Next: Review PR, then merge/close and clean up worktree
```

### If Kept (Option 3)

```
Epic preserved for future work

Tag: epic/<epic-name>-complete
Worktree: <absolute path from arcforge status --json> (kept)
Backup: Pushed to origin/<epic-name>

Next: Resume work in worktree or run this skill again when ready
```

### If Discarded (Option 4)

```
Epic discarded

Branch: <epic-name> (deleted)
Worktree: <absolute path from arcforge status --json> (removed)

Next: Check status to see remaining epics
```

## Blocked Format

### Tests Failing

```
Epic completion blocked

Issue: Tests failing (<N> failures)
Location: <absolute path from arcforge status --json>

To resolve:
1. Fix failing tests
2. Re-run verification

Then retry this skill.
```

### Missing Epic File

```
Epic completion blocked

Issue: .arcforge-epic missing or empty
Location: Current directory

To resolve:
1. Verify you are in an epic worktree
2. Recreate .arcforge-epic with the epic id

Then retry this skill.
```

### Merge Conflict (Multi-Teammate)

Use this format when merging an epic dispatched via `arc-dispatching-teammates` hits a conflict. Send this as a `SendMessage` to `team-lead`, not as a plain-text report (teammate plain text is invisible to the lead).

```
Epic finishing blocked — merge conflict

Epic: <epic-id>
Branch: <epic-name>
Base: <base-branch>
State: merge aborted, worktree clean on epic branch
Commits ready: <N commits>

Conflict files:
- <path1>  [listed in my Shared Files: yes | no]
- <path2>  [listed in my Shared Files: yes | no]

Conflict hunks (verbatim from `git diff`):
<paste each hunk, keeping conflict markers intact>

My read:
- Nature: <additive-both-sides | semantic-disagreement | unknown>
- Proposed resolution: <union / keep-theirs / keep-ours / unclear>
- Risk: <low / medium / high>

I am waiting for arbitration. Not pushing, not creating PR, not
re-attempting merge until you respond.
```

If the conflict is on a file NOT listed in your spawn prompt's Shared Files section, add this line above the conflict files block:

```
ALERT: this file was NOT in my Shared Files section — the lead's
scan in arc-dispatching-teammates step 4 may have missed it. Other
running teammates should be notified.
```

Wait for the lead's response before taking further git action. Hold `epic` branch state, do not modify or push.

### Coordinator Not Available

```
Epic completion blocked

Issue: Node.js CLI not available
Checked: ${SKILL_ROOT}/scripts/finish-epic.js

To resolve:
1. Ensure Node.js is available

Then retry this skill.
```

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | ✓ (coordinator) | - | - | ✓ |
| 2. Create PR | - | ✓ | ✓ | - |
| 3. Keep as-is | - | ✓ (backup) | ✓ | - |
| 4. Discard | - | - | - | ✓ (force) |

## Red Flags

**Never:**
- Proceed with failing tests
- Use `git merge` directly (use coordinator merge)
- Delete work without typed "discard" confirmation
- Skip `.arcforge-epic` verification
- Use this skill when `.arcforge-epic` is missing
- Auto-resolve a merge conflict in a multi-teammate context — escalate to lead via SendMessage using the Merge Conflict (Multi-Teammate) blocked format

**Always:**
- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Use coordinator merge for Option 1

## Integration

**Before:** Work in worktree created by `arc-using-worktrees` or `arc-coordinating expand`

**After:** If merged, continue to next epic or use `arc-coordinating status`

**Related:** Use `arc-verifying` mindset throughout
