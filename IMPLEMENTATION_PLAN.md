# Learning System Refinement Implementation Plan

## Overview
Fixing 4 architectural issues in the dual-track learning system on `feature/refine-learning` branch.

## Stage 1: Fix Context Injection (P0)
**Goal**: Split session-tracker start hook into sync + async to enable context injection
**Success Criteria**:
- New sync hook `inject-context.js` outputs JSON with additionalContext
- Async `start.js` continues to handle background tasks
- `hooks.json` has both entries for SessionStart
- Context appears in Claude on session start
**Tests**: Start new session, verify Claude receives instincts/session context
**Status**: Complete

## Stage 2: Merge Stop Hooks (P0)
**Goal**: Consolidate session-evaluator into end.js to eliminate duplicate blocking prompts
**Success Criteria**:
- `end.js` includes pattern extraction as Step 4
- `hooks.json` removes session-evaluator Stop entry
- Only one blocking prompt on Stop
**Tests**: Trigger Stop, verify single consolidated prompt
**Status**: Complete

## Stage 3: Unify Bubble-up Logic (P1)
**Goal**: Move bubble-up logic from bash to Node.js for single source of truth
**Success Criteria**:
- `global-index.js` has CLI entry with --check-promote flag
- `observer-daemon.sh` calls Node.js instead of inline bash
- Bubble-up behavior consistent
**Tests**: Create same instinct in 2 projects, verify global promotion
**Status**: Complete

## Stage 4: Observer Daemon Output Capture (P1)
**Goal**: Capture and verify instinct creation from daemon analysis
**Success Criteria**:
- `analyze_project()` captures claude stdout
- Verifies .md files in instincts directory
- Logs success/failure with retry logic
**Tests**: Run observer daemon, check logs for instinct creation results
**Status**: Complete

## Verification
- [x] All pytest tests pass: `pytest tests/ -v` (82/82 tests passing)
- [ ] Manual testing of all 4 stages (see IMPLEMENTATION_COMPLETE.md for test guide)

## Implementation Summary

All 4 stages completed successfully:

1. **Context Injection Fixed**: Created `inject-context.js` as sync hook, `start.js` remains async for background tasks
2. **Stop Hooks Merged**: Consolidated session-evaluator pattern extraction into `end.js` Step 4
3. **Bubble-up Unified**: Added CLI to `global-index.js`, daemon now calls Node.js for consistency
4. **Daemon Output Captured**: Analysis output captured, verified, logged with retry logic
