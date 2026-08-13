# Vault Presets

Each preset is a paired starter that `init-vault` reads as **one-shot
authoring guidance**:

- `<preset>/AGENTS.md` — agent runtime contract (rules, thresholds, taxonomy, language policy, schema authority baseline)
- `<preset>/SCHEMA.md` — domain schema (note types, frontmatter fields, body templates, Visual Guidance)

The LLM uses presets to understand the canonical shape of a domain's
contract, then **authors** the user's vault AGENTS.md + SCHEMA.md with
their actual values. Presets are NOT stamping templates. See
`references/bootstrap-workflow.md` for the full 11-step authoring flow.

## Available presets

| Preset | Best for | Key types | Raw Source |
|---|---|---|---|
| `minimal` | Empty scaffold; user authors types from scratch | (none — TODO) | not declared |
| `llm-wiki` | Karpathy-style second brain | Source / Entity / Synthesis / MOC / Decision / Log | adopted |
| `news` | News pipeline with daily / weekly aggregates | Article / DailyAggregate / WeeklyAggregate / Topic | adopted |
| `project-tracker` | Tasks / milestones / decisions for project work | Task / Milestone / Decision / Sprint / Project | not adopted |

## Placeholder markers in presets

Markers like `<YYYY-MM-DD>`, `<Vault Name>`, `<Vault Scope>`,
`<QMD Collection>` show the LLM where the user's actual values go when
authoring. The LLM writes real values directly — never leave these as
literal strings in the user's vault.

`<TODO ...>` markers signal sections the LLM should either (a) ask the
user about during init-vault and write real content, or (b) leave intact
in the user's vault if the user explicitly defers. Default: ask.

## Schema Authority baseline

Every preset's AGENTS.md ships the same `## Schema Authority` section —
the 6 rules that define how agents treat SCHEMA.md as authority. These
are byte-identical across presets (locked by test) so agent behavior
stays consistent regardless of which preset bootstrapped the vault.
Domain-specific operational policy (taxonomy, audit thresholds, language
policy) varies per preset and per vault.
