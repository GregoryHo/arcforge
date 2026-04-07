# arc-researching Refinement Design

## Vision

Refine arc-researching to close 3 structural gaps found by comparing against autoresearch (the reference implementation for autonomous hypothesis-driven experimentation). The goal: make arc-researching effective across diverse domains — build optimization, algorithm tuning, skill improvement, E2E test generation — not just ML training.

## Architecture Decision

All 3 fixes modify the existing `arc-researching/SKILL.md` — no new files, no new infrastructure. The research-config.md template gains 2 new fields, the Phase 3 loop gains trial support, and the Stuck Protocol gains external research.

## Gap Analysis (vs autoresearch reference)

| Gap | Severity | Root Cause |
|-----|----------|------------|
| Missing strategy document | High | research-config.md defines WHAT to measure but not HOW to generate hypotheses |
| No deterministic vs stochastic judge handling | High | Single-trial evaluation is unreliable for LLM-graded or noisy metrics |
| No external research in loop | Medium | Stuck Protocol only says "re-read files" — doesn't leverage WebSearch/docs |

## Fix 1: Add Strategy Section to research-config.md Template

Add a `## Strategy` section between Goal and Evaluation in the template:

```markdown
## Strategy
Hypothesis playbook: {domain-specific approaches to try, ordered by likelihood}
Research sources: {docs URLs, reference implementations, config files to study}
First moves: {2-3 concrete starting experiments after baseline}
```

### Domain Examples

**Build time optimization:**
```markdown
## Strategy
Hypothesis playbook: parallelization, caching, tree-shaking, lazy imports, code splitting, dependency pruning
Research sources: https://esbuild.github.io/api/, webpack docs, project's bundler config
First moves: 1) Enable source-map=false for prod, 2) Profile with --stats to find slow modules, 3) Try esbuild-loader swap
```

**Skill optimization:**
```markdown
## Strategy
Hypothesis playbook: tighten phrasing, add counter-examples, remove ambiguity, reorder sections, add routing triggers
Research sources: eval transcripts in .eval-trials/, existing high-scoring skills for patterns
First moves: 1) Read baseline eval transcripts to find deviation points, 2) Add explicit counter for top deviation, 3) Test with k=3
```

This is the equivalent of autoresearch's `program.md` — the human programs the agent's research style via this section.

## Fix 2: Promote Trials from Footnote to Contract Field

### Contract Change

Add `Trials` and `Aggregation` to the Evaluation section:

```markdown
## Evaluation
Run command: {exact shell command}
Extract metric: {grep pattern}
Timeout: {seconds per experiment}
Trials: {1 | 3 | k — how many times to run per experiment}
Aggregation: {median | mean — how to combine trial results}
```

### Loop Change

Phase 3 steps 5-7 change from:

```
5. RUN           — execute command, redirect ALL output to run.log
6. EXTRACT       — grep for metric in run.log
7. DECIDE        — improved? keep. Same/worse? revert.
```

To:

```
5. RUN           — execute command `trials` times → run-1.log, run-2.log, ...
6. EXTRACT       — grep metric from each log, compute aggregation (median/mean)
7. DECIDE        — aggregated value improved? keep. Same/worse? revert.
```

### Guidance for Phase 1 Contract Negotiation

| Judge Type | Signal Stability | Recommended Trials |
|------------|-----------------|-------------------|
| Deterministic (build time, algorithm) | Stable ±2% | `1` |
| Semi-stochastic (E2E tests, flaky metrics) | Varies ±10% | `3` |
| Stochastic (LLM-graded eval, model behavior) | Varies ±30% | `5` with median |

The contract author decides at lock time, not the loop at runtime.

## Fix 3: Add External Research to Stuck Protocol

### Stuck Protocol Change

Add step 2.5 between "identify untried approaches" and "choose new direction":

```
2.5. RESEARCH — search for domain knowledge you don't have yet
    - Read documentation for tools/libraries in the target files
    - WebSearch for optimization techniques in this domain
    - Check the Strategy section's research sources for unexplored leads
    - Look at similar projects or reference implementations for patterns
```

### Idea Generation Update

Add 2 lines to the existing "Idea generation when stuck" list:

```
- Re-read the target files for angles you missed
- Search docs/web for domain-specific techniques you haven't tried
- Read the Strategy section's research sources for unexplored leads
- Try combining two previously successful changes
- Try the opposite of your last 3 failed approaches
- Try removing code instead of adding it
```

## What Does NOT Change

- Fixed judge / free player principle
- results.tsv format and untracked status
- Context discipline (redirect, grep, don't read full logs)
- Keep/discard/crash decision framework
- NEVER STOP autonomy
- Resume protocol
- Dashboard integration
- Phase 1-4 structure

## Implementation Scope

Single file change: `skills/arc-researching/SKILL.md`

1. Add `## Strategy` section to research-config.md template (after Goal, before Evaluation)
2. Add `Trials` and `Aggregation` fields to Evaluation section
3. Add trials guidance table to Phase 1 description
4. Update Phase 3 loop steps 5-7 for multi-trial support
5. Update Stuck Protocol with external research step
6. Update "Idea generation when stuck" list
7. Remove the "If results are suspicious" footnote (now handled by contract-level Trials field)

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: research-config.md template includes Strategy section with hypothesis playbook, research sources, and first moves
- REQ-F002: research-config.md Evaluation section includes Trials (1|3|k) and Aggregation (median|mean) fields
- REQ-F003: Phase 3 loop executes evaluation command `trials` times per experiment and aggregates results
- REQ-F004: Stuck Protocol includes external research step (WebSearch, docs, strategy sources)
- REQ-F005: Phase 1 includes guidance table for choosing trial count based on judge determinism

### Non-Functional Requirements

- REQ-N001: All changes in a single file (SKILL.md) — no new infrastructure
- REQ-N002: Backward compatible — existing research-config.md files with Trials omitted default to 1
- REQ-N003: Word count stays within Comprehensive tier (<1800w)

### Constraints

- Zero external dependencies (arcforge architecture rule)
- Skill must remain a single SKILL.md file
- Changes must not break existing research-config.md contracts (Trials defaults to 1 if absent)
<!-- REFINER_INPUT_END -->
