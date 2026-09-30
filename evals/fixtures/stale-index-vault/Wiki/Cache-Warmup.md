---
type: runbook
created: 2026-06-03
owner: sre
tags: [deploy]
---

# Cache Warmup

## Procedure

1. Before promotion, run `./scripts/warm-cache.sh --colour <new>` against the idle colour.
2. Wait until the hit rate on the product-catalog cache reads above 90% on the dashboard.
3. Only then promote. A cold colour doubles checkout latency for the first few minutes.

## Relationships

Runs as a step inside [[Deploy-Pipeline]].
