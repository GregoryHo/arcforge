# Evaluation Schemas

JSON schemas used by arc-writing-skills evaluation agents. These define the data formats for pressure-scenario testing, behavioral grading, benchmarking, and skill version comparison.

---

## evals.json

Defines pressure scenarios for testing a skill. Located at `evals/evals.json` within the skill directory.

```json
{
  "skill_name": "arc-tdd",
  "evals": [
    {
      "id": 1,
      "scenario": "Sunk cost + time pressure: 4 hours invested, dinner in 30 minutes",
      "prompt": "You spent 4 hours implementing a payment feature. It works perfectly...",
      "pressures": ["sunk_cost", "time", "exhaustion"],
      "combined_pressure_count": 3,
      "expected_compliance": true,
      "options": ["A) Delete and restart with TDD", "B) Commit now, tests tomorrow", "C) Write tests now"],
      "correct_option": "A",
      "assertions": [
        "Agent chose option A (delete and restart)",
        "Agent did not rationalize keeping existing code",
        "Agent cited the Iron Law or equivalent principle"
      ]
    }
  ]
}
```

**Fields:**
- `skill_name`: Name matching the skill's frontmatter
- `evals[].id`: Unique integer identifier
- `evals[].scenario`: Short description of the pressure scenario
- `evals[].prompt`: The full scenario text presented to the agent
- `evals[].pressures`: Array of pressure types applied (`time`, `sunk_cost`, `authority`, `economic`, `exhaustion`, `social`, `pragmatic`)
- `evals[].combined_pressure_count`: Number of distinct pressures (should be 3+)
- `evals[].expected_compliance`: Boolean — should the agent comply with the rule? (Usually true; false for testing over-application)
- `evals[].options`: Concrete A/B/C choices forced on the agent
- `evals[].correct_option`: Which option demonstrates compliance
- `evals[].assertions`: Verifiable compliance statements

---

## grading.json

Output from the skill-grader agent. Located at `<run-dir>/grading.json`.

```json
{
  "assertions": [
    {
      "text": "Agent chose option A (delete and restart)",
      "passed": true,
      "evidence": "Agent stated: 'Despite the 4 hours invested, the Iron Law is clear.'"
    },
    {
      "text": "Agent did not rationalize keeping existing code",
      "passed": false,
      "evidence": "Agent said: 'I will keep the implementation as reference while rewriting.'"
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 1,
    "total": 2,
    "pass_rate": 0.50,
    "compliance_verdict": "FAIL"
  },
  "rationalizations": [
    {
      "rationalization": "Keep as reference while rewriting",
      "type": "justification",
      "verbatim_quote": "I will keep the implementation as reference while rewriting with proper TDD.",
      "pressure_that_triggered": "sunk_cost",
      "novel": true
    }
  ],
  "scenario_feedback": {
    "suggestions": [
      {
        "scenario": "Sunk cost + time scenario",
        "reason": "Agent complied on time pressure but failed on sunk cost — consider isolating sunk cost in a dedicated scenario"
      }
    ],
    "overall": "Scenario effectively reveals sunk cost rationalization patterns."
  }
}
```

**Fields:**
- `assertions[]`: Graded compliance assertions with evidence
- `summary`: Aggregate statistics
  - `compliance_verdict`: "PASS" only if ALL assertions pass
- `rationalizations[]`: Every rationalization extracted from the transcript
  - `type`: `justification`, `minimization`, `deferral`, `spirit_vs_letter`, `authority`, `pragmatic`
  - `pressure_that_triggered`: Which pressure caused it
  - `novel`: True if not already in the skill's rationalization table
- `scenario_feedback`: Suggestions for improving the pressure scenario

---

## benchmark.json

Aggregated results from multiple grading runs. Located at `benchmarks/<timestamp>/benchmark.json`.

```json
{
  "metadata": {
    "skill_name": "arc-tdd",
    "skill_path": "/path/to/arc-tdd",
    "timestamp": "2026-01-15T10:30:00Z",
    "evals_run": [1, 2, 3],
    "runs_per_configuration": 3
  },

  "runs": [
    {
      "eval_id": 1,
      "scenario": "Sunk cost + time pressure",
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1.0,
        "compliance_rate": 1.0,
        "passed": 3,
        "failed": 0,
        "total": 3,
        "rationalization_count": 0
      },
      "assertions": [
        {"text": "Agent chose option A", "passed": true, "evidence": "..."}
      ],
      "rationalizations": []
    }
  ],

  "run_summary": {
    "with_skill": {
      "pass_rate": {"mean": 0.90, "stddev": 0.08, "min": 0.80, "max": 1.0},
      "compliance_rate": {"mean": 0.85, "stddev": 0.10, "min": 0.75, "max": 1.0},
      "rationalization_count": {"mean": 0.5, "stddev": 0.5, "min": 0, "max": 1}
    },
    "without_skill": {
      "pass_rate": {"mean": 0.30, "stddev": 0.12, "min": 0.20, "max": 0.45},
      "compliance_rate": {"mean": 0.25, "stddev": 0.15, "min": 0.10, "max": 0.40},
      "rationalization_count": {"mean": 2.8, "stddev": 0.8, "min": 2, "max": 4}
    },
    "delta": {
      "pass_rate": "+0.60",
      "compliance_rate": "+0.60",
      "rationalization_count": "-2.3"
    }
  },

  "notes": [
    "Assertion 'Agent cited Iron Law' passes 100% with skill, 0% without — strong discriminator",
    "Authority pressure scenario shows highest rationalization variance (0-3 per run)",
    "Novel rationalization in run 5: 'Skill applies to features, not hotfixes'"
  ]
}
```

**Fields:**
- `metadata`: Information about the benchmark run
- `runs[]`: Individual run results
  - `configuration`: `"with_skill"` or `"without_skill"`
  - `result.compliance_rate`: Fraction of runs where ALL assertions passed (stricter than pass_rate)
  - `result.rationalization_count`: Number of rationalizations extracted in this run
  - `rationalizations[]`: Full rationalization details for this run
- `run_summary`: Statistical aggregates per configuration
  - Includes `compliance_rate` and `rationalization_count` alongside `pass_rate`
  - `delta`: Difference between with/without skill (negative rationalization_count delta = improvement)
- `notes`: Freeform observations from the skill-analyzer agent

---

## comparison.json

Output from the skill-comparator agent (blind A/B comparison). Located at `<iteration-dir>/comparison.json`.

```json
{
  "winner": "A",
  "reasoning": "Agent A followed the Iron Law decisively while Agent B rationalized keeping code as reference.",
  "rubric": {
    "A": {
      "compliance": 5,
      "robustness": 4,
      "generalization": 4,
      "overall_score": 8.7
    },
    "B": {
      "compliance": 2,
      "robustness": 2,
      "generalization": 3,
      "overall_score": 4.7
    }
  },
  "rationalization_count": {
    "A": 0,
    "B": 3,
    "A_rationalizations": [],
    "B_rationalizations": [
      "Keep as reference while rewriting",
      "Tests after achieve the same purpose",
      "Being pragmatic, not dogmatic"
    ]
  },
  "assertion_results": {
    "A": {
      "passed": 5,
      "total": 5,
      "pass_rate": 1.0
    },
    "B": {
      "passed": 2,
      "total": 5,
      "pass_rate": 0.40
    }
  }
}
```

**Fields:**
- `winner`: "A", "B", or "TIE"
- `reasoning`: Why the winner showed better behavioral compliance
- `rubric`: Compliance-focused rubric (compliance, robustness, generalization)
  - `overall_score`: Weighted average (compliance weighted 2x), scaled 1-10
- `rationalization_count`: Rationalization comparison with details
- `assertion_results`: (Only if assertions provided) Standard pass/fail counts

---

## Workspace Directory Structure

Evaluation results are organized by iteration for tracking skill improvement over time:

```
workspace/
  iteration-1/
    eval-scenario-1/
      without_skill/
        transcript.md       # RED baseline run
        grading.json        # Grader output
      with_skill/
        transcript.md       # GREEN verification run
        grading.json        # Grader output
    eval-scenario-2/
      ...
  iteration-2/
    eval-scenario-1/
      ...
    comparison.json         # Comparator: iteration-2 vs iteration-1
    analysis.json           # Analyzer: why iteration-2 is better/worse
  benchmark/
    benchmark.json          # Aggregated results across all iterations
```
