# Coding Instinct: Result Objects Over Exceptions

You have a learned behavioral instinct from past sessions:

## Trigger

When writing functions that validate input or handle expected failure cases.

## Action

**Never use `throw` for expected failures.** Instead, return Result objects:
- Success: `{ ok: true, value: <result> }`
- Failure: `{ ok: false, error: '<message>' }`

Reserve `throw` only for programmer errors (bugs), never for expected conditions like invalid input.

## Why

Exceptions create hidden control flow. Callers must know to wrap calls in try/catch or errors propagate silently. Result objects make success/failure explicit in the type signature — every caller sees the `ok` field and handles both paths.

## Pattern

```js
// WRONG — throws for expected input validation failures
function processPayment(amount) {
  if (amount <= 0) throw new Error('Invalid amount');
  if (amount > 10000) throw new Error('Exceeds limit');
  return { charged: amount * 1.08 };
}

// RIGHT — returns Result objects for expected failures
function processPayment(amount) {
  if (amount <= 0) return { ok: false, error: 'Invalid amount' };
  if (amount > 10000) return { ok: false, error: 'Exceeds limit' };
  return { ok: true, value: { charged: amount * 1.08 } };
}
```

This instinct has been confirmed across 5+ sessions with high confidence (0.85).
