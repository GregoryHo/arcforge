---
type: agents-contract
created: 2026-01-14
scope: How our team runs and operates the checkout service
preset: minimal
schema_path: SCHEMA.md
---

# ops-notes — Agent Runtime Contract

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file.
- SCHEMA.md governs note types, frontmatter, the tag taxonomy, and audit thresholds. Where this file and SCHEMA.md disagree, SCHEMA.md wins.
- Do not invent a type or a threshold SCHEMA.md does not declare.

## Identity

This vault is the team's operational memory for the checkout service: how it is deployed, what has broken, and what was decided. Typed notes live under `Wiki/`.

## Language Policy

Single language: English. No callouts.

## Paths and Integrations

- `index.md` — content catalog; query mode reads it first when present.
- `log.md` — append-only operation log.
- `_audits/` — audit reports.
- Search baseline: filesystem search/read.

## Domain Policy

See SCHEMA.md for types, frontmatter, taxonomy, and audit thresholds.
