# Compaction reference

Two tables for the question in `SKILL.md`'s *Compacting mid-session*: is
everything worth keeping already on disk?

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
before compacting.
