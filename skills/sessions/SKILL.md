---
name: sessions
description: Continuity across a break in context. Use when a session is ending or being handed over, when you are stopping mid-task for the day, when picking work back up from an earlier handover note, or when a long session is filling up and you are deciding whether to compact.
---

# Sessions

Context stops being available two ways: the session ends, or it gets compacted.
Both lose the same thing — everything that was only ever in the conversation — and
both are answered the same way, by getting that content onto disk first.

A handover is written for a reader who was not here — the next session, tomorrow's
you, a teammate. What they can reconstruct from the repo stays out of it. What they
cannot — why it stopped, what was decided and against what, which parts have been
proven and which only look finished — is the whole content.

Every step below carries a completion criterion. Do not start the next one until
the current one is checked off.

## Writing a handover

### Step 1 — Establish what is actually verified

Run the project's test or build command in this working tree and read the result.
Then put every piece of work in flight into one of three states: **verified** by a
run you just watched, **written but never exercised**, or **not started**.

A green suite is evidence about the code the suite covers and nothing else. Work
that no test touches is unverified however green the run was, and an untested file
that reads as complete is the single thing a handover most often gets wrong.
Second-hand status counts the same way: work someone described as finished is
verified when a run says so and not before.

- [ ] Done when the suite has been run here and every piece of work in flight carries one of the three labels.

### Step 2 — Write the file

Write `.handovers/<YYYY-MM-DD>-<slug>.md`, every slot filled:

```markdown
# <what this work is> — <YYYY-MM-DD>

## Where it stands
<branch, and the one-line state of the work>
<the command that was run and its exact result>

## Done
- <what works> — verified by <command and its result>

## Unfinished
- <what is not done> — <written but untested | blocked by X | not started>

## Decisions
- <what was decided> — because <reason>; rejected <alternative>

## Next
1. <the next action, as a command to run or a named file to change>
```

A slot with nothing in it gets the word `none`. Deleting the heading instead reads
as an omission, and the reader cannot tell which one it was.

The file is an ordinary project file: commit it when the handoff is to someone
else, ignore it when it is to yourself tomorrow.

- [ ] Done when the file exists at that path, no slot holds a placeholder, and the user has been told the path and the next action.

## Resuming from a handover

### Step 1 — Read it, then check it against the repo

Read the newest file in `.handovers/`, or the one the user named, end to end. It
describes the repo as it was when the writer stopped, so check the claims that
decide what happens next: the branch, whether the Next action already landed, and
whether the suite still returns what the file records.

- [ ] Done when the file has been read whole and every item under Where it stands and Next has been checked against the repo as it is now.

### Step 2 — Present, then stop

Report where the work stands, the next action, and every point where the repo
disagrees with the file. Then wait. The plan in a handover is someone else's until
the user confirms it.

- [ ] Done when the state, the next action, and any contradictions are on screen and nothing has been changed since.

## Compacting mid-session

Compaction keeps a summary and drops the transcript. So the question is never "is
context large?" — it is **is everything I would regret losing already on disk?**
Compact at a seam, after state is persisted; never mid-task, when context is the
only place a decision lives.

### Persist first

Work these in order before proposing or issuing a compaction. A step is done when
a file says so, not when the work feels captured.

1. Write down every decision made this session.
   - [ ] Done when each decision that would change later work exists in a file — a design note, the task list, or the code itself.
2. Write down the state of the work in progress.
   - [ ] Done when the task list shows what is finished, in progress, and blocked, and each blocked entry carries its reason.
3. Name the next action in the compaction instruction itself.
   - [ ] Done when the instruction carries a focus line, e.g. `/compact Focus on wiring the parser into the loop; the design is in docs/plans/parser.md`.

An un-persisted decision is the one real blocker. If step 1 or 2 cannot be
finished, do not compact — spend the remaining context writing it down. Losing a
decision costs more than a cramped context window does.

### When to compact

| Situation | Compact? | Why |
|---|---|---|
| Exploration finished, findings written to a file | Yes | The reading is bulky; the file is the distilled result |
| Task list written, execution about to start | Yes | The list is the state; the discussion that produced it is not |
| A long debugging detour just ended | Yes | Failed hypotheses and traces pollute unrelated work |
| An approach was abandoned | Yes | Dead-end reasoning costs context and invites relitigating it |
| Mid-edit, changes partially applied | No | Paths, names, and half-applied intent live only in context |
| A decision was made and written nowhere | No | Persist it — then this row becomes a Yes |
| Tests just failed, diagnosis still in context | No | You would re-derive it from zero |

### What survives

| Survives compaction | Lost |
|---|---|
| Files on disk, the task list among them | The conversation transcript |
| Git state: commits, branches, working tree | Tool calls and their output |
| Project instructions and skills (re-loaded) | Contents of files you read but did not act on |
| The focus line passed to the compaction | Preferences the user stated in conversation |

Anything in the right column that matters must be moved to the left column before
compacting — that is what Persist first does. Afterwards, re-read what the next
phase needs; a file read once is not still in context.

### The compaction indicator

At tool-count thresholds a hook emits one line naming the count and the phase it
observed (`mostly reads`, `active implementation`, `mixed work`). It reports a
boundary, it does not decide one, and it fires on a counter that knows nothing
about whether your decisions are on disk yet. Read it as a prompt to run the table
above. During active implementation the answer is usually "not yet".

## Red flags

| About to | Instead |
|---|---|
| Compact because the indicator fired | Answer the table — the indicator observes, it does not decide |
| Compact while holding a decision that exists nowhere else | Write it down first |
| Compact mid-edit to free up room | Finish or commit the edit first |
| Issue a bare compaction with no focus line | Name the next action in the instruction |
| Resume from a file you read before compacting | Re-read it |
| Narrate what happened this session, in order | Report the state now — the sequence is what the transcript was for |
| Mark work done because the code is written, or because someone said it was | Done means a run you watched; otherwise it goes under Unfinished as untested |
| Offer "all tests pass" as the verification status | Say what the suite covers — untested work is unverified under a green run |
| Leave a decision out because the reasoning felt obvious | Record the rejected alternative; without it the reader reopens a settled question |
| Write "continue the refactor" under Next | One action, as a command to run or a named file to change |
| Drop a slot that has nothing in it | Write `none` — an absent heading reads as forgotten |
| Paste the transcript or the diff into the file | Both are reconstructable; the handover exists for what is not |
| Start working right after reading a handover | Present the state and wait for the user to confirm the plan |
