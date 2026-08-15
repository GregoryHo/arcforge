---
type: service
created: 2026-02-11
---

# Payments Service

Wraps the payment provider. Exposes one call, `authorize`, which returns
`approved`, `declined`, or `error`. It holds no cart state and never calls back
into Cart-Service directly — the routing decision belongs to Checkout-Service.
