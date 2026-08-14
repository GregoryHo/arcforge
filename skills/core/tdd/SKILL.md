---
name: tdd
description: Test-first implementation discipline. Use when adding a function or feature, fixing a bug, changing existing behavior, or when implementation code already exists with no test covering it.
---

# Test-Driven Development

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Production code written before its test is deleted, not kept. Delete means delete:
not kept as a reference, not adapted while the test is written, not read one more
time. Code you did not reconstruct from a failing test is untested code wearing a
passing suite — the suite was written to fit what the code already does.

The law covers new features, bug fixes, and any change to existing behavior. The
only exemptions are throwaway prototypes, generated code, and configuration, and
each one requires the user to approve it out loud before you skip the cycle.

## The cycle

Each step names what has to be true before the next one starts.

**1. Find a reference.** Look for a similar implementation already in this
codebase before designing a new one.
*Done when:* you have named the closest existing implementation, or established
that none exists.

**2. RED — write one failing test.** One behavior per test. The name states the
behavior, not the function. Exercise real code; mock only what cannot run inside a
test.
*Done when:* the test file exists and asserts a behavior no code implements yet.

**3. Verify RED — run it and read the failure.** Never skip this. A test you did
not watch fail is a test you cannot trust.
*Done when:* the run reports a failure (not an error) whose message names the
missing behavior. It passed → it asserts behavior that already exists; rewrite it.
It errored → fix the error and rerun until it fails for the intended reason.

**4. GREEN — the smallest code that passes.** No extra parameters, no adjacent
cleanups, no capability the test does not demand.
*Done when:* the target test passes, every other test still passes, and the output
carries no new warnings.

**5. REFACTOR — clean up while green.** Remove duplication, improve names, extract
helpers.
*Done when:* the test results are unchanged and no behavior was added.

Then return to step 2 with the next behavior.

## Code that already exists without a test

Decide by where the code came from, not by how good it looks.

| The code | What to do |
|---|---|
| Written during the change you are making now | Delete it. Restart at step 2. |
| Already in the repository, and this change does not touch it | Leave it alone. |
| Already in the repository, and this change modifies it | Cover the current behavior with a passing test, then go to step 2 for the new behavior. |

## Rationalizations

Every row is something an agent says at the moment it is about to skip the cycle.

| What you are about to say | What is actually true |
|---|---|
| "Too simple to test" | Simple code breaks. The test costs thirty seconds. |
| "I'll write the test right after" | A test that passes the first time proves nothing about the code. |
| "I already tested it manually" | Ad hoc, unrecorded, unrepeatable. It does not survive the next change. |
| "Deleting hours of work is wasteful" | Sunk cost. Unverified code is debt carried forward, not an asset. |
| "Keep it as a reference, then write tests" | You will adapt it, which is testing after with extra steps. |
| "I need to explore the problem first" | Explore freely, then throw the exploration away and start at step 2. |
| "TDD will slow me down here" | It replaces the debugging session that the untested version schedules for later. |
| "This is hard to test" | The design is hard to use. Fix the interface, not the test. |

## Red flags

Catching yourself writing any of these means stop, delete the untested code, and
restart at step 2:

- "just this once" / "skip TDD here"
- "let me get it working first"
- "I'll add tests once the shape settles"
- "the test would just restate the implementation"
- "it's already written, so tests-after is the same thing"

## Good tests

| Quality | Good | Bad |
|---|---|---|
| Minimal | One behavior. An "and" in the name means split it. | `test('validates email and domain and whitespace')` |
| Named | The name describes the behavior under test. | `test('test1')` |
| Intentional | Demonstrates the API you want to exist. | Obscures what the code should do. |

## When stuck

| Problem | Response |
|---|---|
| No idea how to test it | Write the call you wish existed, then the assertion, then make it compile. |
| The test is enormous | The design is enormous. Simplify the interface first. |
| Everything needs mocking | The code is too coupled. Inject the dependency instead. |
| The setup dwarfs the test | Extract a helper. Still complex → the design is the problem. |

## Bugs

A bug is a missing test. Reproduce it with a failing test before changing any code:
the test proves the fix landed and stops the bug from returning silently. A fix
without a reproducing test is a guess.

## Before claiming the work is done

- [ ] Every new behavior has a test that failed before the code existed
- [ ] Each of those failures was read, and named the missing behavior
- [ ] Each implementation was the minimum that turned its test green
- [ ] The full suite passes and the output carries no new warnings
- [ ] Tests exercise real code; every mock has a reason that is not convenience
- [ ] Edge cases and error paths are covered, not just the happy path

Any box you cannot check means the cycle was skipped for that behavior. Go back to
step 2 for it.

## References

- `references/examples.md` — good versus bad RED and GREEN, plus a worked bug fix.
  Open it when you are unsure what a minimal failing test should look like.
- `references/testing-anti-patterns.md` — mocks, test-only methods on production
  classes, incomplete fixtures. Open it before adding a mock or a test helper.
