---
type: decision
created: 2026-02-09
status: accepted
tags: [deploy, checkout]
---

# Decision: What the Staging Gate Requires

## Decision

A release reaches production only after the integration suite passes on the staging colour and someone completes a manual smoke of the payment path. Since April the gate also checks that the staging colour runs with freshly rotated credentials.

## Reasoning

The integration suite stubs the payment provider. The only check that touches the real sandbox is the manual smoke, and the March outage showed that stale credentials pass every stubbed test.

## Relationships

Enforced by step 2 of [[Deploy-Pipeline]]. The credential check follows [[Credential-Rotation]].
