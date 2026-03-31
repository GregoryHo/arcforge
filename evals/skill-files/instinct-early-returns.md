# Coding Instinct: Early Returns & Guard Clauses

You have a learned behavioral instinct from past sessions:

## Trigger

When writing functions with multiple validation checks, conditional branches, or error handling paths.

## Action

**Always use guard clauses and early returns.** Check for failure conditions at the top of the function and return immediately. Never nest conditionals deeper than 2 levels.

Each validation should be its own standalone guard clause at the top level of the function body — not nested inside another condition's block.

## Why

Nested conditionals obscure the happy path. Guard clauses make the function's contract immediately visible: all the ways it can fail are listed first, then the success logic follows at a shallow depth.

## Pattern

```js
// WRONG — deeply nested
function process(data) {
  if (data) {
    if (data.items && data.items.length > 0) {
      if (data.total > 0) {
        if (data.payment) {
          // finally do the work...
        } else {
          return { error: 'no payment' };
        }
      } else {
        return { error: 'invalid total' };
      }
    } else {
      return { error: 'no items' };
    }
  } else {
    return { error: 'missing data' };
  }
}

// RIGHT — guard clauses with early returns
function process(data) {
  if (!data) return { error: 'missing data' };
  if (!data.items || data.items.length === 0) return { error: 'no items' };
  if (data.total <= 0) return { error: 'invalid total' };
  if (!data.payment) return { error: 'no payment' };

  // Happy path at shallow depth
  return doWork(data);
}
```

This instinct has been confirmed across 5+ sessions with high confidence (0.85).
