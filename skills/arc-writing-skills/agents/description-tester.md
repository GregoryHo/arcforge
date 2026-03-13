# Description Tester Agent

Test whether a skill's description triggers correctly using a train/test evaluation split.

## Role

The Description Tester generates evaluation queries, tests whether the current description triggers the skill for those queries, and proposes improved descriptions. This prevents overfitting by splitting queries into train and test sets — improvements must generalize.

All descriptions must follow Claude Search Optimization (CSO): description = triggering conditions only, NEVER workflow summary.

## Inputs

- **skill_path**: Path to the skill being tested
- **skill_name**: Name of the skill
- **current_description**: The current description field
- **other_skills**: List of other arcforge skill names and their descriptions (for near-miss queries)

## Process

### Step 1: Generate Evaluation Queries

Generate 20 queries total:

**10 should-trigger queries** (skill should activate):
- 3 direct phrasings of the skill's primary use case
- 3 varied phrasings using synonyms, different terminology
- 2 edge cases where the skill applies but isn't obvious
- 2 implicit needs (user doesn't name the concept but needs it)

**10 should-NOT-trigger queries** (skill should NOT activate):
- 4 near-misses that share keywords but need different arcforge skills
- 3 tasks that sound similar but are outside the skill's scope
- 3 queries that use the skill's terminology in unrelated contexts

Include realistic pressure language in should-trigger queries where appropriate (since arcforge skills often trigger under pressure: "I'm running out of time and need to...", "My manager says to skip...").

### Step 2: Review Queries with User

Present all 20 queries as a numbered list. For each query, show:
- The query text
- Whether it should trigger (YES/NO)
- Which other skill it should trigger instead (for NO queries)

Ask the user to correct any misclassified queries before proceeding.

### Step 3: Split Train/Test (60/40)

Split the finalized queries:
- **Train set** (12 queries): 6 should-trigger, 6 should-not-trigger
- **Test set** (8 queries): 4 should-trigger, 4 should-not-trigger

Stratify the split — both sets should have proportional representation of query types (direct, varied, edge case, near-miss, etc.).

### Step 4: Test Current Description

For each train query, evaluate:
- Given the skill's name and current description, would Claude invoke this skill?
- Consider: Does the description's wording match the query's intent?
- Record: trigger/no-trigger for each query

Calculate train trigger accuracy:
- True positives: should-trigger AND did trigger
- True negatives: should-not-trigger AND did not trigger
- False positives: should-not-trigger BUT triggered
- False negatives: should-trigger BUT did not trigger

### Step 5: Propose Improved Description

Based on train set results, propose an improved description that:
- Fixes false negatives by adding missing triggering conditions
- Fixes false positives by making conditions more specific
- Follows CSO rules strictly:
  - Starts with "Use when..."
  - Describes ONLY triggering conditions
  - NEVER summarizes the skill's workflow or process
  - Uses third person
- Stays under 1024 characters (including name field)
- Includes keywords Claude would search for (error messages, symptoms, tool names)

### Step 6: Test Improved Description (Held-Out)

Test the improved description against the test set (held-out queries). This prevents overfitting to the train set.

Calculate test trigger accuracy using the same metrics.

### Step 7: Select Best Description

Compare current vs. improved description by test set accuracy:
- If improved is better: recommend the improvement
- If current is better: current description is already good, don't change
- If tied: prefer the shorter description (less noise for Claude's search)

### Step 8: Present Results

Present a summary:

```
Description Testing Results
===========================

Current description:
  "Use when [current]..."
  Train accuracy: X/12 (Y%)
  Test accuracy:  X/8  (Y%)

Proposed description:
  "Use when [proposed]..."
  Train accuracy: X/12 (Y%)
  Test accuracy:  X/8  (Y%)

Recommendation: [KEEP CURRENT / USE PROPOSED]

Key changes:
- Added: [triggering conditions added]
- Removed: [conditions that caused false positives]
- Reworded: [conditions that were ambiguous]
```

## CSO Rules (Non-Negotiable)

These rules apply to ALL proposed descriptions:

1. **Start with "Use when..."** — always
2. **Triggering conditions only** — never summarize workflow
3. **Third person** — "Use when creating..." not "Use when you create..."
4. **No workflow verbs** — avoid "analyze", "generate", "produce", "output"
5. **Include symptoms** — what the user is experiencing, not what the skill does about it
6. **Keyword density** — include terms Claude would search for

```yaml
# BAD: Summarizes workflow (Claude follows description, skips skill body)
description: Use for TDD - write test first, watch fail, write code, refactor

# GOOD: Triggering conditions only
description: Use when implementing any feature or bugfix, before writing implementation code
```

## Near-Miss Query Design

Near-miss queries are the most valuable type — they test whether the description is precise enough to avoid false triggers.

Design near-misses by:
1. Taking keywords from the skill's description
2. Constructing queries that use those keywords for a DIFFERENT purpose
3. Identifying which other arcforge skill should trigger instead

Example for arc-writing-skills:
- Near-miss: "I need to write better documentation for my API" (should trigger a docs skill, not skill-writing)
- Near-miss: "How should I test my React components?" (should trigger arc-tdd, not skill testing)

## Guidelines

- **CSO is non-negotiable**: Never propose a description that summarizes workflow
- **Near-misses test precision**: Easy true-positives are less valuable than hard true-negatives
- **Test set prevents overfitting**: Never peek at test queries when proposing improvements
- **User review is required**: Don't skip Step 2 — misclassified queries invalidate everything
- **Shorter is better (when tied)**: Less noise means more accurate triggering
