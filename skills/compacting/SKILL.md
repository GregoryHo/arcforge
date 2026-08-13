---
name: compacting
description: Compaction timing at workflow seams. Use when a compaction indicator fires, a long session is filling up with context, or work is crossing from one phase into the next.
---

# Compacting

Compaction keeps a summary and drops the transcript. So the question is never
"is context large?" — it is **is everything I would regret losing already on
disk?** Compact at a seam, after state is persisted; never mid-task, when
context is the only place a decision lives.

## Persist first

Work these in order before proposing or issuing a compaction. A step is done
when a file says so, not when the work feels captured.

1. Write down every decision made this session.
   - [ ] Done when each decision that would change later work exists in a file — a design note, the task list, or the code itself.
2. Write down the state of the work in progress.
   - [ ] Done when the task list shows what is finished, in progress, and blocked, and each blocked entry carries its reason.
3. Name the next action in the compaction instruction itself.
   - [ ] Done when the instruction carries a focus line, e.g. `/compact Focus on wiring the parser into the loop; the design is in docs/plans/parser.md`.

An un-persisted decision is the one real blocker. If step 1 or 2 cannot be
finished, do not compact — spend the remaining context writing it down. Losing
a decision costs more than a cramped context window does.

## When to compact

| Situation | Compact? | Why |
|---|---|---|
| Exploration finished, findings written to a file | Yes | The reading is bulky; the file is the distilled result |
| Task list written, execution about to start | Yes | The list is the state; the discussion that produced it is not |
| A long debugging detour just ended | Yes | Failed hypotheses and traces pollute unrelated work |
| An approach was abandoned | Yes | Dead-end reasoning costs context and invites relitigating it |
| Mid-edit, changes partially applied | No | Paths, names, and half-applied intent live only in context |
| A decision was made and written nowhere | No | Persist it — then this row becomes a Yes |
| Tests just failed, diagnosis still in context | No | You would re-derive it from zero |

## What survives

| Survives compaction | Lost |
|---|---|
| Files on disk, the task list among them | The conversation transcript |
| Git state: commits, branches, working tree | Tool calls and their output |
| Project instructions and skills (re-loaded) | Contents of files you read but did not act on |
| The focus line passed to the compaction | Preferences the user stated in conversation |

Anything in the right column that matters must be moved to the left column
before compacting — that is what Persist first does. Afterwards, re-read what
the next phase needs; a file read once is not still in context.

## The compaction indicator

At tool-count thresholds a hook emits one line naming the count and the phase
it observed (`mostly reads`, `active implementation`, `mixed work`). It reports
a boundary, it does not decide one, and it fires on a counter that knows
nothing about whether your decisions are on disk yet. Read it as a prompt to
run the table above. During active implementation the answer is usually "not
yet".

## Red flags

| About to | Instead |
|---|---|
| Compact because the indicator fired | Answer the table — the indicator observes, it does not decide |
| Compact while holding a decision that exists nowhere else | Write it down first |
| Compact mid-edit to free up room | Finish or commit the edit first |
| Issue a bare compaction with no focus line | Name the next action in the instruction |
| Resume from a file you read before compacting | Re-read it |
