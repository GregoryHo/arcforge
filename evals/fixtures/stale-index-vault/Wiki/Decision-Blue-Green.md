---
type: decision
created: 2026-01-18
status: accepted
tags: [deploy]
---

# Decision: Blue-Green over Canary

## Decision

Deploy blue-green. Keep the previous colour warm for 30 minutes after promotion.

## Reasoning

Canary needs per-request routing and a way to compare the two populations. We have neither. Blue-green gives a rollback measured in seconds for the cost of running two colours briefly.

## Relationships

Implemented by [[Deploy-Pipeline]].
