# Completion evidence

What a completion claim requires before it can be written down. A claim without its
evidence is not efficiency — it hands the reader a state that was never observed.

The rule is single: **if you did not run it in this message, you cannot report its
result.** Evidence produced earlier describes an earlier tree.

## The gate

1. Name the command that would settle the claim.
2. Run it, in full, now.
3. Read the whole output — exit status, failure count, warnings.
4. Compare it against the claim you were about to make.
5. State the claim with that output, or state what the output actually says.

## What each claim requires

| Claim | Evidence that settles it | What does not settle it |
|---|---|---|
| Tests pass | Test-command output showing 0 failures, in this message | An earlier run, "should pass", a green CI badge from before the change |
| Build succeeds | Build command exit 0 | The linter passing, the type checker passing, the file compiling in an editor |
| Bug fixed | The reproducing test failing before the change and passing after | The code changed in the place the bug was reported |
| Agent completed the work | `git diff` / `git status` showing the changes | The agent's own report of success |
| Requirements met | Line-by-line checklist, each item pointing at file:line | The suite passing |
| Nothing else broke | Full-suite run after the change | The one test for the thing you touched |
| Review answered | Each finding paired with the change or the reason it stands | "Addressed the feedback" |

## Red / green for a fix

```
1. Run the test that reproduces the bug        → it must FAIL
2. Apply the fix
3. Run it again                                → it must PASS
```

Skipping step 1 leaves you unable to say what the test proves: a test that never failed
may be asserting behavior that was already there.

## Requirements, item by item

Re-read the requirements text itself rather than your memory of it. Write one line per
item: the requirement, the file:line implementing it, and the output that shows it
works. An item with no line is a gap — report the gap; a checklist that reports only the
items that passed is a claim that the rest do not exist.

## When the check cannot run

Cannot verify is not permission to skip verification. Say so in the same message, name
the blocker, and pick the alternative with the user.

| Situation | Action |
|---|---|
| The build is broken | Fix the build first — nothing downstream can be verified through it |
| The check needs a device, emulator, or service you lack | Tell the user what is missing and ask how to proceed |
| Only a human can observe the result | State the expected behavior precisely and ask them to confirm it |

## Rationalizations

Every line is something said at the moment a claim is about to go out unverified.

| About to say | What is true |
|---|---|
| "Should work now" | Run it. |
| "I changed it, so it's fine" | Changed is not verified. |
| "I'm confident" | Confidence is not output. |
| "I'll verify later, let's continue" | Cannot verify now means stop now. |
| "The agent said it succeeded" | Read the diff. |
| "I ran it earlier" | Earlier was a different tree. |
| "The logs look fine" | Logs are not a result. |
| "Too simple to check" | The check costs less than the retraction. |
| "Partial check is enough" | A partial check proves the part it covered. |

## Words that mean the evidence is missing

"should", "probably", "seems to", "looks right" — and any satisfaction expressed before
the output was read ("Great!", "Perfect!", "All set!"). Catching one of these in a
sentence you are writing means the run has not happened yet.
