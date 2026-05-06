# Vault Presets

Each preset is a paired starter:

- `<preset>/AGENTS.md` — agent runtime contract (rules, thresholds, taxonomy, language policy, schema authority)
- `<preset>/SCHEMA.md` — domain schema (note types, frontmatter fields, body templates, Visual Guidance)

`init-vault <path> --name <name> --preset=<preset>` reads these as
**one-shot authoring guidance** — the LLM uses them to understand the
canonical shape of that domain's contract, then authors the user's vault
AGENTS.md + SCHEMA.md with their actual values. Presets are NOT
stamping templates: placeholder markers like `<Vault Name>` are
pedagogical, not substitution targets. The LLM writes real values
directly and skips sections that don't apply to the user's situation.

## Available presets

| Preset | Best for | Key types |
|---|---|---|
| `minimal` | Empty scaffold; user authors types from scratch | (none — `## Note Types` TODO) |
| `llm-wiki` | Karpathy-style second brain | Source / Entity / Synthesis / MOC / Decision / Log |
| `news` | News pipeline with daily / weekly aggregates | Article / DailyAggregate / WeeklyAggregate / Topic |
| `project-tracker` | Tasks / milestones / decisions for project work | Task / Milestone / Decision / Sprint / Project |

## Placeholder markers in presets (pedagogical, not substitution targets)

Presets contain markers like `<YYYY-MM-DD>`, `<Vault Name>`,
`<Vault Scope>`, `<QMD Collection>`. These show the LLM **where the
user's actual values go** when authoring the vault contract — the LLM
writes real values directly into the new AGENTS.md / SCHEMA.md, not
placeholder strings.

`<TODO ...>` markers in the preset signal sections the LLM should
either (a) ask the user about during init-vault, then write real content,
or (b) leave intact in the user's vault for later editing if the user
explicitly defers (e.g., "I'll fill in the tag taxonomy later"). Never
leave unresolved `<Vault Name>` etc. — those MUST be replaced with the
user's actual name during authoring.

## Choosing a preset

If unsure, pick `minimal` — it's a clean scaffold with all sections marked
TODO. You can author types over time. Domain presets pre-fill the
operational policy and a starter type set; you still adapt them to your
vault's specifics.

Domain presets are starting points, not binding contracts. Karpathy's
LLM-Wiki pattern explicitly says human + LLM **co-evolve** the schema —
divergence between vaults is a feature.

## Schema Authority Baseline

Every preset's AGENTS.md ships with the same `## Schema Authority`
section — the meta-rules that define how agents treat SCHEMA.md as
authority. These rules are the same in every preset so that agents
behave consistently no matter which preset bootstrapped the vault:

- `schema_path: SCHEMA.md`
- Read SCHEMA.md before mutating content.
- SCHEMA.md governs note types and content structure.
- Do not invent new note types unless the user approves or SCHEMA.md is updated.
- If AGENTS.md and SCHEMA.md conflict, stop and ask the user.
- Schema changes require a log entry (and, for major shifts, a version bump in AGENTS.md frontmatter).

Operational policy beyond the baseline (taxonomy, audit thresholds,
language policy) varies per preset and per vault.
