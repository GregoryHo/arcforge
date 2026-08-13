---
name: sessions
description: Cross-session continuity for unfinished work. Use when a session is ending or being handed to someone else, when you are stopping mid-task for the day, or when picking work back up from an earlier session's handover note.
---

# Sessions

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

## Red flags

| About to | Instead |
|---|---|
| Narrate what happened this session, in order | Report the state now — the sequence is what the transcript was for |
| Mark work done because the code is written, or because someone said it was | Done means a run you watched; otherwise it goes under Unfinished as untested |
| Offer "all tests pass" as the verification status | Say what the suite covers — untested work is unverified under a green run |
| Leave a decision out because the reasoning felt obvious | Record the rejected alternative; without it the reader reopens a settled question |
| Write "continue the refactor" under Next | One action, as a command to run or a named file to change |
| Drop a slot that has nothing in it | Write `none` — an absent heading reads as forgotten |
| Paste the transcript or the diff into the file | Both are reconstructable; the handover exists for what is not |
| Start working right after reading a handover | Present the state and wait for the user to confirm the plan |
