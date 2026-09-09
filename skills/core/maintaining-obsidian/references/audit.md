# Audit: LINK / LINT / GROW

Read before running an audit. Invoke as `audit link`, `audit lint`, `audit grow`,
or bare for all three. Default scope is the 50 most recently modified notes;
`--all` scans everything. Report the scope before starting.

This file holds the **mechanical** primitives — the checks that work on any
Obsidian vault. Every threshold ("what is stale", "which tags are allowed", "how
many notes before a map-of-content is warranted") is declared per vault in
`SCHEMA.md`. Where the vault declares none, report the observation instead of
inventing a number.

## What to scan, what to skip

The auditor works on the **wiki layer**: typed Markdown notes with frontmatter,
as declared by the resolved vault's `SCHEMA.md`. Skip:

- **Plugin-managed folders.** Detect dynamically, don't hard-code:
  `obsidian eval code="app.plugins.plugins['<id>'].settings.scriptFolderPath"`.
  The Excalidraw plugin's script folder is the common case.
- **Raw Sources** (`.html`, `.pdf`, `.png`, `.jpg`, `.canvas`). Subject to the
  Source Drift check and to un-ingested detection, not to schema compliance.
- **Excalidraw drawings stored as `.md`** — identified by `excalidraw-plugin: parsed`
  in frontmatter. Skip in LINT, exclude from the index.
- **Folders the vault's AGENTS.md declares out of scope.**

Hand each skipped folder to the LINT script as `--skip <folder>`. On its own the
script leaves out only dot-dirs, Excalidraw drawings, and the root contract
files (AGENTS.md, SCHEMA.md, CLAUDE.md, README.md, index.md, log.md). A `.md` note
that carries `sha256` but no `type:` is a Raw Source to the script: it is
drift-checked and never counted as untyped, so `Raw/` needs no `--skip`.

## LINK — resolve relationships

The only sub-check that modifies existing notes.

1. Find notes whose `## Relationships` section is still plain text (no `[[`).
2. Search the vault for each mention on the active search route. A semantic route
   resolves mentions whose wording differs from the title ("Karpathy's wiki idea"
   → `LLM-Wiki-Mechanism`); a keyword-only route needs the exact/alias/partial
   cascade in `search-strategies.md`.
3. Replace resolved mentions with `[[wikilinks]]` and append
   `Referenced by: [[source note]]` to each target.
4. Update aggregator notes (map-of-content, Topic, Milestone, DailyAggregate — per
   the vault's SCHEMA.md) whose declared `scope:` or roll-up criteria now match.
5. Collect unresolved mentions and hand them to GROW as candidates.

Single-file mode — `audit link --file=<path>` — runs on one note only; ingest's
`--link` flag uses it.

## LINT — mechanical checks

The deterministic scans run in code. `lint_vault.py` ships in this skill's
`references/` directory — its absolute path came with the skill on the line
reading `Base directory for this skill`; resolve `references/` against that,
never against the user's working directory:

```bash
cd "<base directory>/references"
python3 lint_vault.py <vault> --json                              # default scope: recent:50
python3 lint_vault.py <vault> --scope all --skip _audits --json
python3 lint_vault.py <vault> --field-empty-pct 90 --undeclared-pct 80 --tag-min 10 --title-match 0.8 --json
```

The four threshold flags take the vault's numbers from its SCHEMA.md
`## Audit Thresholds`; each figure in the JSON then carries an `exceeds`
boolean. Omit a flag the vault does not declare and `exceeds` stays `null` —
report the observation instead of inventing a number.

The JSON is the fact base for every check below: `untyped` and
`types.<type>.fields` / `.undeclared` (frontmatter parsed as a block, so a
YAML block list reads as filled), `links.notes` / `links.orphans`,
`raw_sources`, `log.missing_files`, `tags`, and `duplicate_titles`.

**Verify before fix.** Every figure is a hypothesis about a file. Read the
actual file before acting on it.

### Schema compliance

Validate each note's frontmatter against the shape its `type:` declares in the
vault's SCHEMA.md. The script reads the declared fields from SCHEMA.md's yaml
fences: `types.<type>.fields.<field>` counts present / filled / empty per
field, and `types.<type>.undeclared` lists fields the type does not declare.
Obsidian accepts three equivalent list spellings; all are valid and all read
as filled:

```yaml
tags: [arcforge, tdd]     # inline
tags:                     # block
  - arcforge
  - tdd
tags:                     # block, unindented
- arcforge
- tdd
```

### Orphans, untyped notes, log consistency

- **Orphans** — `links.orphans`: zero inbound and zero outbound links, with the
  graph built over the whole vault even when the scope is `recent:N`.
- **Untyped** — `untyped`: no `type:` field; `has_frontmatter` separates a note
  with no frontmatter from one whose frontmatter lacks the field. Report; never
  auto-fix.
- **Log consistency** — `log.missing_files`: `log.md` entries that name files
  which no longer exist. Notes whose `created:` predates any log entry for them
  are a read-through check, not in the JSON.

### Source Drift (sha256)

`raw_sources[]` lists every in-scope note with a `sha256` key: the stored
digest, the digest recomputed per `raw-sources.md`, the `hashed_file` it was
recomputed from, and a `status`. The file hashed is the `source_url` target
when that is a file inside the vault; otherwise a Raw Source note (`sha256`,
no `type:`) hashes its own body, and a typed note — the provenance pair, whose
`source_url` is usually the remote original — hashes the one Raw Source note
its body wikilinks (the news preset's `## Source` line). Then:

| `status` | Action |
|---|---|
| `fresh` | No log line. |
| `drift` | Append `drift \| <filename> \| sha=<old>→<new>` to `log.md` and report it. Informational only. |
| `unhashed` | Compute and write `sha256` + `ingested`. Offer `audit lint --backfill-sha256` for the rest. |
| `unresolved` | A typed note whose original is remote and whose body links no single Raw Source note, so nothing in the vault stands in for it. Re-fetch when fetchable and compare the fetched body by hand; otherwise report it. Never a drift line. |

Drift never auto-fixes the wiki layer — a changed source is a fact for the user
to act on, not a licence to rewrite their note.

### EVOLVE — schema drift

Patterns in actual usage suggesting the vault's own schema should change. These
are observations, not errors; the user decides. The figures come from the JSON;
the cut-off is the vault's, passed as the flag named in the table.

| Check | Fact in the JSON | Flag | Example |
|---|---|---|---|
| Field usage | `types.<type>.fields.<field>.empty_pct`; `types.<type>.undeclared.<field>.present_pct` | `--field-empty-pct`, `--undeclared-pct` | "`source_author` empty in 9 of 10 Source notes" |
| Type fit | Section structure that does not match the declared type — read the notes; not in the JSON | — | "12 Entity notes carry `## Steps` — a tutorial type?" |
| Tag drift | `tags.<tag>.count` with `declared` read from the backticked list items under SCHEMA.md's `## Tag Taxonomy` (a sub-tag counts through its top-level segment); `exceeds` is set for undeclared tags only | `--tag-min` | "`#distributed-systems` used 15× — formalize?" |

### Vault-declared LINT

After the primitives, apply the additional checks the vault's SCHEMA.md declares
and file them under their own named subsections in the report. Categories vaults
commonly declare: index size and split points, map-of-content triggers, log
rotation, tag taxonomy, entity-creation rules, note split-and-archive length,
synthesis citation minimums, staleness windows, and — for paper vaults —
citation-graph gaps, reading-status ageing, and claim consistency.

## GROW — gap analysis

GROW **proposes**. It never creates a note and never fetches a source; the user
approves, then ingest creates.

### Internal — suggest creating an artifact

The skill detects the clustering pattern; the vault declares which types play
leaf versus aggregator and at what count.

| Pattern | The skill detects | The vault declares |
|---|---|---|
| Leaves with no aggregator | A topic cluster of leaf-type notes with no roll-up note | Leaf type, aggregator type, threshold |
| Recurring mention with no note | The same plain-text mention across several notes, with no note for it | Which type absorbs mentions, threshold |
| Cluster with no index | A topic with N+ notes and no map-of-content | Index type, N |
| LINK failures | Mentions LINK could not resolve | (always reported) |

### External — suggest investigation

Thin coverage (a topic resting on 1–2 sources), a concept referenced across
several notes but never explored, open questions listed in the sections the
vault declares for them, and topics unmodified beyond the declared staleness
window.

### Un-ingested Raw Sources

Files with real content and no typed note pointing at them — detection table in
`raw-sources.md`. Runs only for vaults whose AGENTS.md declares
`raw_source: adopted`.

### Duplicate guard

Before proposing any new artifact, check its title against existing notes at
the vault's title-match ratio (`--title-match`) and drop the suggestion when
one matches. `duplicate_titles` in the JSON lists the pairs of existing notes
already at that ratio, with `exceeds` set — a proposal must not add a third.

## The report

Every run writes a typed note to `<vault>/_audits/audit-YYYY-MM-DD-<scope>.md`
so a later session can cite it. The vault's SCHEMA.md may extend the type.

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---

## LINK Results

## LINT Results
### Schema Issues
### Source Drift
### Orphan Notes
### Tag Issues
### Schema Evolution

## GROW Suggestions
### Internal
### External
### Open Questions
```
