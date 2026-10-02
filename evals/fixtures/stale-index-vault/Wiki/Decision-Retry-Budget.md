---
type: decision
created: 2026-09-15
status: accepted
tags: [payments]
---

# Decision: A Retry Budget for the Payment Worker

## Decision

The retry worker sends at most 20 retries per second to the provider and gives up on a charge after five attempts over one hour. Charges that exhaust the budget go to the payments team.

## Reasoning

Unbounded retries turned a short provider slowdown into a storm that the provider throttled for most of an afternoon. A fixed budget keeps the queue draining at a rate the provider accepts.

## Relationships

Prompted by [[Retry-Storm-Review]]. Applied when following [[Payment-Retry-Drain]].
