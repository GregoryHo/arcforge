---
type: runbook
created: 2026-07-02
owner: sre
tags: [deploy, checkout]
---

# Feature Flag Reset

## Procedure

1. After a rollback, list the flags the rolled-back release changed: `./scripts/flags.sh diff --since <release>`.
2. Reset each one to its previous value with `./scripts/flags.sh set`.
3. Confirm checkout still serves the old flow on the active colour.

## Relationships

Run after a rollback in [[Deploy-Pipeline]].
