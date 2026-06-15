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

**Migrate before you destroy.** Capture the epic branch and base path while you
are still inside the worktree, merge the epic out, then move to the base
checkout *before* cleaning up — running cleanup or `git branch -d` from the
worktree is a silent no-op (the worktree's local dag carries `worktree: null`),
and you cannot delete a worktree you are standing inside.

**Use coordinator merge (NOT git merge directly):**

```bash
# Capture the live epic branch (the engine names it <spec-id>/<epic-id>) and the
# base worktree path from the marker — BEFORE anything is removed.
EPIC_BRANCH="$(git branch --show-current)"
BASE_WORKTREE="$(grep '^base_worktree:' .arcforge-epic | sed 's/^base_worktree:[[:space:]]*//')"

# Merge via coordinator (auto-detects epic + base). Safe to run from the worktree.
node "${SKILL_ROOT}/scripts/finish-epic.js" merge

# Move to the base checkout so cleanup, status, and branch -d all act on the
# base dag and you are not standing in the directory about to be removed.
cd "$BASE_WORKTREE"

# Clean up merged worktrees (delegates to base; removes the epic worktree).
node "${SKILL_ROOT}/scripts/finish-epic.js" cleanup

# Look up the (now null) path for the completion format, then delete the merged
# branch. `-d` is the honest, safe delete — it refuses if the branch was not
# fully merged, which is exactly the guard you want.
node "${SKILL_ROOT}/scripts/finish-epic.js" status --json
git branch -d "$EPIC_BRANCH"
```

**If the merge produces a conflict** (coordinator returns non-zero, or `git status` shows unmerged paths), STOP before resolving. Go to **Step 4.1: Merge Conflict Handling** below. Do NOT auto-resolve, hand-edit conflict markers, or retry blindly.

**If `git branch -d` refuses** ("not fully merged"), STOP — do NOT force with `-D`. A refusal means the merge did not actually land; investigate before destroying the branch.

Report completion format when done — and only claim the branch is deleted after `git branch -d` actually succeeded.

#### Option 2: Push and Create PR

```bash
# Push the current epic branch (engine names it <spec-id>/<epic-id>)
EPIC_BRANCH="$(git branch --show-current)"
git push -u origin "$EPIC_BRANCH"

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
# Resolve the current epic branch (engine names it <spec-id>/<epic-id>)
EPIC_BRANCH="$(git branch --show-current)"

# Push for backup
git push -u origin "$EPIC_BRANCH"

# Tag completion state
git tag -a "epic/${EPIC_BRANCH}-complete" -m "Epic complete, all tests pass"
git push origin "epic/${EPIC_BRANCH}-complete"
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
# Capture identifiers from the marker BEFORE destroying anything. `block` and
# `cleanup` take the epic *id*; `git branch -D` takes the live branch name
# (engine: <spec-id>/<epic-id>); cleanup + branch -D must run from the base.
EPIC_ID="$(grep '^epic:' .arcforge-epic | sed 's/^epic:[[:space:]]*//')"
EPIC_BRANCH="$(git branch --show-current)"
BASE_WORKTREE="$(grep '^base_worktree:' .arcforge-epic | sed 's/^base_worktree:[[:space:]]*//')"

# Update DAG and sync BEFORE destroying the worktree.
# The per-spec dag.yaml lives in the base worktree (specs/<spec-id>/dag.yaml);
# the current worktree carries only the .arcforge-epic marker, which the
# coordinator uses to reconnect to that dag and push local status back.
if [ -f .arcforge-epic ]; then
  node "${SKILL_ROOT}/scripts/finish-epic.js" block "$EPIC_ID" "Cancelled by user"
  node "${SKILL_ROOT}/scripts/finish-epic.js" sync --direction to-base
fi

# Move to the base checkout before removing the worktree — you cannot delete a
# worktree (or its branch) while standing inside it, and cleanup only acts on
# the base dag.
cd "$BASE_WORKTREE"

# Delegate worktree removal to the coordinator — it derives the canonical
# path via ${ARCFORGE_ROOT}/scripts/lib/worktree-paths.js and handles
# force-remove of the .arcforge-epic marker. Never call `git worktree remove` by hand.
node "${SKILL_ROOT}/scripts/finish-epic.js" cleanup "$EPIC_ID"
git branch -D "$EPIC_BRANCH"
```

### Step 4.1: Merge Conflict Handling (Option 1 only)

A merge conflict during epic finishing means another change has landed on the base branch since your epic started. In a multi-teammate dispatch (epics dispatched via `arc-dispatching-teammates`), the conflict typically comes from another teammate's already-merged epic touching a shared file.

**First, always abort to a clean state.** The half-merged state lives in the
**base checkout**, not your worktree — the coordinator checks the base branch
out in the base worktree before merging. So abort through the coordinator, which
finds the base worktree and runs the abort there even though you are in the
epic worktree:

```bash
node "${SKILL_ROOT}/scripts/finish-epic.js" merge --abort

# Verify the BASE working tree is clean again — the abort happened there, so
# check git's working-tree state in the base, not the DAG. `git -C` keeps you in
# the worktree while inspecting the base; expect no unmerged paths.
BASE_WORKTREE="$(grep '^base_worktree:' .arcforge-epic | sed 's/^base_worktree:[[:space:]]*//')"
git -C "$BASE_WORKTREE" status   # expect: no "Unmerged paths", base on its branch
```

Do NOT run a bare `git merge --abort` from the worktree — your worktree is on
the epic branch and has no merge in progress, so it would be a silent no-op
while the base stays half-merged.

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
the derivation rule can change and the cached value is authoritative.

**Always query `status --json` against the BASE dag, never the worktree's local
copy.** A worktree's own dag copy carries `worktree: null` for every epic, so
`status --json` run from a worktree cwd reports `path: null` even when the
worktree is alive — which would wrongly print a null path for the kept-worktree
options. Only the base dag holds the real `worktree`/`path` value.

```bash
# Options 1 and 4: you already ran `cd "$BASE_WORKTREE"`, so the base dag is the
# current cwd — query it directly.
node "${SKILL_ROOT}/scripts/finish-epic.js" status --json

# Options 2 and 3: the worktree is kept, so you are still inside it. Resolve the
# base AND the spec id from the marker, then query the base dag in a subshell
# (keeps you in the worktree for later steps). Pass --spec-id: the base has no
# marker to pin the spec, so without it a multi-spec base returns the nested
# `{ specs: { <id>: ... } }` shape instead of a flat `{ epics: [...] }`.
SPEC_ID="$(grep '^spec_id:' .arcforge-epic | sed 's/^spec_id:[[:space:]]*//')"
BASE_WORKTREE="$(grep '^base_worktree:' .arcforge-epic | sed 's/^base_worktree:[[:space:]]*//')"
( cd "$BASE_WORKTREE" && node "${SKILL_ROOT}/scripts/finish-epic.js" status --json --spec-id "$SPEC_ID" )
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
