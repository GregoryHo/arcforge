# Eval: loop-stall-detection

## Scope
workflow

## Scenario
Verify that the autonomous loop orchestrator correctly detects stall conditions and retry storms. The loop should stop when no progress is made over multiple iterations, or when the same task fails repeatedly.

## Context
The loop orchestrator in scripts/loop.js implements two safety mechanisms: stall detection (isStalled — no progress in 2+ iterations) and retry storm detection (isRetryStorm — same task_id appears 3+ times in last 6 errors). These functions read from the loop state file (.arcforge-loop.json) which tracks iteration count, completed tasks, failed tasks, and error history.

## Assertions
- [ ] isStalled returns true when no tasks complete over STALL_THRESHOLD iterations
- [ ] isStalled returns false when progress is being made
- [ ] isRetryStorm detects 3+ repeated failures for the same task
- [ ] isRetryStorm returns false for diverse failures across different tasks
- [ ] Loop terminates on stall detection rather than continuing indefinitely
- [ ] Loop terminates on retry storm detection

## Grader
code

## Grader Config
node -e "const l = require('./scripts/loop.js'); console.log('exports:', Object.keys(l));"
