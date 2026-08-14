---
name: dispatching
description: Dispatch discipline for work that can run in parallel. Use when several pieces of work could run at once, when work needs an isolated workspace to run in, when writing the brief a dispatched agent will run on, or when dispatched work reports back and has to be accepted.
---

# Dispatching

Parallel work fails in four places, in order: the split was wrong, the workspaces
overlapped, the brief was incomplete, or the report was believed. Each step below
closes one of them.

Splitting work you could have done yourself in one pass costs more than it saves.
Dispatch when the pieces genuinely do not need each other, or when one of them
needs a fresh context to be judged honestly.

## Step 1 — Prove the pieces are independent

Independent means all three: no shared dependency, no shared file, and each piece
understandable without reading the others. Two failures in the same module, or a
fix that might turn out to fix the others too, are one piece — dispatch them as one.

Write the split down before dispatching: which piece owns which files. A piece
whose file list you cannot state is not scoped yet.

- [ ] Done when every piece has a file list and no file appears on two lists.

Do not pre-negotiate conflicts beyond that list. Predicting which lines will
collide is guesswork that costs more than resolving the collision later.

## Step 2 — Give every writer its own worktree

Two agents writing into one checkout will overwrite each other's edits and stage
each other's files. Isolation is not a precaution here, it is the precondition:
if the pieces write, each gets its own worktree.

```bash
arcforge worktree add <name> [--branch <b>] [--from <ref>] [--setup] --json
arcforge worktree list --json
arcforge worktree remove <name> [--force]
```

Read the `path` field out of the JSON. The location is derived by the engine, so
a path you construct, remember, or guess will be the wrong one and everything
downstream that looks for the worktree will miss it. `--setup` runs the project's
installer inside the new tree; `list` annotates each entry by kind, and `cd` to a
`path` is how you enter one — there is no switch command.

Already inside a worktree? Work there. Never nest a worktree inside a worktree. A
path the user names explicitly overrides all of this — honor it with raw git.

- [ ] Done when each dispatched writer has a worktree path read from CLI JSON.

Read-only pieces — research, review, investigation — need no worktree; they can
share the checkout because they do not write to it.

## Step 3 — Write the dispatch card

A dispatched agent starts with an empty context and its own working directory. It
cannot see your reasoning, your open files, or what you meant. Everything it needs
goes in the card, in text:

| Slot | What breaks without it |
|---|---|
| Task, one piece only | The agent widens scope to whatever looks related |
| Absolute paths, not names | A relative path resolves against the agent's cwd, not yours |
| Constraints | Refactors outside scope arrive as surprise diffs |
| Acceptance criteria, verbatim | The agent decides for itself what done means |
| Return format | Reports arrive in four shapes and cannot be compared |
| Authority to finish | The agent stops mid-task waiting for a go-ahead you never send |

Paste the text, never a file path to the text. Dispatch the whole batch in one
message so the pieces actually run concurrently rather than in sequence.

The wording of the authority grant, the return format, and how to word a retry
after a rejection are in `references/dispatch-card.md` — open it when writing the
first card of a batch or when a dispatched agent stalls waiting for permission.

- [ ] Done when every card names its files absolutely and states its acceptance criteria.

## Step 4 — Accept on evidence, never on the report

A completion report is a claim. It is written by the agent whose work is under
judgment, from the context that produced the work, and it is wrong in the specific
way that matters: it describes what the agent intended.

Check the claim against the tree — read the changed files, run the project's own
checks, diff the branch. A green suite is not compliance either: it only proves
the tests that exist pass, and the criterion nobody wrote a test for fails
silently under a green run.

For anything larger than a single fix, hand acceptance to a fresh-context agent
rather than doing it inline. Your memory of the dispatch is exactly what makes an
inline check unreliable — you already believe roughly what was built, and the
check turns into confirming that belief. Two checks, dispatched separately: does
the delivered code satisfy every criterion, and does the suite pass from an empty
context. Both pass, accept. Either fails, reject.

Never overrule a rejection by reasoning about it. Either produce the evidence that
the finding is wrong, or send the rejection back. `references/acceptance.md` has
the two check prompts, what a rejection has to contain to be actionable, and how
to tell a bad delivery from a bad criterion.

- [ ] Done when every accepted piece has file-level or command-output evidence, produced by someone other than its author.

## Step 5 — Merge back

Merge accepted pieces onto one branch, one at a time, running the project's checks
after each. A conflict at this point means Step 1 was wrong — resolve it, and fix
the split before the next batch rather than resolving the same collision again.

That branch is the deliverable. Do not promote it to the default branch and do not
revert failed pieces on your own; both are the user's call. Remove the worktrees of
accepted pieces, keep the worktrees of failed ones so they can still be inspected,
and run the removal from the main checkout — a process cannot delete the directory
it is standing in. `/finishing` takes the branch from here.

- [ ] Done when the branch carries every accepted piece, the checks are green, and only failed pieces still have worktrees.

## Choosing the substrate

| Situation | Substrate |
|---|---|
| Independent pieces, you drive them yourself | Subagents, one per piece, one batch |
| Larger streams of work, you stay present to answer questions | Agent teammates, one per stream, lead session coordinates |
| You are leaving and nobody will answer questions | An unattended loop — see the `looping` skill |
| One piece of work with a list to work through | No dispatch — see the `executing` skill |

The line between the middle two is **attendance, not risk**: risky work with you
watching is still teammates; safe work with you gone is still a loop. Cap a team at
five and queue the rest; past that, coordinating costs more than the parallelism
returns. Create the team before dispatching into it, dispatch the batch in parallel,
and if some spawns fail, retry only those, sequentially — that failure is a startup
race, not a limit on team size.

Manual parallelism — "open five windows and switch between them" — is what this
skill exists to replace. Offering it as the answer hands the coordination back to
the user.

## What stays in this session

A dispatched agent's processes die when that agent finishes. Anything long-running
— a benchmark, a full suite, a measurement run, a watcher — belongs in the session
that stays alive, no matter how appealing it is to hand off the waiting. Dispatch
the work that produces a result; keep the work that produces it *over time*.

## Red flags

| About to | Instead |
|---|---|
| Dispatch pieces that might fix each other | Step 1 — that is one piece |
| Let two writers share a checkout | Step 2 — one worktree each |
| Run `git worktree add` yourself | Step 2 — the CLI derives the path; raw git breaks list and removal |
| Type a worktree path from memory | Step 2 — read `path` from the CLI's JSON |
| Work around a CLI failure by hand | Report blocked; a failing CLI is a real problem, not a detour |
| Send a card that references "the file we discussed" | Step 3 — absolute paths, pasted text |
| Accept because the report says tests passed | Step 4 — run them yourself, from outside |
| Skip the acceptance check because you know what was built | Step 4 — that knowledge is the bias |
| Overrule a rejection because it looks wrong to you | Step 4 — evidence, or send it back |
| Merge everything at once and run the checks once | Step 5 — one at a time |
| Hand a long benchmark to a subagent | It dies with the agent — run it here |
| Say sequential is safer | It is slower; independence is what makes parallel safe |
