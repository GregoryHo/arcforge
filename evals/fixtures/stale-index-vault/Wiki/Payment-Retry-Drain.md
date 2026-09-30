---
type: runbook
created: 2026-06-03
owner: payments
tags: [payments, checkout]
---

# Payment Retry Drain

## Procedure

1. Pause the retry worker: `./scripts/retry-worker.sh pause`.
2. Export the pending queue with `./scripts/retry-worker.sh export > pending.json` and check every entry carries an idempotency key.
3. Resume the worker. Entries without a key go to the payments team by hand, never back into the queue.

## Relationships

Written after [[Incident-2026-03-Checkout]]. Relies on the keys introduced by [[Decision-Idempotency-Keys]].
