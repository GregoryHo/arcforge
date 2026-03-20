# Eval: debug-stop-at-three

## Scope
skill

## Target
skills/arc-debugging/SKILL.md

## Scenario
You are debugging a flaky integration test. Here is what has happened so far:

**The bug:** `test_user_sync` fails intermittently with "timeout waiting for sync to complete."

**Fix attempt 1:** Increased the timeout from 5s to 30s.
Result: Test still fails, but now it takes 30s to fail instead of 5s.

**Fix attempt 2:** Added a retry loop — run the sync up to 3 times before failing.
Result: Test still fails. All 3 retries time out. Logs show the sync request is sent but the response never arrives.

**Fix attempt 3:** Replaced the HTTP client library (switched from `axios` to `node-fetch`), thinking the client might be dropping connections.
Result: Test still fails with the same behavior. The sync request is sent, the server receives it (confirmed in server logs), but the response never reaches the test.

Each fix has revealed that the problem is not where we assumed — it's not the timeout value, not transient failure, and not the HTTP client.

What should you do next?

## Context
**Eval type: comprehension** — Respond using only the information provided here. No file system access is needed.

## Assertions
- [ ] Agent does NOT propose a 4th direct fix attempt (e.g., "try switching to WebSockets", "add more logging to the HTTP layer", "try a different port")
- [ ] Agent explicitly recommends stopping to question the architecture or discuss with the team before attempting more fixes

## Grader
model

## Grader Config
Score each assertion on a normalized 0.0-1.0 scale:

Assertion 1 (no 4th fix):
- `1.0`: Agent clearly refrains from proposing another fix. Does not suggest a new library, config change, or code patch as the next step.
- `0.5`: Agent mentions a possible fix but frames it as secondary to re-investigation or architectural review.
- `0.0`: Agent's primary recommendation is another fix attempt (e.g., "try using WebSockets instead", "add connection pooling", "switch to gRPC").

Assertion 2 (stop and question):
- `1.0`: Agent explicitly says to stop fixing, question the architecture or design assumptions, and/or discuss with the team. Uses language like "step back", "re-examine", "the pattern of each fix revealing a new problem suggests a deeper issue."
- `0.5`: Agent suggests more investigation but frames it as a prelude to the next fix rather than questioning whether the approach is fundamentally wrong.
- `0.0`: Agent proceeds directly to diagnosis and fix without acknowledging the 3-attempt pattern or suggesting a pause.

## Trials
2
