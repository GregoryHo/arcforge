# `arcforge session` reference

What each command does, what it writes, and what it refuses. The steps that
decide when to run one are in `SKILL.md`.

## Saving

```bash
arcforge session save <alias> --from .handovers/<YYYY-MM-DD>-<slug>.md
```

The archive is an engine-written metrics header — duration, tool calls, user
messages, files modified — followed by the five sections verbatim. It holds none
of the user's message text. Each save writes a new `archive-<alias>-<UTC stamp>.md`;
no archive is ever overwritten.

## What the engine refuses

On each of these it exits non-zero and writes nothing:

| Refusal | Fix |
|---|---|
| A section is missing, empty, out of order or extra | Fix the handover file |
| The alias is not letters, digits, `-` and `_` (at most 128), or begins with `-` | Pick another name |
| `alias "<name>" already exists — pass --force to overwrite it` | Pick another name |

`--force` moves only that alias to the new archive; the old archive stays on
disk and keeps any other aliases it had. Pass it only when the user has said to.

`arcforge session resume` refuses an archive in v5's format (`Summary`,
`What Worked`, ...) with `the v5 session archive format ... is not supported`;
there is no converter.

## Finding and naming archives

`arcforge session list` prints this project's archives, newest first: date,
aliases, title, path. `--limit N` caps it, `--json` is for parsing.

`arcforge session alias set <name> <archive-path>` gives an existing archive
another name (`--force` to repoint a name in use), `alias remove <name>` drops a
name and keeps the archive, and `alias list` shows every name with its archive.
