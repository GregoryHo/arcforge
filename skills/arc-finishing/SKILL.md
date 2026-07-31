---
name: arc-finishing
description: Integrate finished work once implementation is complete and tests pass. Use when deciding how to merge a finished branch or worktree — verify tests, present the options, execute the choice, clean up.
category: sdd
status: promoted
---

# arc-finishing

## Overview

Guide completion of development work by presenting clear options and handling the
chosen workflow. It covers a regular branch and a worktree created by
`arc-using-worktrees`, both integrated with plain git — you never need a sibling
skill.

**Core principle:** Verify tests → Present options → Execute choice → Clean up.

**REQUIRED BACKGROUND:** You MUST use verification mindset. See `arc-verifying`.

## The Process

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

**Migrate before you destroy.** Capture the branch and the base checkout path
while you are still inside the worktree, merge the work out, then move to the
base checkout *before* cleaning up — running cleanup or `git branch -d` from the
worktree is a silent no-op, and you cannot delete a worktree you are standing
inside. **Never `git checkout <base-branch>` inside a linked worktree** (git 2.52
exits 128); always merge into the base from the base checkout (`cd` there, or
`git -C <base>`).

**Merge into the base checkout (NEVER checkout the base inside this worktree):**

```bash
# Capture the feature branch BEFORE you move.
FEATURE_BRANCH="$(git branch --show-current)"

# Locate the base checkout. `worktree list --json` annotates kind; the base
# checkout is the kind:base entry (falls back to the porcelain first entry).
BASE_WORKTREE="$(arcforge worktree list --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).worktrees;const b=w.find(x=>x.kind==="base")||w[0];process.stdout.write(b.path)})')

# Merge into the base from the base checkout — git -C keeps you in this worktree.
# Do NOT `git checkout <base-branch>` here: in a linked worktree git 2.52 exits 128.
git -C "$BASE_WORKTREE" pull
git -C "$BASE_WORKTREE" merge "$FEATURE_BRANCH"

# Verify tests on the merged result, in the base.
( cd "$BASE_WORKTREE" && <test command> )
```

Then: Cleanup worktree (Step 5). In a worktree, **the branch delete
happens only AFTER the worktree is removed** (Step 5), executed from the base
checkout: `git -C "$BASE_WORKTREE" branch -d "$FEATURE_BRANCH"`. On a plain branch
with no worktree, that same base `branch -d` is all you need.

**If `git branch -d` refuses** ("not fully merged"), STOP — do NOT force with `-D`. A refusal means the merge did not actually land; investigate before destroying the branch.

#### Option 2: Push and Create PR

```bash
# Push the current branch
FEATURE_BRANCH="$(git branch --show-current)"
git push -u origin "$FEATURE_BRANCH"

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Keep worktree until PR merged.

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits on the branch
- The worktree (absolute path from the Step 4.6 lookup)

Type 'discard' to confirm.
```

Wait for exact confirmation.

**If confirmed:**

```bash
# Capture the feature branch and the base checkout BEFORE you move.
FEATURE_BRANCH="$(git branch --show-current)"
BASE_WORKTREE="$(arcforge worktree list --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).worktrees;const b=w.find(x=>x.kind==="base")||w[0];process.stdout.write(b.path)})')

# Remove the worktree FIRST (Step 5: cd base → worktree remove), THEN
# delete the branch from the base — you cannot delete a branch that is still
# checked out in a present worktree. For a plain branch with no worktree, run
# only the branch -d below.
git -C "$BASE_WORKTREE" branch -D "$FEATURE_BRANCH"
```

For a *worktree*, do Step 5 (cd base → `worktree remove`) BEFORE the
`branch -D` line above. For a plain branch with no worktree, the base `branch -D`
is all you need.

### Step 4.6: Look Up the Worktree Path

Before emitting the completion format, resolve the worktree's absolute path —
don't reconstruct it from pattern knowledge, because the derivation rule can
change and the cached value is authoritative.

**Read the `path` from `worktree list --json`:**

```bash
arcforge worktree list --json
```

Match your worktree by `branch` and read its `path` field. If the worktree has
already been removed (Option 1 or Option 4), it won't appear — use the exact text
`(removed)` instead of a path. For a plain branch with no worktree, omit the
Worktree line.

### Step 5: Cleanup Worktree

**For Options 1 and 4 only** (Options 2 and 3 keep the worktree).

**Leave the worktree before you remove it.** Removing the directory you are
standing in strands the persistent shell, and you cannot delete a worktree from
inside it. `cd` to the base checkout first, then remove.

```bash
# You captured BASE_WORKTREE in Step 4. Leave the worktree first, then remove it
# by name. Removal must happen BEFORE the branch -d/-D from Step 4.
WT_NAME="<worktree name>"   # the name you passed to `worktree add`
cd "$BASE_WORKTREE"
arcforge worktree remove "$WT_NAME"
```

**For Option 3:** Keep worktree.

## Completion Format

Fill the `Worktree:` line from the Step 4.6 lookup — never a hardcoded template path. Use the variant for the chosen option:

```
Option 1 (merged):   Branch merged → <base-branch>
                     Branch: <branch-name> (deleted)
                     Worktree: <absolute path from Step 4.6 lookup> (removed if applicable)
                     Commits: [N merged]   Next: next epic/task, or check status
Option 2 (PR):       Pull request created → #<PR-number>   URL: <PR-URL>
                     Branch: <branch-name>
                     Worktree: <absolute path from Step 4.6 lookup> (kept for now)
                     Next: review PR, then merge/close and clean up worktree
Option 3 (kept):     Branch preserved for future work
                     Branch: <branch-name>
                     Worktree: <absolute path from Step 4.6 lookup> (kept)
                     Next: resume, or re-run
Option 4 (discarded): Work discarded   Branch: <branch-name> (deleted)
                     Worktree: <absolute path from Step 4.6 lookup> (removed if applicable)
                     Next: start fresh or check status
```

## Blocked Format

**Tests Failing:**

```
Completion blocked

Issue: Tests failing (<N> failures)
Location: <absolute path from Step 4.6 lookup | Current directory>

To resolve:
1. Fix failing tests, re-run verification

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
- <path1>
- <path2>

Conflict hunks (verbatim from `git diff`):
<paste each hunk, keeping conflict markers intact>

My read:
- Nature: <additive-both-sides | semantic-disagreement | unknown>
- Proposed resolution: <union / keep-theirs / keep-ours / unclear>
- Risk: <low / medium / high>

I am waiting for arbitration. Not pushing, not creating PR, not
re-attempting merge until you respond.
```

Wait for the lead's response before taking further git action. Hold branch state, do not modify or push.

## Red Flags

**Never:**
- Proceed with failing tests
- `git checkout <base-branch>` inside a linked worktree — git 2.52 exits 128; merge into the base from the base checkout (`cd` there, or `git -C <base>`)
- Remove a worktree while standing inside it (cd to the base first)
- Delete a worktree's branch BEFORE the worktree is removed
- Delete work without typed "discard" confirmation
- Force-push without explicit request
- Auto-resolve a merge conflict in a multi-teammate context — escalate to lead via SendMessage using the Merge Conflict (Multi-Teammate) blocked format

**Always:**
- Verify tests before offering options; present exactly 4 options; get typed confirmation for Option 4
- Clean up the worktree for Options 1 & 4 only (cd to base first)

## Integration

- **Called by:** arc-agent-driven, arc-executing-tasks (after all tasks complete)
- **Pairs with:** arc-using-worktrees (cleans up its worktree)
- **Related:** use `arc-verifying` mindset throughout
