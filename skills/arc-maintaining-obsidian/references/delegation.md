# Tool Delegation

Read once per session when the skill picks a route. The table below
covers all routing decisions; the prose afterward only matters for
edge cases.

## Routing table

| Concern | Route | Notes |
|---|---|---|
| Filesystem search/read of Markdown | Filesystem tools | Baseline — must always work even with Obsidian closed. |
| Hybrid keyword + semantic + reranking search | `qmd query` | Use only when the registry has `search.qmd_collection` set and the index is healthy. |
| Live Obsidian search | `obsidian-cli search` | Available only when Obsidian is running. Optional secondary route. |
| Active vault detection / Daily Notes append / plugin state | `obsidian:obsidian-cli` | Best-effort runtime side effects. See `obsidian-cli-quirks.md`. |
| Markdown formatting / wikilink-aware edits | `obsidian:obsidian-markdown` if available; otherwise ordinary file edits | Plugin tools optional. |
| Canvas (`.canvas` JSON file) creation | `obsidian:json-canvas` | MOC visualizations, etc. |
| Excalidraw diagrams | `arc-diagramming-obsidian` | User must approve. Never auto-create. |
| URL content extraction | `obsidian:defuddle` | Defuddle first; WebFetch only for raw text / API endpoints. See `page-templates.md` Paper URL chain. |

## Search-route selection

On the first search of a session, read `search-strategies.md` Route
Selection. The QMD route includes optional `qmd update && qmd embed`
after ingest or audit; skip those when QMD is not configured. The
filesystem route is always available; the Obsidian-CLI route is only
useful when the app is actually running.

## Why filesystem is the contractual baseline

Optional integrations (QMD, Obsidian runtime) are acceleration, not
contract. If the user closes Obsidian and turns off QMD, ingest /
query / audit still work — slower but correct. Skill behavior never
becomes undefined when an optional integration is unavailable.
