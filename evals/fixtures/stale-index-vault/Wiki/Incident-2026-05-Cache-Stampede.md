---
type: incident
created: 2026-06-21
date: 2026-05-19
severity: medium
tags: [checkout, outage]
---

# Incident: Cache Stampede, 19 May

## What happened

A promotion went to a colour whose product-catalog cache was empty. Every request went to the database at once and checkout latency tripled for twelve minutes.

## Timeline

- 09:30 — promotion completes
- 09:31 — database CPU at 100%
- 09:42 — hit rate recovers on its own

## Follow-ups

- Warm the idle colour before every promotion.

## Relationships

Led to [[Cache-Warmup]]. Promoted through [[Deploy-Pipeline]].
