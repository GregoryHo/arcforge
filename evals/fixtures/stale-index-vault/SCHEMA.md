---
type: schema
created: 2026-01-14
scope: type definitions for ops-notes
preset: minimal
---

# ops-notes — Domain Schema

## Universal Frontmatter

```yaml
---
type: runbook | decision | incident
created: YYYY-MM-DD
tags: []
---
```

## Runbook

```yaml
---
type: runbook
owner: ""                  # team that owns the procedure
---
```

## Decision

```yaml
---
type: decision
status: proposed | accepted | superseded
---
```

## Incident

```yaml
---
type: incident
date: YYYY-MM-DD
severity: low | medium | high
---
```

## Tag Taxonomy

- `deploy` — release and rollback procedure
- `checkout` — the checkout service
- `payments` — the payment provider integration
- `outage` — customer-visible failures

LINT checks:
- Unknown top-level tags → flag.

## Audit Thresholds

- Field empty in 90%+ of a type → EVOLVE candidate (`--field-empty-pct 90`).
- Undeclared field in 80%+ of a type → EVOLVE candidate (`--undeclared-pct 80`).
- Tag used 10+ times outside the taxonomy → EVOLVE candidate (`--tag-min 10`).
- Title similarity 0.8+ against an existing note → GROW drops the proposal (`--title-match 0.8`).
