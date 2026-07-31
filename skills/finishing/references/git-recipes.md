# Git recipes — options 1 and 4

Run these verbatim after Step 2 has captured `FEATURE_BRANCH` and
`BASE_WORKTREE`. Both recipes work identically whether you are standing in a
linked worktree or on a plain branch in the base checkout; `git -C` is what
makes that true, because it acts on the base without moving you into it.

## Option 1 — merge into the base checkout

```bash
git -C "$BASE_WORKTREE" pull
git -C "$BASE_WORKTREE" merge "$FEATURE_BRANCH"
( cd "$BASE_WORKTREE" && <the test command from Step 1> )
```

`git -C "$BASE_WORKTREE" pull` is a no-op in a repository with no remote; leave
it in so the recipe is the same either way.

Re-running the tests in the base is not ceremony: Step 1 proved the branch
passes in isolation, and this proves the merged result passes. A merge that
compiles is not a merge that works.

Then go to Step 5 (remove the worktree), and only after that:

```bash
git -C "$BASE_WORKTREE" branch -d "$FEATURE_BRANCH"
```

`git branch -d` refusing with "not fully merged" means the merge did not land.
Stop there and find out why. `-D` deletes the commits instead of telling you.

## Option 4 — discard

Only after the literal word `discard` has been typed. Remove the worktree first
(Step 5) — git will not delete a branch that is still checked out somewhere —
and then, from the base:

```bash
git -C "$BASE_WORKTREE" branch -D "$FEATURE_BRANCH"
```

`-D` is correct here and only here: discarding is the stated intent, so the
"not fully merged" refusal that `-d` would raise is exactly what the user asked
to override.

For a plain branch with no worktree, that single line is the whole recipe.

## What never appears in either recipe

`git checkout <base-branch>` from inside a linked worktree. Git 2.52 exits 128
because the branch is already checked out in the base, and every variation of
the command hits the same wall. The merge target is reached with `git -C`, not
by moving onto it.
