---
name: maintaining-obsidian
description: Vault interface for an Obsidian knowledge base. Use when something should be filed into the user's notes, when a question should be answered from the vault rather than from general knowledge, when vault health needs auditing, or when a new vault needs bootstrapping.
argument-hint: "[ingest <url|text> | query <question> | audit [link|lint|grow] | init-vault <path> --name <n> [--preset=<p>]] [--vault=<name>]"
---

# Maintaining Obsidian

Different vaults serve different domains — a second brain, a news pipeline, a
project tracker, a journal. This skill stays domain-agnostic and each vault
declares its own domain in a paired contract: `AGENTS.md` (runtime contract) and
`SCHEMA.md` (types, thresholds, taxonomy, language policy). **The vault contract
wins wherever it overlaps this skill.** The skill owns the mechanism: vault
resolution, the three pipelines, and the mechanical primitives.

## Modes

| The user wants to | Mode | Pipeline |
|---|---|---|
| Save, capture, file back, ingest a source | **ingest** | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| Know what the vault already says | **query** | Orient → Search → Read → Synthesize → (File Back) |
| Check vault health | **audit** | LINK → LINT → GROW |
| Set up a vault that does not exist yet | **init-vault** | `references/bootstrap-workflow.md` |

No mode named and no clear intent: orient, do not ask "which mode?". Resolve the
vault, read its contract, and answer with what this vault is — name, scope,
declared types, last log entry — then ask what to do. Ask "ingest, query, or
audit?" only when intent words are present but ambiguous.

## Step 1 — Resolve the vault

Cascade, stopping at the first hit: explicit `--vault=<name>` → the vault
Obsidian currently has open (`obsidian-cli vault`, matched against the registry)
→ the vault already chosen earlier this session → the registry default → ask.
Print `Operating on: <name>` for every step below the first so a wrong guess can
be aborted. The choice is sticky for the session unless `--vault` overrides it.

Obsidian not running: skip to the session/default/ask steps and warn once that
LINK resolution and live search degrade. Filesystem read and write still work.

Registry empty: stop and offer `init-vault` or `arcforge obsidian register`.
Never fall through to ad-hoc writes outside a registered vault.

- [ ] Done when one vault is resolved and named back to the user.

## Step 2 — Read the vault contract

Read `<vault>/AGENTS.md`, then `<vault>/SCHEMA.md`. Both are sticky for the
session — re-read only on `--reload-contract` or an mtime change. Read order,
what loads on demand, and the missing-file decision table live in
`references/domain-contract-orientation.md`.

Either contract file missing **blocks ingest and audit** — those mutate the
vault, and without declared types the skill would be inventing a schema. Query
and orientation continue with a warning.

- [ ] Done when the declared types and thresholds come from the vault's files, not from a guess.

## Registry operations go through the CLI

The registry of vaults is engine state. Read and change it only with:

```bash
arcforge obsidian list-vaults [--json]
arcforge obsidian register --name <n> --path <p> [--default] [--preset <p>] [--scope "..."] [--qmd-collection <name>]
arcforge obsidian unregister <name>
arcforge obsidian set-default <name>
```

Never hand-write the registry file. The CLI holds a lock, writes atomically, and
applies the first-registered-becomes-default rule; a hand-edit skips all three
and drifts from the schema the next time a field is added.

## Mode: ingest

Per-step detail — Classify rules, the Raw Source two-write protocol, Propagate
scope guard and contradiction handling, and the `--batch` / `--link` /
file-back variants — is in `references/mode-ingest.md`. Read it before running
an ingest. Add `references/raw-sources.md` when the vault's AGENTS.md declares
`raw_source: adopted`.

- Write relationships as **plain text**, not wikilinks. Audit LINK resolves them later, and a wikilink written now to a note that does not exist is a broken link, not a relationship.
- Raw Source ingest is **two** writes: the immutable original, then the typed note carrying `source_url` and `sha256`. Skipping the first conflates what the source said with what you understood, and the source can never be re-extracted.
- Propagate caps at 10 related pages; the rest go to audit. Surface contradictions to the user — never silently overwrite an existing claim.
- At the Visuals step, follow the vault's per-type Visual Guidance; where the vault is silent, use `references/visuals-decision-tree.md`.

## Mode: query

Search route selection and output-format adaptation: `references/search-strategies.md`.

- **Answer from the vault only — including the commentary around the answer.** Framing, insights, and comparisons come from notes too. Where the vault is thin, name the gap ("your vault covers A, nothing on B") so it feeds audit GROW. A general-knowledge sentence smuggled into the framing is the failure this mode exists to prevent.
- Cite the source note inline as `[[Note-Title]]` for every key claim, following `sources:` arrays for provenance.
- File Back re-enters ingest internally — same skill, no handoff, Classify skipped. State the decision either way: suggest filing back, or say why not.

## Mode: audit

LINK / LINT / GROW mechanics, the sha256 Source Drift check, EVOLVE patterns,
and vault-declared LINT extensibility: `references/audit.md`.

- **Only LINK modifies notes.** LINT and GROW report and propose; they never write to the wiki layer.
- **A LINT finding is a hypothesis.** Read the file before acting on it. The standing false positive: a YAML block list (`tags:` then indented `- ` items) looks empty to line-wise extraction and is not.
- **Never create a stub entity note without source backing.** Broken wikilink with a Raw Source behind it → ingest it; referenced by 3+ notes with no source → ask the user; 1–2 references → convert to plain text.
- Thresholds come from the vault's SCHEMA.md. Where it declares none, report the observation instead of inventing a number.
- Every run writes a typed report to `<vault>/_audits/audit-YYYY-MM-DD-<scope>.md`.

## Tool routing

Filesystem read and search is the contractual baseline — every mode must work
with Obsidian closed and no search index. Everything else is acceleration:
`qmd query` when the registry has a `qmd_collection`, `obsidian-cli` when the app
is running, `obsidian:defuddle` for URL extraction. Full routing table:
`references/delegation.md`; the CLI's traps (`file=` vs `path=`, SIGPIPE on
piped reads, Daily Notes detection): `references/obsidian-cli-quirks.md`.

Excalidraw diagrams are not this skill's work — invoke `/diagramming-obsidian`,
and only after the user has approved the diagram.

## Close every operation

Append one line to `<vault>/log.md`:

```
## [YYYY-MM-DD] <operation> | <detail>
```

Operations: `create | <type> | <filename>`, `query | <question>`,
`audit | <scope>`, `drift | <filename>`, `init-vault | preset=<preset>`. This log
is contractual; `obsidian-cli daily:append` is an optional best-effort
dual-write on top of it.

Then report what changed — the note path and pages propagated, the notes cited,
or the audit report path with per-check counts. When a mode could not run, say
which one, what stopped it, and the specific action that unblocks it.

- [ ] Done when `log.md` carries the line and the report names the artifacts by path.
