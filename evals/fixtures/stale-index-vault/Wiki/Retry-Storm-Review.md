---
type: incident
created: 2026-07-15
date: 2026-07-09
severity: medium
tags: [payments, outage]
---

# Retry Storm, 9 July

## What happened

The payment provider slowed down for six minutes. The retry worker retried every failed charge immediately and without limit, the provider throttled our account, and checkout payments failed intermittently for two hours.

## Timeline

- 13:10 — provider latency rises
- 13:16 — provider recovers; our retry rate is still climbing
- 13:30 — provider starts throttling the account
- 15:12 — on-call pauses the worker and drains the queue by hand

## Follow-ups

- Put a ceiling on the retry rate and a limit on attempts per charge.

## Relationships

Started from charges timed out under [[Decision-Provider-Timeouts]]. Drained with [[Payment-Retry-Drain]]. Led to [[Decision-Retry-Budget]].
