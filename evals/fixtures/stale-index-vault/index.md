# ops-notes Index
Last updated: 2026-08-12

The team's catalog of typed notes. Query mode reads this first.

## Runbooks
- [[Cache-Warmup]] — warming the idle colour before it is promoted
- [[Deploy-Pipeline]] — how a release reaches production and how it comes back
- [[Feature-Flag-Reset]] — putting flags back after a rollback
- [[Payment-Retry-Drain]] — pausing and draining the payment retry queue without double charges
- [[Retry-Storm-Review]] — what to do when the retry worker floods the provider

## Decisions
- [[Decision-Blue-Green]] — deployment strategy
- [[Decision-Idempotency-Keys]] — an idempotency key on every charge request
- [[Decision-Provider-Timeouts]] — an 8-second provider timeout, retries go to the worker
- [[Decision-Staging-Gate]] — what a release must pass on staging

## Incidents
- [[Incident-2026-03-Checkout]] — checkout returned 502 for 41 minutes on 28 March (high)
- [[Incident-2026-05-Cache-Stampede]] — a cold cache tripled checkout latency on 19 May (medium)
