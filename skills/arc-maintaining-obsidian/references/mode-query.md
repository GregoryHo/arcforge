# Mode: Query (operational details)

Pipeline:

```
Orient → Search → Read → Synthesize → (File Back)
```

## Orient

Read `<vault>/index.md` for the vault map. If none exists, suggest: *"No index — run audit lint to generate one."*

## Search

Use the active search route (see `search-strategies.md` Route Selection). Filesystem is the contractual baseline; QMD is hybrid keyword + semantic acceleration when configured; `obsidian-cli search` is a runtime route when the app is open.

## Read

Drill into matching notes. Read frontmatter first (understand type), then content. Follow `sources:` arrays for provenance — every claim should be traceable to a Source / Article / equivalent typed note.

## Synthesize

Answer with inline `[[citations]]`. Every key claim references its source note. Read `search-strategies.md` for output format adaptation (prose, tables, timelines, Marp, Canvas).

**Vault-only answers — including surrounding commentary.** Never fall back to general knowledge, not just in the direct answer but in framing, insights, or comparisons. If the vault has notes on topic A but not topic B, don't fill in B from general knowledge — name the gap: *"Your vault covers A but has nothing on B. Want to add sources for B via ingest?"* Gaps feed the audit GROW cycle.

## File Back

If the answer is substantive (comparison, analysis, discovered connection), suggest filing back: *"This connects several notes in a new way — file as a Synthesis note?"* (Or whichever cross-cutting type the vault SCHEMA.md declares.)

File Back triggers ingest mode internally — same skill, same context, no handoff. Uses Query-as-Ingest (skip Classify).

Always state your file-back decision: either suggest it, or explain why not (e.g., "A Synthesis covering this already exists at [[Note]]").
