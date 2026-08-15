---
name: changelog
description: Changelog entries for a release. Use when a release is being cut, when a merged PR needs a user-facing line, or when someone asks what changed since the last tag.
---

# Changelog

## Entry types

| Type | Goes in | Example |
|---|---|---|
| `added` | A capability that did not exist | `added: --since flag on report` |
| `changed` | Behaviour that already existed and now differs | `changed: retries back off exponentially` |
| `fixed` | A defect a user could hit | `fixed: empty CSV no longer throws` |
| `removed` | Something callers can no longer rely on | `removed: legacy --json-lines output` |

## Rules of the file

| Rule | Detail |
|---|---|
| Newest first | Unreleased section at the top, then tags descending |
| One line per entry | Wrap at 100 columns; no sub-bullets |
| User-visible only | Refactors, test changes, and CI edits do not get entries |
| Link the PR | Trailing `(#411)` — number only, no URL |
