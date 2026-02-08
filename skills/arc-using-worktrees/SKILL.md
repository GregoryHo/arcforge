---
name: arc-using-worktrees
description: Use when creating isolated workspace for epic development
---

# arc-using-worktrees

## When to Use

Use this skill when you need to create an isolated git worktree for developing an epic. This enables parallel development of multiple epics without interference.

**IMPORTANT:** This skill is specific to arcforge. Do NOT use any other worktree skill. The metadata format is different.

## Core Workflow

### Step 1: Verify Directory Structure

Check if `.worktrees/` directory exists:

```bash
ls .worktrees/ 2>/dev/null || mkdir -p .worktrees/
```

### Step 1.5: Safety Verification

Ensure .worktrees/ is in .gitignore:

```bash
git check-ignore -q .worktrees 2>/dev/null
if [ $? -ne 0 ]; then
    echo ".worktrees" >> .gitignore
    git add .gitignore
    git commit -m "chore: ignore .worktrees directory"
fi
```

### Step 1.6: Worktree Context Check

If already in a worktree, STOP and use current worktree:

```bash
git rev-parse --show-superproject-working-tree >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Already in a worktree. Stay here and continue."
    exit 1
fi
```

### Step 2: Create Git Worktree

Create the worktree with a matching branch name:

```bash
git worktree add .worktrees/<epic-name> -b <epic-name>
```

**Important:** Use the exact epic name from `dag.yaml` if it exists.

### Step 2.5: Project Setup

Auto-detect and run setup:

```bash
# Python
if [ -f pyproject.toml ]; then pip install -e .; fi
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

# Node
if [ -f package.json ]; then npm install; fi
```

### Step 2.6: Baseline Test

Verify clean baseline:

```bash
pytest tests/ -v
```

If tests fail: Report failures, ask whether to proceed.

### Step 3: Create Epic Metadata

**CRITICAL:** Create `.arcforge-epic` file (NOT `.epic`, NOT `.worktree`, NOT any other name):

```bash
cd .worktrees/<epic-name>
echo "<epic-name>" > .arcforge-epic
```

**Why `.arcforge-epic` specifically?**
- Follows project naming convention (`.arcforge-progress.json`, etc.)
- Ensures arc-coordinating CLI can find it
- Distinguishes from other project's worktree tracking

**DO NOT:**
- ❌ Create `.epic` (wrong name)
- ❌ Create `.worktree` (wrong name)
- ❌ Skip this file (required for tracking)
- ❌ Use other tracking mechanisms (this is the standard)

### Step 4: DAG Integration (if dag.yaml exists)

If `dag.yaml` exists in the main worktree:
- Read the epic status
- Verify the epic is in "ready" state (dependencies complete)
- Note: Status updates happen via `arc-coordinating`, not here

### Step 5: Notify User

Use the standardized completion format (see below).

## Red Flags

Stop immediately if you catch yourself thinking:

1. **".epic is fine"** — NO! Must use `.arcforge-epic` exactly
2. **"I'll use another worktree skill"** — NO! Wrong metadata format
3. **"Skip DAG check"** — Always check if dag.yaml exists
4. **"Create worktree anywhere"** — Must be in `.worktrees/` directory
5. **"Use main/master branch"** — Must create new branch with epic name
6. **"Metadata file is optional"** — It's REQUIRED for coordinator tracking
7. **"Any name starting with dot is fine"** — NO! `.arcforge-epic` ONLY

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Any tracking file works" | `.arcforge-epic` is the standard |
| "DAG check slows things down" | Integration prevents conflicts |
| "User knows where they are" | Tools depend on `.arcforge-epic` |
| ".epic is shorter" | Consistency > brevity |

## Stage Completion Format

```
─────────────────────────────────────────────────
✅ Worktree created → `.worktrees/<epic-name>/`

Branch: <epic-name>
Tracking: .arcforge-epic
DAG status: [ready/blocked/N/A]

Next: Work in the worktree, then use `/arc-finishing-epic` when complete
─────────────────────────────────────────────────
```

## Blocked Format

```
─────────────────────────────────────────────────
⚠️ Worktree creation blocked

Issue: [description]
Location: [epic name or path]

To resolve:
1. [action]

Then retry: `/arc-using-worktrees`
─────────────────────────────────────────────────
```

## Integration with Pipeline

- **Called by:** `arc-agent-driven`, `arc-executing-tasks`, `arc-coordinating`
- **Before:** `arc-coordinating expand` (creates multiple worktrees)
- **After:** Work in worktree, then `/arc-finishing-epic` (merge decision)
- **Related:** `arc-dispatching-parallel` (for feature-level parallelization within worktree)
