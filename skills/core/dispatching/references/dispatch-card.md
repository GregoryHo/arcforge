# Dispatch Card

The text you paste into a dispatched agent. Four sections; keep the headings
verbatim so the agent can navigate the brief without reading it end to end.

## Template

```
You are handling one piece of work: <one sentence, this piece only>.

## Your authority

You own this piece end to end. Execute it fully — write the tests, make the
change, verify it, and finish — without asking for approval between stages.
Do not wait for acknowledgment; nobody is going to send one, and the wait is
indistinguishable from being stuck.

Come back only for:
- A genuine blocker outside this piece's scope or outside your authority.
  Design preferences, ordering, and implementation choices are yours to make.
- A merge conflict. Never resolve one yourself — report the conflicting hunks
  verbatim and wait.
- Completion: what you did, what you changed, and what you verified.

Progress updates between stages are neither needed nor read.

## Your workspace

Work in <absolute-worktree-path>. Every path below is absolute; nothing in
this brief resolves against your current directory.

Files you own: <absolute paths>
Files you must not touch: <absolute paths, or "everything else">

## Acceptance criteria

<pasted verbatim from wherever they were written — not paraphrased, not
summarized. These are what your work will be judged against.>

## Return this

- Root cause or approach taken
- Files changed, with absolute paths
- The verification command you ran and its raw output
- Any criterion you could not satisfy, and why
```

## Why the authority section is not optional

A dispatched agent is more cautious than an interactive one. Asking a question
interactively is free — the user answers in seconds. Asking it from a dispatch
costs a round trip, and a cautious agent frequently does not ask at all: it stops
and waits. Without an explicit grant, that stop is the single most common way a
dispatched piece produces nothing.

The section is the written form of what a user says out loud when they hand over
a task: just run it, don't check in with me.

## Do not add ownership contracts

Resist the urge to add "here are the files another agent might touch, coordinate
with them". Cross-piece conflicts are resolved when they occur, at merge time.
Predicting them in the brief costs paragraphs of the agent's attention and is
wrong often enough to mislead.

## Retry after a rejection

A retry is a fresh dispatch, not a conversation. Prepend one section above
`## Your authority` and leave the rest of the card unchanged:

```
## Previous attempt feedback

The previous attempt was rejected for the reasons below. Address every item.

<the rejection, verbatim — see references/acceptance.md for what it contains>

The branch already carries the previous attempt's commits. Build on top of them
or revert them and start fresh, whichever is less work — that call is yours.
```

Carry **all** prior feedback forward, cumulatively: a third attempt gets the
first and second rejections. The retrying agent remembers nothing.

Vague feedback produces a worse retry than no feedback at all, because it encodes
your uncertainty into the agent's brief. If the rejection reads "not quite right,
please fix", do not send it — rewrite it first.
