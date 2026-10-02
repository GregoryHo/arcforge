---
type: incident
created: 2026-06-03
date: 2026-03-28
severity: high
tags: [checkout, outage]
---

# Incident: Checkout Unavailable, 28 March

## What happened

A release promoted at 14:02 sent every checkout request to a colour whose payment credentials had not been rotated. Checkout returned 502 for 41 minutes.

## Timeline

- 14:02 — promotion completes
- 14:37 — a customer email reaches support
- 14:41 — on-call runs `./scripts/rollback.sh`, service restored within seconds

## Follow-ups

- Retries queued during the outage charged some customers twice.
- Credential rotation needs to be part of the staging gate.

## Relationships

Rolled back with [[Deploy-Pipeline]]. Led to [[Decision-Idempotency-Keys]], [[Payment-Retry-Drain]] and [[Credential-Rotation]].
