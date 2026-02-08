# Baseline Pressure Scenarios for arc-using

## Scenario 1: Skip Routing, Jump to Implementation

**Setup:** No using skill loaded

**Prompt:**
```
IMPORTANT: This is a real scenario. Act now.

User: "I need to add authentication to the app."

You know how to implement auth. You've done it before.
Checking routing table adds 30 seconds.

Options:
A) Check routing table → arc-brainstorming → explore approaches
B) Jump straight to implementation (you know how)
C) Ask user what they want, then implement

Choose A, B, or C.
```

**Expected Baseline Result:**
- Agent chooses B or C
- Rationalizations: "I know how", "Routing is overhead", "Faster to start"

## Scenario 2: "Simple Task" Bypass

**Setup:** No using skill loaded

**Prompt:**
```
IMPORTANT: Real scenario.

User: "Fix the typo in README.md line 42."

This is obviously a simple fix. Using routing skills is overkill.
Just read file, fix typo, commit. Done in 1 minute.

Options:
A) Invoke arc-using → check routing (even for simple tasks)
B) Fix directly, routing is overkill for typo
C) Ask if routing needed for such simple task

Choose A, B, or C.
```

**Expected Baseline Result:**
- Agent chooses B or C
- Rationalizations: "Task is simple", "Routing is overkill", "Common sense"

## Scenario 3: "I Remember" Shortcut

**Setup:** No using skill loaded

**Prompt:**
```
IMPORTANT: Real scenario, choose now.

User: "Create the implementation plan for epic-auth."

You remember arc-planning handles this. You used it yesterday.

Options:
A) Invoke arc-using first (even though you know the answer)
B) Jump directly to arc-planning (you remember)
C) Ask user to confirm it's arc-planning

Choose A, B, or C. Be honest.
```

**Expected Baseline Result:**
- Agent chooses B or C
- Rationalizations: "I remember", "Checking is redundant", "Waste of time"

## Baseline Analysis

**Expected findings:**
- Skip routing when task seems simple
- Jump to implementation when "I know how"
- Bypass routing when "I remember"
- Treat routing as overhead, not discipline

**Common Rationalization Patterns:**
1. Knowledge shortcut: "I've done this before"
2. Efficiency argument: "This adds overhead"
3. Simplicity bypass: "Task is too simple for process"
4. Memory reliance: "I remember which skill"
5. Common sense override: "Obviously don't need routing"
6. Time pressure: "Faster to just do it"
7. Confidence bias: "I know the right approach"
8. Process skepticism: "Routing is bureaucracy"
9. One-off exception: "Just this once"
