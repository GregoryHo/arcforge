---
name: arc-maintaining-obsidian
description: Use when the user wants to create, query, audit, or initialize an Obsidian vault — wiki / knowledge base / second brain, project tracker, news pipeline, journal, or any typed-note vault. Trigger on saving notes / capturing ideas / sharing URLs to document; querying the vault ("what do I know about", "search my vault"); auditing health (missing links, orphans, drift); ingesting raw files; "init a new vault" or "register vault"; mentions of any registered vault. Also triggers on casual "save this" / "file this back". Do NOT trigger for Excalidraw diagram creation (use arc-diagramming-obsidian), general code, debugging, PR reviews, web searches.
argument-hint: "help | ingest <url|text> [--batch] [--link] [--vault=<name>] | query <question> [--vault=<name>] | audit [link|lint|grow] [--vault=<name>] | init-vault <path> --name <name> [--preset=<minimal|llm-wiki|news|project-tracker>] | register <path> --name <name> [--default] | list-vaults | unregister <name> | set-default <name>"
---

# arc-maintaining-obsidian

A **vault interface**: the skill resolves which Obsidian vault to operate on, reads that vault's paired contract (`AGENTS.md` runtime contract + `SCHEMA.md` domain schema), and dispatches the requested action. Different vaults serve different domains — wiki / news / project tracker / journal / etc. The skill stays domain-agnostic; presets bootstrap new vaults into a chosen domain.

The skill owns: vault resolution + registry, init-vault bootstrap workflow, generic ingest/query/audit pipelines, mechanical primitives (sha256 hashing, LINK/LINT/GROW algorithms, search routing). Each vault's AGENTS.md + SCHEMA.md owns: types, thresholds, taxonomy, language policy, citation rules.

## Mode Selection

Three universal vault actions. Pick from user intent:

| User Intent | Mode | Pipeline |
|---|---|---|
| Create, save, capture, ingest, "file this back" | **ingest** | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| Ask, search, "what do I know about", query | **query** | Orient → Search → Read → Synthesize → (File Back) |
| Audit, link, lint, grow, "check my vault" | **audit** | LINK → LINT → GROW |

**Bare invocation** (no mode argument, no clear intent) — do **not** ask "which mode?" blindly. Run Domain Contract Orientation first, then respond with what this vault is and what's available. See `references/output-formats.md` for the exact orientation response shape.

Only ask "ingest / query / audit?" when the user's intent words exist but are ambiguous (e.g., "I want to do something with my vault").

### Help

If the argument is `help`, display this summary and stop:

```
arc-maintaining-obsidian — vault interface for Obsidian-based knowledge bases

REGISTRY-LEVEL (manage the vault registry; vault-agnostic):
  help                                Print this help
  list-vaults                         Show registered vaults
  init-vault <path> --name <name> [--preset=<name>]
                                      Bootstrap a new vault from a preset:
                                        minimal | llm-wiki | news | project-tracker
  register <path> --name <name>       Register existing vault [--default sets default]
  unregister <name>                   Remove from registry (files untouched)
  set-default <name>                  Change default vault

VAULT-LEVEL (operate on a resolved vault; respect --vault=<name>):
  ingest <url|text> [--batch] [--link]   Create notes from sources
  query <question>                       Search & synthesize from vault
  audit [link|lint|grow]                 Vault health (LINK + LINT + GROW + vault-declared)

GLOBAL FLAG (any vault-level mode):
  --vault=<name>            Override vault auto-resolution

BARE INVOKE (no mode):
  Run Domain Contract Orientation, then respond with what this vault is
  (name, scope, declared types, last activity) and ask what to do.
```

## Path Convention

All `references/` and `presets/` paths in this file are **skill-relative**. The Skill harness injects the absolute base directory at every invocation (look for `Base directory for this skill: <abs-path>` in your context). Construct absolute paths by prepending that base. The skill never relies on the user's CWD.

## Mode Entry Gate

Every vault-level mode runs **Domain Contract Orientation first**, then loads the mode-specific mechanism reference. The gate is the unified jump table — references load on demand, not eagerly.

| Mode | Order |
|---|---|
| **init-vault** | Exception: read `references/bootstrap-workflow.md` first because no vault contract exists yet; that workflow authors the contract and registers via `${ARCFORGE_ROOT}/scripts/cli.js obsidian register`. |
| **Ingest** | Resolve vault → read `references/domain-contract-orientation.md` → load `references/page-templates.md` for Raw Source / sha256 / extraction mechanisms if AGENTS.md adopts them → at the Visuals step, load `references/visuals-decision-tree.md`. |
| **Query** | Resolve vault → orientation → `references/search-strategies.md` for route selection and output adaptation. |
| **Audit** | Resolve vault → orientation → `references/audit-checks.md` for LINK / LINT / GROW mechanics; apply vault-declared domain policy from SCHEMA.md. |
| Any mode | First obsidian-cli call → load `references/obsidian-cli-quirks.md` once. End of mode → `references/output-formats.md` for completion / blocked templates. |

The `references/` files describe **mechanism**; vault AGENTS.md + SCHEMA.md describe **domain**. The vault contract wins where they overlap.

## Shared Context

### Vault Resolution

The skill supports multiple registered vaults. Resolution cascades:
**explicit `--vault` → active Obsidian → session cache → registry default → ask the user.** Once resolved, the choice is sticky for the session. Read `references/vault-resolution.md` for the full cascade rules + first-run state + Obsidian-not-running fallback.

### Domain Contract Orientation

Before any vault-level mode, read `<vault>/AGENTS.md` (runtime contract) and `<vault>/SCHEMA.md` (domain schema). Both are **sticky for the session** — re-read only on `--reload-contract` or mtime change. `index.md` and `log.md` (last 5 lines for orientation, last 30 for log audits) load on demand per mode. Missing AGENTS.md or SCHEMA.md **blocks mutating modes** (ingest / audit) with an explicit suggestion to run `init-vault` or author the contract manually. Read `references/domain-contract-orientation.md` for read-order details, sticky-session rules, and the missing-file matrix.

### Registry Maintenance

The vault registry lives at `~/.arcforge/obsidian-vaults.json`. **The skill manages this file end-to-end through `${ARCFORGE_ROOT}/scripts/cli.js obsidian <subcommand>` — never hand-edit, never construct JSON manually.** Subcommands: `register`, `unregister`, `set-default`, `list-vaults`. The CLI applies first-becomes-default, atomic write, and file locking. Schema, behavior table, and rationale in `references/registry-maintenance.md`.

### init-vault Bootstrap

When the user runs `init-vault <path> --name <name>` (with or without `--preset=<name>`), the skill drives an 11-step conversation: validate → pick preset → ask minimal questions → **author** AGENTS.md + SCHEMA.md from the preset (do not copy verbatim) → seed index/log → register via the CLI → advertise commands.

**Read `references/bootstrap-workflow.md` before running any step.** That file owns the full workflow including a worked example showing how "author from preset" plays out. Presets are one-shot authoring guidance, not stamping templates.

Available presets: `minimal`, `llm-wiki`, `news`, `project-tracker`. Each ships its paired starter under `presets/<name>/AGENTS.md` + `presets/<name>/SCHEMA.md`.

### Vault Structure — Two Layers

Generic pattern (vault AGENTS.md / SCHEMA.md may extend or replace):

- **Raw Sources** (`Raw/` and format-specific folders) — Immutable originals when the vault adopts the Raw Source pattern. The LLM reads but never modifies these.
- **Wiki / Domain Layer** — Typed notes per the vault's SCHEMA.md.

When a Raw Source is ingested, the original stays where it is; a new typed note is created with `source_url` pointing back. Knowledge flows Raw → Wiki as text. See `references/page-templates.md` for the Raw Source frontmatter schema, sha256 hashing rule, extraction methods, and Paper URL chain.

### Session Log

After every operation, append to `<vault>/log.md`:

```
## [YYYY-MM-DD] <operation> | <detail>
```

Operations: `create | [type] | [filename]`, `query | [question summary]`, `audit | [scope]`, `drift | [filename]`, `init-vault | preset=<preset>`. `log.md` is the contractual operation log; `obsidian-cli daily:append` is an optional best-effort dual-write — see `references/obsidian-cli-quirks.md` for plugin-detection rules and SIGPIPE caveat.

### Delegation

Generic tool-routing table (filesystem baseline, optional QMD acceleration, optional Obsidian runtime, delegated diagram tools). Read `references/delegation.md` for the full routing table + first-search route selection + filesystem-as-contractual-baseline rationale.

## Mode: Ingest

```
Classify → Confirm → Create → Visuals → Index → Propagate → Log
```

Per-step operational detail (Classify rules, Raw Source two-write protocol, Visuals decision tree, Propagate scope guard + contradiction detection, Special Modes — Query-as-Ingest / `--batch` / `--link`) is in `references/mode-ingest.md`. Read it before running any ingest. Pull in `references/page-templates.md` if the vault's AGENTS.md declares `raw_source: adopted`.

Key invariants:

- Write relationships as **plain text**, not wikilinks — audit LINK resolves them later. Honor language policy per AGENTS.md.
- Raw Source ingest is two distinct writes (immutable raw + typed wiki note with `sha256`). Skipping the raw save loses re-extraction ability.
- Propagate caps at 10 related pages per ingest; surplus go to audit. Contradictions surface to the user, never silently overwritten.
- File-back / batch / link-on-create are documented behavioral variants of the same pipeline — see the reference for branching rules.

## Mode: Query

```
Orient → Search → Read → Synthesize → (File Back)
```

Per-step detail in `references/mode-query.md`. Search route selection + output format adaptation in `references/search-strategies.md`.

Key invariants:

- **Vault-only answers — including surrounding commentary.** Never fall back to general knowledge in framing, insights, or comparisons. Name gaps explicitly so they feed audit GROW.
- Every key claim cites its source note inline `[[Like-This]]`. Provenance follows `sources:` arrays.
- File Back triggers ingest internally (Query-as-Ingest, skip Classify) — same skill, no handoff. Always state your file-back decision: suggest, or explain why not.

## Mode: Audit

```
LINK → LINT → GROW
```

Per-step detail in `references/mode-audit.md`. Mechanical primitives (schema compliance, orphan / untyped / tag checks, Source Drift via sha256, EVOLVE patterns, GROW Internal/External gap detection, vault-declared LINT extensibility) in `references/audit-checks.md`.

Key invariants:

- **Only LINK modifies existing notes.** LINT and GROW never modify.
- **Verify before fix.** LINT findings are hypotheses; read the actual file before acting (common false positive: YAML multi-line lists look empty to extractors but contain indented values).
- **Never create stub entity notes without source backing.** Broken wikilink resolution: has Raw Source → create via ingest; 3+ refs no source → flag for user; 1–2 refs no source → convert to plain text.
- Vault SCHEMA.md owns thresholds; the skill never invents numbers.
- Every audit run writes a typed report to `_audits/audit-YYYY-MM-DD-<scope>.md`.

## Output

Completion and blocked-message templates live in `references/output-formats.md`. Print verbatim with substitutions filled in so users scan many sessions quickly.
