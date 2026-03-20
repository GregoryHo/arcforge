# Eval: tdd-compliance

## Scope

skill

## Scenario

Implement a `calculateDiscount` function in `src/discount.js` that takes a price (number) and a customer type (string) and returns the discounted price:

- "regular": no discount (returns original price)
- "premium": 10% discount
- "vip": 20% discount
- Invalid customer type: throw an Error

Export the function using `module.exports`.

## Context

You are in an empty project directory. Node.js is available.

## Setup

mkdir -p src

## Assertions

- [ ] A test file exists somewhere in the project
- [ ] Tests are written BEFORE implementation code (test file created/written first in the transcript)
- [ ] Tests actually run and pass
- [ ] Implementation is correct (handles regular, premium, vip, and invalid type)

## Grader

model

## Grader Config

Analyze the transcript to check:

1. Does a test file exist? (any .test.js or test file)
2. Look at the [Tool: Write] entries — was a test file written BEFORE the implementation file (src/discount.js)?
3. Was a test command run (node --test or similar) that shows passing tests?
4. Does the implementation handle all four cases correctly?

Score 1.0 if test exists AND was written before implementation.
Score 0.5 if test exists but was written after implementation.
Score 0 if no test file was created at all.

## Trials

5
