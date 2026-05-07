---
type: schema
created: <YYYY-MM-DD>
scope: type definitions for <Vault Name>
preset: minimal
---

# <Vault Name> — Domain Schema

This file declares this vault's **data shape and domain policy**: note types, frontmatter, body structure, tag taxonomy, thresholds, and type-specific validation rules. The companion `AGENTS.md` declares the thin runtime contract: scope, paths, language policy, integration capabilities, and schema authority.

The skill `arc-maintaining-obsidian` reads both files at Domain Contract
Orientation. Generic Raw Source primitives (sha256 hashing, extraction
methods) live in the skill's `references/page-templates.md` and are
referenced from preset SCHEMAs that adopt the Raw Source pattern.

This is the **minimal** preset — no types are declared. Author each type
as a `## <TypeName>` section below.

## Universal Frontmatter (suggested baseline)

If you adopt typed notes, every note typically has at least:

```yaml
---
type: <one of the types declared below>
created: YYYY-MM-DD
tags: []
aliases: []
---
```

Vault may extend this baseline (e.g., `langs: [en, zh]` for bilingual,
`status:` for stateful types).

## Note Types

<TODO: declare each note type your vault uses. For each, specify:
- Frontmatter fields (universal + type-specific)
- Body template (sections users should fill in)
- Visual Guidance — when to embed images / Mermaid / Canvas / Excalidraw

Example skeleton (copy, customize, and add a new section per type):

```
## TypeName

```yaml
---
type: typename
created: YYYY-MM-DD
tags: []
aliases: []
---
```

```markdown
# Title

[Body template — sections the user fills in.]
```

### Visual Guidance — TypeName

- **Embed:** when to embed images.
- **Mermaid:** when to add a relationship diagram.
- **Canvas:** when to use Obsidian Canvas.
- **Excalidraw:** when to delegate to arc-diagramming-obsidian.
```

When you've added at least one type, ingest mode can classify and create
notes against this schema.>

## Tag Taxonomy

<TODO: list 10-20 top-level tags that organize this vault. Sub-tag convention: `<top-level>/<sub>` (e.g., `project/area`).>

LINT checks for this vault:
- Unknown top-level tags → flag.
- Tags used repeatedly but missing from the taxonomy → EVOLVE suggestion.
- Near-duplicate tags → flag.

## Audit Thresholds

<TODO: declare thresholds before relying on audit behavior. The skill does not invent numbers.

Common examples:
- Index size: `index.md` section > N notes → group by tag/type/topic.
- MOC/map trigger: total typed notes > N → suggest creating a map/index note.
- Log rotation: `log.md` > N entries OR > N KB → rotate.
- Stale detection: typed notes older than N days without updates.
- GROW thresholds: notes-without-synthesis count, mentions-without-entity count, notes-without-map count.>

## Domain Rules

<TODO: declare any creation thresholds, split/archive rules, citation rules, status enums, or type-specific validations that audit/ingest should honor.>

## Bilingual Format (delete if monolingual)

<TODO: if AGENTS.md `## Language Policy` declares bilingual, define the
callout structure here. Otherwise delete this section.

Standard Obsidian bilingual pattern:
- Frontmatter includes `langs: [en, zh]` (or your two language codes).
- H1 is bilingual outside callouts: `# 中文標題 / English Title`.
- Each language version wraps in `> [!multi-lang-{code}]` callout.
- No content between callouts — shared content (frontmatter, H1) goes
  before all callouts.
- Wikilinks point to the same file (no language suffix).

Raw Sources (if adopted) are NOT bilingual. Audit reports are internal
English. Frontmatter values stay canonical (English).>

## Audit Report (vault extension, optional)

The skill ships a generic audit-report shell in
`references/page-templates.md`. If you want to add vault-specific
sections (e.g., paper-claim conflicts, sprint retrospectives), declare
the extended `audit-report` type here.
