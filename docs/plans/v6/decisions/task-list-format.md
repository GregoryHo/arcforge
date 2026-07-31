# D3 — task list format (frozen, v1)

Status: **frozen in P1**. Owner: `scripts/lib/task-list.js` (engine side, per D8).
Consumers: `looping` (P6 skill), `scripts/lib/loop.js` (P2 shell), `task-list`
(P6 skill). Changing the grammar after P1 means bumping the banner version and
updating the parser + this file in the same commit.

## Why a markdown checkbox list

D3 keeps looping and drops the DAG. The task list is the loop's only state, so
it has to survive the two things that kill in-memory state: a `/compact` inside
a session, and the session ending entirely. A plain file in the repo survives
both, is diffable, is editable by a human mid-run, and needs no engine to read.

It also has to be readable by a **fresh subagent with zero context**. That is
the constraint that shapes the grammar: the file explains its own notation in a
banner, so a worker that has never seen this project can open it and know what
`[~]` means without being told.

## Grammar

```markdown
# Tasks: parser rewrite

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked. Every task has a stable id (`T1`, `T2`, …) that is
> never renumbered or reused. An indented `verify:` line is the command that
> proves the task done; a `note:` line explains a block. Edit markers in place —
> this file is the only state.

- [x] T1 — Write the failing test
  - verify: `npm run test:scripts`
- [~] T2 — Implement the parser
- [ ] T3 — Wire it into the loop
  - verify: `npm test`
- [!] T4 — Publish
  - note: waiting on release credentials
```

Rules:

| Element | Rule |
|---|---|
| Banner | A blockquote line matching `> arcforge task list v<N>` must be present. It is the self-description contract and the format version. |
| Task line | `- [<marker>] <id> <text>`, optionally `— ` / `- ` / `: ` between id and text. |
| Marker | Exactly one of `` (space) = pending, `~` = in-progress, `x` = done, `!` = blocked. Any other marker is an error, not a fifth state. |
| Id | `T` followed by digits, unique in the file, stable for the task's whole life. Gaps are fine (a deleted task does not renumber its neighbours). |
| `verify:` | Optional, indented under its task. The command that decides done — the loop runs it rather than asking the model whether it finished. |
| `note:` | Optional, indented under its task. **Required** when the marker is `!`: a block with no stated reason is unactionable. |
| Title | Optional `# ` heading on the first non-empty line. |
| Nesting | Not in v1. An indented checkbox is an error, not a subtask — sub-structure belongs in a separate list, so the loop never has to decide whether a parent is done. |

## Decisions worth not re-litigating

- **Four states, no more.** `pending / in-progress / done / blocked` is the
  minimum that lets a loop resume: it must distinguish "not started" from
  "someone is on it" (crash recovery) and "cannot proceed" from "not yet"
  (stop condition). A fifth state has to earn its place against that test.
- **`verify:` is a nested bullet, not a table column.** A checkbox list cannot
  also be a table; markdown gives you one or the other. The bullet keeps the
  scannable checkbox shape and lets the field be optional per task.
- **Ids are prefixed and stable, not positional.** Line numbers move; a loop
  that addresses tasks by position corrupts the file the moment a human inserts
  one. `updateTaskStatus` looks tasks up by id and rewrites only the marker.
- **The parser is strict.** A malformed checkbox line throws with the line
  number and the expected shape rather than being skipped. A silently ignored
  task is a task the loop never runs — the worst possible failure for a file
  that IS the state.
- **No status metadata beyond the marker.** No timestamps, owners, or priorities
  in v1. They are all recoverable from git history, and every field added is a
  field the model has to maintain correctly under compaction.

## API (`scripts/lib/task-list.js`)

```
parseTaskList(content)              → { version, title, tasks[] }   throws on malformed lines
validateTaskList(content)           → same, plus semantic rules     throws on banner/id/blocked violations
updateTaskStatus(content, id, next) → new content string            throws on unknown id or status
TASK_STATUSES                       → ['pending','in-progress','done','blocked']
```

`tasks[]` entries: `{ id, status, text, verify, note, line }` (`line` is 1-based,
for error messages). `updateTaskStatus` is a pure string transform — everything
except the one marker character is preserved byte for byte, so a human's
comments, ordering, and formatting survive an automated run.
