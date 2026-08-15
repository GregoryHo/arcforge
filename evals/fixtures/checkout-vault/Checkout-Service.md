---
type: service
created: 2026-02-11
---

# Checkout Service

Owns the checkout session. Receives the cart from Cart-Service, asks
Payments-Service to authorize, and finalizes the order on success.

On a declined or errored authorization it does not retry. It marks the session
`payment_failed` and hands the shopper back to Cart-Service with the cart intact
so nothing has to be re-entered.
