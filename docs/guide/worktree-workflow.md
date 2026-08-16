# Worktrees

A git worktree is a second checkout of the same repository on a different
branch. arcforge manages them so you can have several branches open at once —
one per experiment, one per parallel agent — without stashing, without switching
branches, and without a second clone.

## Create one

```bash
arcforge worktree add spike-auth
```

That creates a branch named `spike-auth` off your current `HEAD`, checks it out
into a fresh directory, and prints where it went:

```json
{
  "name": "spike-auth",
  "slug": "spike-auth",
  "branch": "spike-auth",
  "branch_created": true,
  "path": "/Users/you/.arcforge/worktrees/demo-f12e25-spike-auth"
}
```

`cd` to that `path` and you are on the new branch with the full repository
around you. Your original checkout has not moved and is still on whatever branch
it was on.

### Choosing the branch

The branch defaults to the worktree's name. When you want them to differ:

```bash
arcforge worktree add hotfix --branch fix/login --from main
```

`--from` sets the base ref for a branch that has to be created. If the branch
already exists it is checked out as-is, and passing `--from` alongside it is
refused rather than silently ignored — an existing branch has a history already,
and there is no honest thing for a base ref to mean.

### Installing dependencies

A fresh worktree has no `node_modules`, no virtualenv, nothing installed:

```bash
arcforge worktree add spike-auth --setup
```

`--setup` detects the project's package manager and runs its installer, streaming
the output live. Skip it for a quick read-only branch; use it whenever you plan
to run the test suite in there.

## See what exists

```bash
arcforge worktree list
```

Every worktree git knows about, each labelled with a `kind`:

| kind | Meaning |
|------|---------|
| `base` | Your main checkout — the repository you cloned |
| `generic` | Created by `arcforge worktree add` |
| `epic` | An arcforge-managed tree whose lifecycle something else owns |
| `external` | A worktree you made yourself with `git worktree add` |

The distinction matters for removal: arcforge only removes what it created.

Add `--json` when you want to act on the result:

```bash
arcforge worktree list --json | jq -r '.worktrees[] | select(.kind == "generic") | .path'
```

Each entry carries `path`, `branch`, `head`, and `kind`.

## Remove one

```bash
arcforge worktree remove spike-auth
```

This deletes the directory and prunes git's record of it in one step. The branch
survives — removing a worktree is about reclaiming the checkout, not discarding
the work.

Three things stop a removal, all of them deliberate:

- **Uncommitted changes.** You get an error naming the path, and `--force`
  overrides it. Without that guard, a stray edit in a worktree you had forgotten
  about would vanish silently.
- **A worktree arcforge did not create.** External trees are yours; remove them
  with `git worktree remove`.
- **A tree another lifecycle owns.** If something else is managing it, arcforge
  refuses rather than pulling it out from under the owner.

## Where they live

```
~/.arcforge/worktrees/<project>-<hash>-<name>/
```

Outside your repository, deliberately. A worktree nested inside the project shows
up in `git status`, gets picked up by test globs and file watchers, and finds its
way into someone's `find .`. Keeping them under your home directory means the
repository you are looking at is only ever the repository.

The `<hash>` is derived from the project's absolute path, so two projects with
the same directory name never collide. You do not need to construct these paths —
ask `worktree list` and use what it reports.

## Using one

A worktree is a normal checkout. Everything works the way it does anywhere else:

```bash
cd "$(arcforge worktree list --json | jq -r '.worktrees[] | select(.branch == "spike-auth") | .path')"
npm test
git commit -am "wip"
```

Commits made in a worktree are commits on that branch, visible from every other
checkout of the repository immediately. There is nothing to sync.

## The workflow around them

Worktrees are most useful in two situations, and a skill covers each:

**Parallel work.** Several pieces of work that do not depend on each other, one
agent per piece. Each needs its own workspace or they will overwrite each other's
files. `/arcforge:dispatching` handles the split, the workspaces, and the briefs.

**Finishing.** When the work in a worktree is done, something has to decide
whether it merges, becomes a PR, stays put, or gets thrown away — and then clean
up. `/arcforge:finishing` runs that sequence, verifying before it presents you
with options rather than after.

You can also just use the three commands directly. Nothing about worktrees
requires a skill.
