# Eval: compact-suggester-phases

## Scope
skill

## Scenario
Verify that the compact-suggester hook provides phase-aware messaging based on read/write tool ratios. The hook should distinguish between exploration phases (read-heavy) and implementation phases (write-heavy), and adjust its compaction suggestions accordingly.

## Context
The compact-suggester hook in hooks/compact-suggester/main.js tracks in-memory read and write counters. It classifies phases as read-heavy (>70% reads with 10+ samples) or write-heavy (>60% writes with 10+ samples). At the 50-call threshold, it suggests compaction for read-heavy phases and warns against mid-implementation compaction for write-heavy phases.

## Assertions
- [ ] shouldSuggest returns false below 50-call threshold
- [ ] shouldSuggest returns true at threshold (50)
- [ ] shouldSuggest returns true at intervals (75, 100, 125)
- [ ] shouldSuggest returns false between intervals
- [ ] Read-heavy phase gets exploration-specific message
- [ ] Write-heavy phase suppresses non-critical reminders

## Grader
code

## Grader Config
cd hooks && npm test
