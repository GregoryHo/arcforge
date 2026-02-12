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
- Worktree at .worktrees/<epic-name>/

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
git worktree remove .worktrees/<epic-name>
git branch -D <epic-name>

# Update DAG if exists
if [ -f dag.yaml ]; then
  node "${SKILL_ROOT}/scripts/finish-epic.js" block <epic-name> "Cancelled by user"
fi
```

### Step 4.5: Sync After Choice

**After Option 2 (PR) or Option 4 (Discard) — merge delegates to base internally, keep has no DAG change:**

```bash
# Sync to base to ensure DAG reflects new status
node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction to-base
```

**Purpose:** Ensure the base DAG reflects the epic's final status (completed, merged, or discarded).

## Completion Format

### If Merged (Option 1)

```
Epic merged → <base-branch>

Branch: <epic-name> (deleted)
Worktree: .worktrees/<epic-name>/ (removed)
Commits: [N commits merged]

Next: Continue with next epic or check status
```

### If PR Created (Option 2)

```
Pull request created → #<PR-number>

URL: <PR-URL>
Branch: <epic-name>
Worktree: .worktrees/<epic-name>/ (kept for now)

Next: Review PR, then merge/close and clean up worktree
```

### If Kept (Option 3)

```
Epic preserved for future work

Tag: epic/<epic-name>-complete
Worktree: .worktrees/<epic-name>/ (kept)
Backup: Pushed to origin/<epic-name>

Next: Resume work in worktree or run this skill again when ready
```

### If Discarded (Option 4)

```
Epic discarded

Branch: <epic-name> (deleted)
Worktree: .worktrees/<epic-name>/ (removed)

Next: Check status to see remaining epics
```

## Blocked Format

### Tests Failing

```
Epic completion blocked

Issue: Tests failing (<N> failures)
Location: .worktrees/<epic-name>/

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

**Always:**
- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Use coordinator merge for Option 1

## Integration

**Before:** Work in worktree created by `arc-using-worktrees` or `arc-coordinating expand`

**After:** If merged, continue to next epic or use `arc-coordinating status`

**Related:** Use `arc-verifying` mindset throughout
