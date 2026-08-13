# obsidian-cli Quirks

Operational footnotes for `obsidian:obsidian-cli`. Read once on the
first CLI call per session, then trust your memory.

## Path arguments — `file=` vs `path=`

- `file=` — name-based, like wikilinks. Use for notes whose titles
  contain special characters (slashes, accents).
- `path=` — clean filesystem path. Use only when you can guarantee a
  conventional path with no surprises.
- **Never use `file=` with `create`** — it's silently ignored and the
  CLI writes `Untitled.md`.
- For subfolder placement: `obsidian create path="folder/My-Note.md" content="..."`.

## SIGPIPE

Never pipe `obsidian read` through `head` / `tail` / `grep -m`. The CLI
doesn't handle SIGPIPE and the process hangs. Read the whole note,
filter in memory.

## Daily Notes plugin detection

On first session use, check whether the Daily Notes plugin is configured:

```
obsidian eval code="app.internalPlugins.plugins['daily-notes']?.instance?.options?.folder"
```

If Obsidian is closed or unconfigured, skip `obsidian daily:append`
silently and write to the vault's `log.md` only. Daily Notes append is
a best-effort side effect for human browsing — never a contractual
write target.

## When obsidian-cli is unavailable

Ordinary vault maintenance (Markdown read, write, index, log) must work
with Obsidian closed. If `obsidian-cli` is missing or the app isn't
running, fall back to filesystem tools and warn once that LINK
resolution and live search will degrade.

## Plugin-managed folders

Detect dynamically rather than hard-coding:

```
obsidian eval code="app.plugins.plugins['<id>'].settings.scriptFolderPath"
```

Common case: the Excalidraw plugin's script folder. Audit LINT excludes
plugin-managed folders so plugin scaffolding doesn't pollute the
schema-compliance report.
