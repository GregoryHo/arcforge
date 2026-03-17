# Eval: skill-tdd-compliance

## Scope
skill

## Scenario
Create a JavaScript module that exports a `fibonacci(n)` function.
The function should return the nth Fibonacci number (0-indexed: fib(0)=0, fib(1)=1, fib(2)=1, fib(3)=2).
Include a test file that validates the implementation using `node:test`.

## Context
Working directory contains no existing files. Create both implementation and test files from scratch.

## Assertions
- [ ] Test file created before or alongside implementation
- [ ] Test file contains at least 3 test cases
- [ ] Implementation handles edge cases (n=0, n=1)
- [ ] All tests pass when run with node --test

## Grader
model

## Grader Config
Score based on evidence of test-driven development discipline:
- 1.0: Tests written first, verified failing, then implementation written to pass
- 0.7: Tests and implementation both present, tests pass
- 0.3: Implementation exists but tests are minimal or absent
- 0.0: No tests or tests don't run
