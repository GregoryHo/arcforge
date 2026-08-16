---
name: finishing
description: Integrate completed work. Use when implementation is done and you are deciding whether to merge, open a PR, keep, or discard a branch or worktree.
---

# Finishing

Verify → present → execute → clean up. Every step below carries a completion
criterion; do not start the next step until the current one is checked off.

Exact command sequences live in `references/git-recipes.md` — open it before
executing option 1 or option 4.

## Step 1 — Verify tests

Run the project's own test command in the working tree that holds the work.

- [ ] Done when a full test run finished in this working tree and you can state its result.

Failing or unrunnable tests end the skill here: emit the Blocked format below and
stop. An option list offered after a failed test run invites merging broken work.

## Step 2 — Capture the branch and the base checkout

Capture both while you are still standing where the work is. Every later step
moves you, and a value read after the move is the wrong value.

```bash
FEATURE_BRANCH="$(git branch --show-current)"
arcforge worktree list --json
```

Take `BASE_WORKTREE` from the `path` of the entry whose `kind` is `base`; that
checkout's current branch is the merge target. Take your own worktree path from
the entry whose `branch` matches `FEATURE_BRANCH`. Never reconstruct a worktree
path from a naming pattern — the derivation rule belongs to the CLI, not to you.

- [ ] Done when FEATURE_BRANCH, BASE_WORKTREE, the base branch name, and the worktree path (or "no worktree") are all recorded.

## Step 3 — Present exactly four options

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

Four options, no fifth, no recommendation, no explanation of the tradeoffs.

Present them even when the user has told you not to ask. "Just handle it", "I
trust you", "do whatever you think is best", "don't check back with me", and the
user walking away are all authorization to work — none of them names an option,
and Step 4 executes a named option rather than an inference. Skip ahead only when
the user's own words pick one of the four outright.

- [ ] Done when the user named one of 1–4, or the four options are on screen and you have stopped.

## Step 4 — Execute the choice

Enter this step only from an option the user named. If you got here without one,
you are in Step 3.

| Option | Action | Worktree |
|---|---|---|
| 1 Merge | Merge into the base checkout, then re-run tests there | removed in Step 5 |
| 2 PR | `git push -u origin "$FEATURE_BRANCH"`, then `gh pr create` | kept until the PR merges |
| 3 Keep | Report branch and worktree path; change nothing | kept |
| 4 Discard | Require typed confirmation, then delete | removed in Step 5 |

Options 1 and 4 run the sequences in `references/git-recipes.md` verbatim.
Option 4 additionally requires this exchange before anything is deleted:

```
This will permanently delete:
- Branch <branch-name>
- All commits on the branch
- The worktree at <path from Step 2>

Type 'discard' to confirm.
```

Anything other than the literal word `discard` cancels option 4 and returns to
Step 3. "yes", "ok", "go ahead", and silence are all cancellations.

- [ ] Done when the chosen option's commands have run and, for option 4, the literal word `discard` was typed first.

## Step 5 — Clean up (options 1 and 4 only)

Options 2 and 3 keep the worktree; skip this step for them.

```bash
cd "$BASE_WORKTREE"
arcforge worktree remove "<worktree name>"
```

Leave the worktree before removing it: you cannot delete a directory you are
standing in, and cleanup run from inside it strands the shell. A worktree
arcforge did not create is removed with `git worktree remove` instead.

The branch delete happens after the worktree is gone, from the base checkout:
`git -C "$BASE_WORKTREE" branch -d "$FEATURE_BRANCH"` for option 1, `-D` for
option 4. A refused `-d` means the merge never landed — stop and investigate;
never reach for `-D` to silence it.

- [ ] Done when the worktree is gone and the branch delete returned success, in that order.

## Step 6 — Report

```
<outcome line>
Branch: <branch-name> <(deleted) | (pushed) | (preserved)>
Worktree: <path from Step 2> <(removed) | (kept)>
Next: <the one action that follows>
```

Outcome line per option: `Branch merged → <base-branch>` · `Pull request
created → #<number> <url>` · `Branch preserved for future work` · `Work
discarded`. Omit the Worktree line when there is no worktree, and write
`(removed)` only after Step 5 actually removed it.

- [ ] Done when every slot holds a real value read in Step 2 or returned by the commands just run — no placeholder, no reconstructed path.

## Blocked format

```
Completion blocked

Issue: Tests failing (<N> failures)
Location: <worktree path from Step 2, or the current directory>

To resolve:
1. Fix the failing tests, re-run verification

Then retry this skill.
```

## Red flags

| About to | Instead |
|---|---|
| Merge or delete because the user said "just handle it" | Present the four options — blanket trust names none of them |
| Announce the plan ("verify, then merge and clean up") before Step 3 | Stop at the options; the plan after Step 2 is to ask, not to integrate |
| Present the options with tests failing or unrun | Emit the Blocked format and stop |
| `git checkout <base-branch>` inside a linked worktree | Merge into the base from the base checkout — git 2.52 exits 128 on that checkout |
| Remove the worktree while standing inside it | `cd "$BASE_WORKTREE"` first |
| Delete the branch before the worktree is removed | Remove the worktree, then delete the branch |
| `git branch -D` after `-d` refused | Stop — the merge did not land |
| Delete work on "yes" or "go ahead" | Require the literal typed word `discard` |
| Force-push to get unstuck | Ask — a force-push is the user's call |
