---
name: arc-verifying
description: Gather fresh evidence that work is actually complete before a completion claim. Use when about to say 'done', 'fixed', or 'passing' — rerun the checks and read real output rather than trusting prior state.
category: discipline
status: promoted
---

# arc-verifying

## Core Principle

**Claiming work is complete without verification is dishonesty, not efficiency.**

## Boundary

`arc-verifying` owns producing fresh evidence for completion claims. It does not own authoring spec artifacts and it does not own reconciling spec/code drift after implementation (that is the optional, separate, future `arc-syncing-spec` workflow — never folded into the SessionStart bootstrap or the `arc-using` router). Spec/code drift checks may quote verification evidence as input, but verification itself is not a spec-sync skill. <!-- doc-ref-lint: ignore R4 arc-syncing-spec is an intentional test-pinned boundary reference to a future opt-in skill that does not ship today (plan §1.11) -->

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in THIS message, you cannot claim it passes.

## The Gate Function

BEFORE claiming any status or expressing satisfaction:

1. **IDENTIFY:** What command proves this claim?
2. **RUN:** Execute the FULL command (fresh, complete)
3. **READ:** Full output, check exit code, count failures
4. **VERIFY:** Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. **ONLY THEN:** Make the claim

**Skip any step = lying, not verifying**

## Common Failures

| Claim | Requires | NOT Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Build succeeds | Build command: exit 0 | Linter passing |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Regression Tests (Red/Green)

If claiming a bug is fixed, require a true regression check:

```
1. Run failing test (RED)
2. Apply fix
3. Run test again (GREEN)
```

Skipping RED means you don't know the test proves anything.

## Requirements Verification

If claiming requirements are met: re-read the requirements, make a checklist, verify each item with evidence, and report any gaps explicitly.

## When Verification Cannot Run

**Cannot verify ≠ skip verification.** Inform the user immediately and choose an alternative with them.

| Situation | Action |
|-----------|--------|
| Build fails | Fix build first, then verify |
| Cannot run Simulator/Emulator | Ask user: fix blocker OR add debug print |
| Requires manual UI testing | Describe expected behavior, ask user to verify |

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction BEFORE verification ("Great!", "Perfect!", "Done!")
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Assuming linter success implies build/test success
- Cannot verify but don't inform user
- Feeling tired and wanting it over

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I changed it, should be fine" | Changed ≠ verified |
| "I'm confident" | Confidence ≠ evidence |
| "Continue for now, verify later" | Cannot verify = stop here |
| "Just this once" | No exceptions |
| "Agent said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |
| "Too simple to verify" | Complexity irrelevant |
| "I already ran it earlier" | Run it again, now |
| "The logs look fine" | Logs ≠ verification |

## Integration

**Discoverable from:** `arc-using` when a task approaches a completion claim.

**Also embedded in:**
- **arc-finishing** (Step 0 discriminates on `.arcforge-epic`) — verify tests before offering merge options
- **`/tdd`** — Verify RED / Verify GREEN steps
- **Spec reviewer** / **Quality reviewer** — read actual code, run tests

Invoke this skill explicitly before finishing. Embedded verification in other skills is an additional layer, not a replacement.
