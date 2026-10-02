---
type: decision
created: 2026-07-02
status: accepted
tags: [payments, checkout]
---

# Decision: Provider Timeouts

## Decision

Calls to the payment provider time out after 8 seconds. A timed-out charge is handed to the retry worker rather than retried inline.

## Reasoning

Inline retries held the checkout request open for up to 40 seconds and customers refreshed the page, which sent a second charge.

## Relationships

Timed-out charges are handled by [[Payment-Retry-Drain]], keyed by [[Decision-Idempotency-Keys]].
