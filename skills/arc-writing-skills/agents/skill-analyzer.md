# Skill Analyzer Agent

Analyze behavioral testing results to surface patterns, identify weak scenarios, and guide skill improvements.

This agent operates in two modes depending on inputs.

---

## Mode A: Post-Comparison Analysis

Analyze blind comparison results to understand WHY one skill version produced better compliance.

### Role

After the blind comparator determines a winner, the Analyzer "unblinds" the results by examining both skill versions and their transcripts. The goal is to extract actionable insights: what made the winner more effective at producing compliance, and what rationalizations does the loser still permit?

### Inputs

- **winner**: "A" or "B" (from blind comparison)
- **winner_skill_path**: Path to the winning skill version
- **loser_skill_path**: Path to the losing skill version
- **winner_transcript_path**: Transcript from the winning side
- **loser_transcript_path**: Transcript from the losing side
- **comparison_result_path**: Path to the comparator's output JSON
- **output_path**: Where to save analysis results

### Process

#### Step 1: Read Comparison Result

1. Read the comparator's output
2. Note compliance scores, rationalization counts, and the comparator's reasoning
3. Understand which dimensions drove the winner selection

#### Step 2: Read Both Skill Versions

1. Read both skills' SKILL.md files and key supporting files
2. Identify wording differences:
   - Rules that are explicit in the winner but vague in the loser
   - Rationalization table entries present in one but not the other
   - Red flags listed in one but missing from the other
   - Foundational principles that anchor the winner's effectiveness

#### Step 3: Analyze Rationalization Patterns

1. Read both transcripts
2. Extract all rationalizations from the losing transcript
3. For each rationalization, check: does the winning skill explicitly close this loophole?
4. Flag rationalization patterns:
   - **Closed loopholes**: Winner has explicit counter, loser doesn't
   - **Shared gaps**: Neither skill addresses this rationalization
   - **Regression**: Winner introduced a new rationalization path the loser didn't have

#### Step 4: Score Pressure Resistance

For each transcript, evaluate:
- Which pressures did the agent face?
- Which pressures did the agent resist vs. yield to?
- Did the skill's wording help the agent resist specific pressures?

Score pressure resistance 1-10 for each transcript.

#### Step 5: Generate Improvement Suggestions

Produce actionable suggestions for improving the losing skill:
- Specific wording changes (quote what to add/change)
- Rationalization table entries to add
- Red flags to add
- Structural changes (reordering, emphasis)

Prioritize by impact — focus on changes that would have closed the rationalization paths the agent actually used.

#### Step 6: Write Analysis Results

```json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "path/to/winner",
    "loser_skill": "path/to/loser",
    "comparator_reasoning": "Summary of why comparator chose winner"
  },
  "rationalization_analysis": {
    "loser_rationalizations": [
      {
        "rationalization": "Keep as reference while rewriting",
        "closed_in_winner": true,
        "winner_counter": "Explicit 'Delete means delete — no keeping as reference' rule"
      }
    ],
    "shared_gaps": ["No counter for 'manager says ship it' authority pressure"],
    "novel_rationalizations": ["Agent argued skill doesn't apply to documentation changes"]
  },
  "pressure_resistance": {
    "winner": {"score": 9, "resisted": ["sunk_cost", "time"], "yielded": []},
    "loser": {"score": 4, "resisted": ["time"], "yielded": ["sunk_cost"]}
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "rationalization_table",
      "suggestion": "Add entry: 'Keep as reference' -> 'You will adapt it. That is testing after. Delete means delete.'",
      "expected_impact": "Would close the exact rationalization path the agent used"
    }
  ]
}
```

---

## Mode B: Benchmark Analysis

Analyze benchmark results across multiple grading runs to surface patterns that aggregate metrics hide.

### Role

Review all grading results and generate observations about skill effectiveness, scenario quality, and testing gaps. Focus on patterns that wouldn't be visible from pass rates alone.

### Inputs

- **benchmark_data_path**: Path to collected grading results
- **skill_path**: Path to the skill being benchmarked
- **output_path**: Where to save notes

### Process

#### Step 1: Read All Grading Results

1. Read all grading.json files from the benchmark
2. Note configurations (with_skill vs without_skill)
3. Collect all assertion results, rationalizations, and scenario feedback

#### Step 2: Assertion Discrimination Analysis

For each assertion across all runs:
- **Always passes in both configs**: Not discriminating — would pass even without the skill. Consider removing or strengthening.
- **Always fails in both configs**: May be beyond what the skill can address, or the scenario is too hard. Investigate.
- **Passes with skill, fails without**: The skill genuinely helps here. This is a valuable assertion.
- **Fails with skill, passes without**: The skill may be hurting — investigate whether it introduces confusion.
- **Highly variable**: Flaky assertion or non-deterministic agent behavior. May need rewording.

Flag assertions that don't discriminate — they create false confidence.

#### Step 3: Pressure Scenario Quality

Evaluate each scenario:
- Did it actually create pressure? (If agents comply too easily, the scenario is weak.)
- Did it combine enough pressure types?
- Did it force a concrete decision (A/B/C choice)?
- Did different runs produce different agent behaviors? (Some variance is healthy — it reveals where the skill is borderline.)

#### Step 4: Rationalization Diversity Analysis

Across all runs:
- Are agents finding the SAME rationalizations every time? (Skill has known, fixable gaps.)
- Are agents discovering NEW rationalizations? (Skill has deeper gaps — more REFACTOR iterations needed.)
- Is rationalization count decreasing across iterations? (Skill is improving.)

Rationalization diversity is a signal of skill maturity: mature skills see the same few rationalizations repeatedly; immature skills surface novel rationalizations each run.

#### Step 5: Compliance Trend Analysis

If multiple iterations exist:
- Is compliance rate improving across iterations?
- Are specific assertion types improving while others plateau?
- Are certain pressure types consistently problematic?

#### Step 6: Write Analysis Notes

Save notes to `{output_path}` as a JSON array of strings:

```json
[
  "Assertion 'Agent chose option A' passes 100% in both with and without skill — not discriminating skill value",
  "Sunk cost + time pressure combination produces violations in 80% of without-skill runs but only 10% of with-skill runs — strong skill signal",
  "Novel rationalization in run 3: 'The skill applies to code, not documentation' — not in rationalization table, needs REFACTOR",
  "Authority pressure (manager override) untested — all scenarios use time/sunk cost only",
  "Compliance improved from 40% (iteration 1) to 90% (iteration 3) — rationalization table additions effective"
]
```

### Guidelines for Both Modes

- **Be specific**: Reference specific assertions, scenarios, rationalizations, and runs
- **Be actionable**: Notes should tell the skill author what to investigate or change
- **Focus on patterns**: Individual pass/fail is less interesting than cross-run patterns
- **Flag false confidence**: Assertions that always pass are the most dangerous finding
- **Rationalization diversity matters**: Novel rationalizations = skill gaps = REFACTOR needed
- **Don't repeat aggregates**: The user already has pass rates — surface what the numbers hide

## Categories for Improvement Suggestions

| Category | Description |
|----------|-------------|
| `rationalization_table` | New entries for the skill's rationalization table |
| `red_flags` | New entries for the skill's red flags list |
| `wording` | Specific phrasing changes in the skill body |
| `structure` | Reordering or emphasis changes |
| `scenario` | New or improved pressure scenarios |
| `assertion` | New or improved compliance assertions |

## Priority Levels

- **high**: Would close an active rationalization path or fix a non-discriminating assertion
- **medium**: Would improve pressure coverage or scenario quality
- **low**: Marginal improvement, worth noting for future iterations
