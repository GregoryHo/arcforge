---
type: runbook
created: 2026-01-20
owner: sre
tags: [deploy, checkout]
---

# Deploy Pipeline

## Procedure

1. `./scripts/deploy.sh --target staging` builds the image and brings up the staging colour.
2. The staging gate is the integration suite plus a manual smoke of the payment path.
3. `./scripts/deploy.sh --target production` swaps which colour the load balancer points at.

## Rollback

`./scripts/rollback.sh` points the load balancer back at the previous colour. The old colour stays warm for 30 minutes after every promotion, so this is a pointer swap, not a redeploy.

## Relationships

Follows the strategy recorded in [[Decision-Blue-Green]]. Warm the new colour first with [[Cache-Warmup]].
