# arc-researching Refinement Tasks

> **Goal:** Close 3 structural gaps in arc-researching by adding Strategy section, Trials support, and external research to Stuck Protocol
> **Architecture:** All edits to single file `skills/arc-researching/SKILL.md` — no new files or infrastructure
> **Tech Stack:** Markdown skill definition, pytest for validation

> **For Claude:** Use arc-executing-tasks to implement.

## Context

Design doc: `docs/plans/2026-04-07-arc-researching-refinement-design.md`
Reference: `~/GitHub/AI/autoresearch/program.md` (autoresearch's strategy document pattern)

## Tasks

### Task 1: Add tests for new Strategy and Trials sections

**Files:**
- Modify: `tests/skills/test_skill_arc_researching.py`

**Step 1: Add test for Strategy section**
```python
def test_arc_researching_has_strategy_section():
    """Test skill documents strategy guidance for hypothesis generation."""
    text = _read_skill()

    # Must have strategy-related content in template
    assert "## Strategy" in text
    assert "playbook" in text.lower() or "hypothesis playbook" in text.lower()
    assert "research sources" in text.lower()
    assert "first moves" in text.lower()
```

**Step 2: Add test for Trials field**
```python
def test_arc_researching_has_trials_support():
    """Test skill documents multi-trial evaluation for stochastic judges."""
    text = _read_skill()

    # Must have trials field in contract template
    assert "Trials:" in text or "trials" in text.lower()
    assert "Aggregation:" in text or "aggregation" in text.lower()

    # Must have guidance for choosing trial count
    assert "deterministic" in text.lower() or "stochastic" in text.lower()
```

**Step 3: Add test for external research in Stuck Protocol**
```python
def test_arc_researching_stuck_protocol_includes_external_research():
    """Test stuck protocol leverages external research tools."""
    text = _read_skill()

    # Must mention external research when stuck
    assert "WebSearch" in text or "search" in text.lower()
    assert "documentation" in text.lower() or "docs" in text.lower()
```

**Step 4: Run tests**
Run: `npm run test:skills -- -k test_skill_arc_researching -v`
Expected: 3 new tests FAIL (Strategy/Trials/external research not yet in SKILL.md)

**Step 5: Commit**
`git commit -m "test(skills): add tests for arc-researching strategy, trials, external research"`

---

### Task 2: Add Strategy section to research-config.md template

**Files:**
- Modify: `skills/arc-researching/SKILL.md`

**Step 1: Insert Strategy section between Goal and Evaluation in template (after line 84, before line 86)**

Replace this block in the template:
```markdown
## Goal
Metric: {metric name, e.g., "build_time_seconds", "val_bpb", "p95_latency_ms"}
Direction: {lower-is-better | higher-is-better}
Target: {optional target value, e.g., "< 30s" or "none"}

## Evaluation
```

With:
```markdown
## Goal
Metric: {metric name, e.g., "build_time_seconds", "val_bpb", "p95_latency_ms"}
Direction: {lower-is-better | higher-is-better}
Target: {optional target value, e.g., "< 30s" or "none"}

## Strategy
Hypothesis playbook: {domain-specific approaches to try, ordered by likelihood}
Research sources: {docs URLs, reference implementations, config files to study}
First moves: {2-3 concrete starting experiments after baseline}

## Evaluation
```

**Step 2: Run tests**
Run: `npm run test:skills -- -k test_arc_researching_has_strategy_section -v`
Expected: PASS

**Step 3: Commit**
`git commit -m "feat(skills): add Strategy section to arc-researching contract template"`

---

### Task 3: Add Trials/Aggregation fields and update Phase 3 loop

**Files:**
- Modify: `skills/arc-researching/SKILL.md`

**Step 1: Add Trials and Aggregation to Evaluation section in template**

Replace:
```markdown
## Evaluation
Run command: {exact shell command to execute, e.g., "npm run build 2>&1"}
Extract metric: {grep/parse pattern to extract metric from output, e.g., "grep -oP 'Time: \K[\d.]+' build.log"}
Timeout: {seconds per experiment, e.g., "300"}
```

With:
```markdown
## Evaluation
Run command: {exact shell command to execute, e.g., "npm run build 2>&1"}
Extract metric: {grep/parse pattern to extract metric from output, e.g., "grep -oP 'Time: \K[\d.]+' build.log"}
Timeout: {seconds per experiment, e.g., "300"}
Trials: {1 | 3 | 5 — times to run per experiment; default 1 if omitted}
Aggregation: {median | mean — how to combine trial results; default median}
```

**Step 2: Add trials guidance table after Phase 1 Step 3 (after line 66, in the "Refine with Human" section)**

Add this paragraph to the end of Phase 1, before Phase 2:

```markdown
#### Choosing Trial Count

| Judge Type | Signal Stability | Recommended Trials |
|------------|-----------------|-------------------|
| Deterministic (build time, algorithm) | Stable ±2% | `1` |
| Semi-stochastic (E2E tests, flaky metrics) | Varies ±10% | `3` |
| Stochastic (LLM-graded eval, model behavior) | Varies ±30% | `5` with median |

The contract author decides at lock time, not the loop at runtime. If Trials is omitted from an existing contract, default to `1`.
```

**Step 3: Update Phase 3 loop steps 5-7**

Replace:
```
  5. RUN           — execute command, redirect ALL output to run.log (never tee or raw stdout)
  6. EXTRACT       — grep for metric in run.log (never read the full log)
  7. DECIDE        — improved? keep. Same/worse? revert. Crash? log + revert.
```

With:
```
  5. RUN           — execute command `trials` times → run-1.log, run-2.log, ... (never tee or raw stdout)
  6. EXTRACT       — grep metric from each log, compute aggregation (median/mean)
  7. DECIDE        — aggregated value improved? keep. Same/worse? revert. Crash? log + revert.
```

**Step 4: Run tests**
Run: `npm run test:skills -- -k test_arc_researching_has_trials_support -v`
Expected: PASS

**Step 5: Commit**
`git commit -m "feat(skills): add Trials/Aggregation support to arc-researching loop"`

---

### Task 4: Update Stuck Protocol with external research + remove suspicious footnote

**Files:**
- Modify: `skills/arc-researching/SKILL.md`

**Step 1: Update Stuck Protocol (insert step between lines 141-142)**

Replace:
```markdown
If **3 or more consecutive experiments** fail in the same direction (e.g., all trying to reduce allocations):
1. Stop that line of investigation entirely
2. Read all results so far and identify untried approaches
3. Choose a fundamentally different direction
4. If all major directions exhausted, try combinations of previously successful changes
```

With:
```markdown
If **3 or more consecutive experiments** fail in the same direction (e.g., all trying to reduce allocations):
1. Stop that line of investigation entirely
2. Read all results so far and identify untried approaches
3. Research — search for domain knowledge you don't have yet:
   - Read documentation for tools/libraries in the target files
   - WebSearch for optimization techniques in this domain
   - Check the Strategy section's research sources for unexplored leads
   - Look at similar projects or reference implementations for patterns
4. Choose a fundamentally different direction informed by your research
5. If all major directions exhausted, try combinations of previously successful changes
```

**Step 2: Update "Idea generation when stuck" list**

Replace:
```markdown
**Idea generation when stuck:**
- Re-read the target files for angles you missed on first read
- Try combining two previously successful changes
- Try the opposite of your last 3 failed approaches
- Try removing code instead of adding it — simplification often unlocks performance
```

With:
```markdown
**Idea generation when stuck:**
- Re-read the target files for angles you missed on first read
- Search docs/web for domain-specific techniques you haven't tried
- Read the Strategy section's research sources for unexplored leads
- Try combining two previously successful changes
- Try the opposite of your last 3 failed approaches
- Try removing code instead of adding it — simplification often unlocks performance
```

**Step 3: Remove the "If results are suspicious" footnote (lines 224-228)**

Replace:
```markdown
**If results are suspicious:**
1. Check if the evaluation command is deterministic (run it twice, compare)
2. Check if the metric extraction pattern matches correctly
3. Check if external factors (network, disk, other processes) affect the metric
4. If non-deterministic: run each experiment 3 times and use the median
```

With:
```markdown
**If results are suspicious:**
1. Check if the metric extraction pattern matches correctly
2. Check if external factors (network, disk, other processes) affect the metric
3. If variance is higher than expected, increase Trials in the contract (requires human approval to unlock and re-lock)
```

**Step 4: Run tests**
Run: `npm run test:skills -- -k test_arc_researching -v`
Expected: ALL arc-researching tests PASS (including new ones from Task 1)

**Step 5: Commit**
`git commit -m "feat(skills): add external research to arc-researching stuck protocol"`

---

### Task 5: Trim to word budget + final verification

Current SKILL.md is 1850 words. After Tasks 2-4, it'll be ~1970. Need to trim ~170 words to stay under 1800.

**Step 1: Trim candidates (pick enough to reach <1800w)**

| Section | Current Words | Trim Strategy |
|---------|--------------|---------------|
| `## When to Use` dot graph (lines 14-31) | ~90 | Replace graphviz with compact text |
| `## Common Rationalizations` table (lines 230-238) | ~80 | Cut to 3 most important rows |
| Verbose `## Completion Format` / `## Blocked Format` | ~60 | Tighten formatting |

**Step 2: Run word count**
Run: `wc -w skills/arc-researching/SKILL.md`
Expected: Under 1800 words

**Step 3: Run all skill tests**
Run: `npm run test:skills -v`
Expected: ALL PASS

**Step 4: Run full test suite**
Run: `npm test`
Expected: ALL 4 runners pass

**Step 5: Commit**
`git commit -m "refactor(skills): trim arc-researching to word budget"`

**Step 6: Commit task file cleanup**
`git rm docs/tasks/arc-researching-refinement-tasks.md && git commit -m "chore: remove completed task file"`
