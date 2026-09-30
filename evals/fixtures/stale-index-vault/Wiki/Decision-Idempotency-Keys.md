---
type: decision
created: 2026-06-03
status:
tags: [payments]
---

# Decision: Idempotency Keys on Every Charge

## Decision

Every charge request carries an idempotency key derived from the order id and the attempt number.

## Reasoning

During the March outage, retries after the rollback charged some customers twice. With a key, the provider rejects the duplicate instead of charging it.

## Relationships

Prompted by [[Incident-2026-03-Checkout]]. Drained safely with [[Payment-Retry-Drain]].
