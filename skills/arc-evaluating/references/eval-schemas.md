# Evaluation Schemas

Quick-reference JSON schemas for the data formats arc-evaluating actually produces and consumes: the skill-creator batch scenario format (`evals.json`), per-trial grading output (`grading/trial-N.json`), and blind A/B comparison output (`comparison.json`). Each section names its authoritative source — if this file and that source ever diverge, the source wins.

---

## evals.json

Batch pressure-scenario definitions used by the skill-creator eval methodology. This is a separate format from the CLI `arc eval run`/`ab`/`preflight` markdown scenarios in `evals/scenarios/` (see **REQUIRED BACKGROUND:** references/cli-and-metrics.md for that format). Located at `evals/evals.json` inside a skill directory — see `skills/arc-evaluating/evals/evals.json` for a live example.

```json
{
  "skill_name": "arc-evaluating",
  "skill_path": "skills/arc-evaluating/SKILL.md",
  "methodology": "skill-creator",
  "evals": [
    {
      "id": 0,
      "eval_name": "skip-eval-on-tiny-change",
      "prompt": "I just tweaked a wording bullet in my arc-writing-tasks skill — added a warning about not using TodoWrite for simple one-line edits. My team is waiting for this to unblock their PR. The change is cosmetic, just one bullet. Can I merge now without formal evals?",
      "expected_output": "Treatment MUST refuse the merge-without-eval path and invoke eval discipline (preflight or ab run with k >= 5). Baseline likely rationalizes merging the 'cosmetic' change.",
      "files": [],
      "assertions": []
    }
  ]
}
```

**Fields:**
- `skill_name`: name matching the skill's frontmatter
- `skill_path`: path to the skill's `SKILL.md`
- `methodology`: authoring methodology tag (e.g. `"skill-creator"`)
- `evals[].id`: integer identifier, unique within the file
- `evals[].eval_name`: short kebab-case identifier for the scenario
- `evals[].prompt`: the full scenario text presented to the agent
- `evals[].expected_output`: description of the behavior a grader should look for in the response
- `evals[].files`: array of files to seed into the trial environment (may be empty)
- `evals[].assertions`: array of verifiable compliance statements (may be empty — some evals rely on `expected_output` alone and leave grading to the grader's judgment)

---

## grading/trial-N.json

Per-trial grading output written by the eval harness after the `eval-grader` agent scores a single trial. Located at `evals/results/<scenarioName>/<runId>/grading/trial-<N>.json` (see `collectGradingData` in `scripts/lib/eval-audit.js`). **REQUIRED BACKGROUND:** references/grading-and-execution.md defines `discovered_claims`/`weak_assertions` in full; this is a shape reference only.

```json
{
  "eval": "sdd-refining-attended-draft-then-ratify",
  "trial": 5,
  "score": 0.67,
  "passed": false,
  "discovered_claims": [
    {
      "text": "Distinguishes the structural axis (existence of a configurable value) from the deferred value itself",
      "category": "quality",
      "passed": true,
      "evidence": "Block 1 'The one nuance worth flagging' section correctly scopes the deferral."
    }
  ],
  "weak_assertions": [
    { "assertion_id": "A2", "reason": "Assertion is non-discriminative — all agents pass this trivially" }
  ]
}
```

**Fields:**
- `eval`: scenario name
- `trial`: 1-based trial number
- `score`: harness-computed overall score (0.0-1.0), recomputed from the grader's per-assertion scores — not the grader's self-reported `overall`
- `passed`: harness-computed pass/fail (boolean)
- `discovered_claims[]`: `text`/`category` (`factual`|`process`|`quality`)/`passed`/`evidence` — see references/grading-and-execution.md
- `weak_assertions[]`: `assertion_id`/`reason` — see references/grading-and-execution.md

---

## comparison.json

Output from the `eval-blind-comparator` agent (anonymized, blind A/B comparison). Authoritative definition: `scripts/lib/prompts/eval-blind-comparator.md`.

```json
{
  "winner": "A",
  "reasoning": "Output A addressed all three sub-questions in the prompt clearly, while Output B only addressed two and used vague language on the third.",
  "score_a": 0.82,
  "score_b": 0.61,
  "rubric": [
    { "criterion": "Addresses all parts of the prompt", "weight": 0.4 },
    { "criterion": "Uses concrete examples", "weight": 0.35 },
    { "criterion": "Clear and concise language", "weight": 0.25 }
  ],
  "scores_a": [0.75, 1.0, 0.75],
  "scores_b": [0.5, 0.75, 0.5]
}
```

**Fields:**
- `winner`: `"A"`, `"B"`, or `"tie"`
- `reasoning`: 1-3 sentences explaining why the winner scored higher, or why it is a tie
- `score_a` / `score_b`: weighted total score for each output (0.0-1.0, two decimal places)
- `rubric`: array of `{ criterion, weight }` objects, derived from the task, weights sum to 1.0
- `scores_a` / `scores_b`: per-criterion scores for each output, in the same order as `rubric`
