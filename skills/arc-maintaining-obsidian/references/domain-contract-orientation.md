# Domain Contract Orientation

Read this before entering any vault-level mode (ingest / query / audit).
Orientation tells the skill what types exist, which language to use,
which thresholds apply, and whether QMD or Obsidian runtime are
configured. It is the bridge between the generic skill and the vault's
own policy.

## Read order

1. Read `<vault>/AGENTS.md` — thin runtime contract: scope, language policy, raw-source adoption, integration capabilities, schema authority meta-rules.
2. Read `<vault>/SCHEMA.md` — domain schema and policy: note types, frontmatter fields, body templates, Visual Guidance per type, tag taxonomy, creation thresholds, audit/GROW thresholds.
3. If AGENTS.md declares an index path and the current mode is `query` or `audit lint`, read `<vault>/index.md`. Skip on `ingest` until the Index step needs it.
4. If AGENTS.md declares a log path, read the **last 5 lines** of `<vault>/log.md` for orientation. Bump to the **last 30 lines** only when explicitly auditing log consistency.

## Sticky session caching

AGENTS.md and SCHEMA.md are **sticky for the session**. After the first
read, reuse the loaded contract for subsequent invocations on the same
vault unless:

- The user passes `--reload-contract` explicitly, or
- The file's mtime has changed since the cached read.

This avoids paying the orientation cost on every turn of a multi-turn
`query` session. `index.md` and `log.md` are NOT sticky — they're read
fresh per mode, but only when the mode actually needs them.

## Authority

Treat AGENTS.md + SCHEMA.md as authoritative. The skill's `references/`
files are mechanism only; the vault contract wins where they overlap.

## Missing-file handling

The two contract files are paired and required for mutating modes:

| Missing | Bare invoke / `query` / `help` | `ingest`, `audit` (mutating) |
|---|---|---|
| **AGENTS.md missing** | Allow with warning: "vault has no AGENTS.md — running with skill defaults only." Bare invoke prints stub orientation (registry entry only). | **Block.** Suggest: run `init-vault <path> --name <name> --preset=<name>` or author the contract manually. |
| **SCHEMA.md missing** | Allow with warning: "vault has no SCHEMA.md — type-aware behavior degraded." | **Block.** Without SCHEMA.md the skill can't classify (ingest) or validate schema compliance (audit). |
| **AGENTS.md ↔ SCHEMA.md conflict** | Stop and ask the user before any mode runs. Per AGENTS.md schema authority rules, conflicts are not auto-resolved. | Same — block until user clarifies. |
