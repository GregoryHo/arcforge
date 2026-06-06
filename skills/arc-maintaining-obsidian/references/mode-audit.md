# Mode: Audit (operational details)

Pipeline:

```
LINK → LINT → GROW
```

Invoke with `audit link`, `audit lint`, `audit grow`, or no argument for all three. Every audit sub-command produces a typed audit report at `_audits/audit-YYYY-MM-DD-<scope>.md` so future sessions can reference past results. Read `audit-checks.md` for the full mechanical primitives (LINK / LINT / GROW algorithms, vault-declared LINT extensibility, Source Drift, EVOLVE patterns).

## LINK — Resolve Relationships

Scan notes with plain-text `## Relationships` sections. For each mention, search vault for matching titles/aliases. Replace with `[[wikilinks]]`, add backlinks to targets, update MOCs (if the vault declares them).

**Single-file mode (`audit link --file=<path>`)** runs on one note only — used by ingest's `--link` flag.

Only LINK modifies existing notes. LINT and GROW never modify.

## LINT — Health Check

Mechanical primitives (schema compliance, orphan detection, untyped notes, tag hygiene, Source Drift, EVOLVE pattern detection) live in `audit-checks.md`. The audit pipeline applies them and then layers vault-declared LINT from SCHEMA.md `## Tag Taxonomy` / `## Audit Thresholds` / type-specific validation rules. The skill never invents thresholds the vault hasn't declared.

**Verify before fix:** LINT findings are hypotheses, not facts. Before fixing any reported issue, read the actual file. Common false positive: YAML multi-line lists (`tags:\n  - a\n  - b`) look empty to line-by-line extraction but contain values on indented lines. Always verify frontmatter by reading the file, not by trusting extraction output.

**Broken wikilink resolution:**

- **Has Raw Source backing** → create the entity via ingest (the link reflects real knowledge).
- **No Raw Source, referenced from 3+ notes** → flag for user decision.
- **No Raw Source, referenced from 1-2 notes** → convert to plain text (preserves relationship without creating unsourced stubs).

Never create stub entity notes without source backing.

LINT generates/updates `index.md` in vault root — organized per vault-declared note types. This is what query mode reads first in Orient.

## GROW — Gap Analysis

Read `audit-checks.md` for generic gap patterns. Vault AGENTS.md / SCHEMA.md declare the thresholds — honor those.

**Internal** suggestions create artifacts when patterns exceed declared thresholds. **External** suggestions investigate topics (thin coverage, open questions in Synthesis notes, stale topics).

GROW proposes — never auto-creates, never auto-fetches. User approves, then ingest mode creates.

## Batch Mode

Default: 50 most recently modified notes. Full scan: `--all`. Report scope at start.

## Audit Report

Save as typed vault note at `_audits/audit-YYYY-MM-DD-<scope>.md`. The vault SCHEMA.md may declare an `audit-report` type with vault-specific extensions. Generic shell:

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
```
