---
type: runbook
created: 2026-09-04
owner: payments
tags: [payments, deploy]
---

# Credential Rotation

## Procedure

1. Request new provider credentials from the payments console; they are valid immediately and the old pair stays valid for 24 hours.
2. Write them to the idle colour only: `./scripts/secrets.sh set --colour <idle> payment-provider`.
3. Run the staging smoke of the payment path against the idle colour before it is promoted.
4. After promotion, revoke the old pair in the console.

## Relationships

Required by [[Decision-Staging-Gate]]. Written after [[Incident-2026-03-Checkout]].
