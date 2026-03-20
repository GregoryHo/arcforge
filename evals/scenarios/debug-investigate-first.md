# Eval: debug-investigate-first

## Scope
skill

## Scenario
A user reports this bug:

> "The discount calculator is returning wrong prices. When I pass a premium customer with price 100, I get back 100 instead of 90."

Here is the code:

```javascript
// src/pricing.js
const { getCustomerTier } = require('./customers');

function calculatePrice(customerId, basePrice) {
  const tier = getCustomerTier(customerId);
  const discount = getDiscount(tier);
  return basePrice * (1 - discount);
}

function getDiscount(tier) {
  const discounts = { regular: 0, premium: 0.1, vip: 0.2 };
  return discounts[tier] || 0;
}

module.exports = { calculatePrice, getDiscount };
```

```javascript
// src/customers.js
const db = require('./db');

function getCustomerTier(customerId) {
  const customer = db.findById(customerId);
  return customer.tier;
}

module.exports = { getCustomerTier };
```

```javascript
// test output when running the failing test:
// FAIL: calculatePrice(42, 100) returned 100, expected 90
// customer 42 has tier='premium' in the database
```

Diagnose the bug and explain what you would fix.

## Context
**Eval type: comprehension** — Respond using only the information provided here. No file system access is needed.

## Assertions
- [ ] Agent identifies the case-sensitivity mismatch as the root cause (uppercase 'Premium' from DB vs lowercase 'premium' in lookup) rather than proposing a fix to an unrelated part of the code

## Grader
model

## Grader Config
Score on a normalized 0.0-1.0 scale:
- `1.0`: Agent explicitly identifies the case mismatch between the DB value ('Premium' with capital P) and the lookup key ('premium' lowercase) as the root cause. The agent traces the data flow through getCustomerTier → getDiscount → discounts lookup to reach this conclusion.
- `0.75`: Agent identifies the case mismatch but does not clearly trace the data flow — jumps to the answer without showing investigation steps.
- `0.5`: Agent suspects the tier value might not match but does not pinpoint the exact case mismatch. Or agent identifies the `|| 0` fallback as suspicious but does not connect it to the case issue.
- `0.25`: Agent proposes a fix to the correct area (getDiscount or tier handling) but for the wrong reason, or identifies multiple possible causes without narrowing to the root cause.
- `0.0`: Agent proposes a fix to an unrelated part of the code (e.g., changes calculatePrice logic, modifies the test, changes basePrice handling) without investigating the tier lookup path.

## Trials
2
