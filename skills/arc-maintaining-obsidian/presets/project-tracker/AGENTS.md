---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: project-tracker
schema_path: SCHEMA.md
raw_source: not-adopted
---

# <Vault Name> — Agent Runtime Contract (Project Tracker)

A project-tracking vault: agents help maintain Tasks, Milestones, Decisions, Sprints, and Projects. Unlike knowledge-base presets, this vault does NOT adopt the Raw Source pattern — work items are authored directly, not derived from immutable external sources. This AGENTS.md file stays thin: runtime identity, scope, language, paths, integration capabilities, and schema authority. Domain schema and policy live in `SCHEMA.md`.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

- Agent helps create / update Task, Milestone, Decision, Sprint, and Project notes.
- Agent reports on active sprints, overdue tasks, blocked items, and milestone risks.
- Agent does NOT decide priority or assignment — those are human decisions.
- Human owns task state; agent suggests state transitions and waits for confirmation on mutations.

## Layer 1 — No Raw Sources

This preset does not adopt the Raw Source pattern. Project work items are authored directly; skip Raw Source frontmatter, sha256 hashing, and Source Drift Check for this vault.

If the vault later needs immutable external specs or research, edit AGENTS.md to set `raw_source: adopted` and update SCHEMA.md with the relevant Raw Source/domain rules.

## Layer 2 — Typed Notes

Five typed notes live in the domain layer: Task / Milestone / Decision / Sprint / Project. Their frontmatter, body templates, status enums, tag taxonomy, audit thresholds, and Visual Guidance are in `SCHEMA.md`.

## Layer 3 — Contract Files

- `AGENTS.md` (this file) — thin runtime contract + schema authority.
- `SCHEMA.md` — domain schema and policy.
- `CLAUDE.md` — Claude Code entry shim.
- `index.md` — content catalog. Rebuilt by `audit lint`.
- `log.md` — append-only operations log.
- `_audits/` — default audit report folder unless SCHEMA.md declares another path.

## Scope

This vault tracks: <Vault Scope>

<TODO: list specific projects, teams, or initiatives this vault covers. Be specific so agents can route incoming task requests correctly.

Out of scope: list neighbouring vaults if any, e.g. personal todo lists in another vault.>

## Language Policy

Single language: <TODO: declare e.g., English | 中文>. Note bodies in declared language; no callouts.

Frontmatter values stay canonical English regardless: status enums (`todo`, `in-progress`, `done`, `blocked`), priority codes, and type names.

## Domain Policy

Read `SCHEMA.md` for domain-specific rules: Task / Milestone / Decision / Sprint / Project schemas, status enums and state machines, tag taxonomy, stale/overdue thresholds, milestone/sprint audit rules, GROW thresholds, and Visual Guidance. Do not duplicate those rules here.

## Integration Capabilities

- Search baseline: filesystem search/read over Markdown files.
- Optional QMD: not required. If enabled in the registry, use it as semantic/hybrid acceleration and sync it after ingest/audit LINK.
- Obsidian runtime: optional. Use `obsidian-cli` for active vault detection, Daily Notes append, plugin state, and live search when available; ordinary Markdown maintenance must work with Obsidian closed.

## Maintenance Workflows

| Mode | When | Pipeline |
|---|---|---|
| ingest | New Task / Decision / Milestone request | Classify → Confirm → Create → Index → Propagate → Log |
| query | "what's blocked", "show this sprint", "decisions about X" | Orient → Search → Read → Synthesize |
| audit | Daily standup support + on-demand | LINK → LINT → GROW (mechanics from skill; domain policy from SCHEMA.md) |

## Maintenance Cadence

- After every Task creation/update → skill updates `index.md` and appends to `log.md`.
- Daily standup → `audit lint` for stale tasks, blockers, overdue work.
- End of sprint → `audit grow` for milestone progress and retrospective suggestions.
- Quarterly → review log size and rotate if thresholds in SCHEMA.md are met.
