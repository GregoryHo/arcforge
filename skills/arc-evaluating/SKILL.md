---
name: arc-evaluating
description: Use when measuring whether skills, agents, or workflows actually change AI agent behavior — before shipping a new skill, after modifying an existing one, or when comparing alternative approaches
---

# arc-evaluating

Measure whether skills, agents, and workflows actually change AI agent behavior. Define scenarios, prepare environments, run trials, grade results, track regressions.

**Core principle:** "Unit tests for AI agent behavior" — if you can't measure improvement, you can't ship with confidence.

**Key distinction:** You are evaluating **AI agents** (LLM + tools), not just LLM text output. Agents use tools, read files, search codebases. Your eval environment must account for this.

## When to Use

Eval is required when:
- Shipping a new skill or agent
- Modifying an existing skill
- Comparing alternative approaches or prompts

Not required when: the change has no behavioral footprint (reformatting, typos, metadata-only edits). When in doubt, run the eval — it is cheaper than shipping a regression.

## Three Eval Scopes

### 1. Skill Evals

Does skill X change agent behavior?

- Run scenario WITHOUT the skill (baseline)
- Run scenario WITH the skill (treatment)
- Compare outputs using grader
- Measure: `delta` (improvement between baseline and treatment)

### 2. Agent Evals

Does agent Y produce correct output?

- Run agent with a defined scenario
- Grade output against acceptance criteria
- Measure: `pass@k` (reliability across k trials)

### 3. Workflow Evals

Does the full toolkit system improve agent outcomes?

- **Baseline**: Bare agent — no plugins, no MCP, no skills/hooks
- **Treatment**: Agent with full toolkit active (plugins, MCP, skills, hooks)
- Same prompt, only the **environment** varies
- Measure: `delta`, `pass^k` for critical paths

Unlike skill evals (which vary the prompt), workflow evals vary the environment while keeping the identical prompt for both conditions.

## Scope Alignment (MANDATORY)

Before designing any scenario, confirm scope:

1. **What is the eval target?** (skill, agent, hook, pipeline)
2. **What question are you answering?** (match to table below)
3. **What Claude behavior would change?** If the answer is only side-effect artifacts (files, logs, counters) — the eval harness is the wrong tool. Use unit tests.

| Question | Scope | What Varies | Primary Signal |
|----------|-------|-------------|----------------|
| Does this instruction change agent behavior? | **skill** | Skill present vs absent | `delta` |
| Can this agent complete the task correctly? | **agent** | Trial-to-trial execution | `pass@k`, `pass^k` |
| Does the toolkit improve outcomes? | **workflow** | Bare agent vs full toolkit | `delta`, `pass^k` |
| Does this component work correctly? | **none** | N/A | Use unit/integration tests |

Do NOT proceed to scenario design until you can answer question 2 in one sentence.

## The Process

```
1. Preflight    → validate scenario is still discriminative
2. Define eval  → scenario + assertions + grader type
3. Prepare env  → setup the trial environment (files, tools, context)
4. Run eval     → spawn agent with scenario, capture transcript
5. Grade eval   → code grader, model grader, or human grader
6. Track results→ pass@k metric over time (JSONL)
7. Report       → SHIP / NEEDS WORK / BLOCKED / INSUFFICIENT_DATA
```

**REQUIRED BACKGROUND:** references/preflight.md — ceiling threshold (0.8), PASS/BLOCK semantics, scenario hash mechanics.

**REQUIRED BACKGROUND:** references/verdict-policy.md — full verdict enum (SHIP, NEEDS WORK, BLOCKED, IMPROVED, REGRESSED, NO_CHANGE, INSUFFICIENT_DATA), why k<5 triggers INSUFFICIENT_DATA, asymmetric delta thresholds.

### Scenario Design Rules

Before writing assertions, complete this checklist:
1. Can I name the specific **Claude behavior** this scenario tests? (If "file exists" or "no errors" — you're testing infrastructure)
2. Would my assertions fail if I **disabled** the component under test? (If no — no discriminative power)
3. Can I describe why baseline will fail? (If no — scenario isn't discriminative)
4. Does each assertion use the right grader for its nature? (Code for facts, model for judgment)
5. Is output format small enough for consistent grading? (Prefer short structured artifacts)

**Scenario validity rules:**
- Scenario files are **single-condition**. Do not put separate baseline and treatment sections into one scenario file. `arc eval ab` owns the A/B loop — it runs the same single-condition scenario twice.
- **One behavior per scenario** — isolate one behavior so lift is attributable to one instruction
- **Include a trap or bait** — without a discriminative trap you're measuring generic competence, not skill adherence
- **Make ground truth defensible** — assertions must be supportable from provided context, not hidden conventions
- **Prefer 3-5 narrow scenarios** over one overloaded scenario

See references/grading-and-execution.md for environment setup, trial execution, isolation mechanics, and result tracking. See references/cli-and-metrics.md for CLI commands, metrics, and the scenario template.

### Grader Selection

Three graders: **code** (deterministic checks), **model** (intent/quality/reasoning), **human** (audience-dependent taste or domain expertise). Match grader to assertion nature — not convenience.

**Grader selection principle:** Structured output (JSON, typed fields) does not make semantic quality deterministic. An agent can return valid JSON while producing poor analysis. Code-grade structure; model-grade quality.

### Step 6: Report

| Verdict | Meaning |
|---------|---------|
| **SHIP** | Code-graded: pass rate = 100%. Model-graded: CI95 lower bound ≥ 0.8 |
| **NEEDS WORK** | 60% ≤ pass rate < SHIP threshold |
| **BLOCKED** | pass rate < 60% |
| **INSUFFICIENT_DATA** | k < 5 — CI95 cannot be computed. Run more trials. |

Full verdict semantics in references/verdict-policy.md.

## Rationalization Table

When pressure builds to skip or shortcut eval, these rationalizations surface. Each is a blocker in disguise.

| Excuse | Reality |
|--------|---------|
| "This change is too small to eval" | Size does not predict behavioral impact. A one-line prompt change can flip a verdict. Run eval — it takes minutes. |
| "Time pressure, ship now and eval later" | Eval done after shipping is a postmortem, not a gate. Ship with evidence or do not ship. |
| "Preflight blocks — I'll skip it just this once" | Preflight blocked because the scenario is no longer discriminative. Bypassing it means you cannot measure anything. Redesign the scenario. |
| "k=4 is close enough to 5" | The CI95 requires k ≥ 5 to be statistically meaningful. k=4 produces INSUFFICIENT_DATA. Run one more trial. |
| "INSUFFICIENT_DATA is advisory — I'll ship anyway" | INSUFFICIENT_DATA means you have no valid statistical basis for a verdict. Shipping on INSUFFICIENT_DATA is shipping blind. |
| "The grader raised weak_assertions but the pass rate is fine" | weak_assertions signal the assertions are not testing the right thing. A passing score on a poorly designed assertion proves nothing. Redesign the assertion. |

**REQUIRED BACKGROUND:** references/audit-workflow.md — how promotion and retirement arbitration works for discovered_claims and weak_assertions.

## Red Flags

Every listed thought means stop, re-read the skill, do not proceed.

- "I already manually tested, eval is redundant" — Manual testing measures your confidence, not the agent's behavioral reliability. Eval measures whether the skill systematically changes agent behavior across trials.
- "This is docs-only, no eval needed" — Docs changes that alter skill instructions change agent behavior by definition. If you changed what the agent reads, you changed what the agent does.
- "The INSUFFICIENT_DATA banner is just a warning" — INSUFFICIENT_DATA is a hard gate, not a warning. It means you have no statistical verdict. Shipping under INSUFFICIENT_DATA is shipping without evidence.
- "I can promote the discovered claim on my own without audit" — Promotion requires human arbitration to ensure the claim is generalizable and non-redundant. Bypassing audit corrupts the canonical skill body.
- "The blind comparator disagreed but assertions passed so it's fine" — The blind comparator is an independent signal. Disagreement between the comparator and assertion scores indicates one of them is poorly calibrated. Investigate before shipping.
- "Preflight is new, I'll skip it this time and backfill later" — Preflight is a gate, not a recommendation. Running trials on a scenario that fails preflight produces results you cannot trust. There is no backfill — run preflight first.

## Common Mistakes

Top mistakes that waste the most eval runs. Full catalog in references/common-mistakes-catalog.md.

| Mistake | What Happens | Fix |
|---------|-------------|-----|
| Scenario before question | Mixing adherence, correctness, and toolkit effects in one noisy test | State the question first: behavior change, task outcome, or toolkit effect |
| Baseline already near ceiling | Both conditions pass, delta stays tiny | Run 2-3 pilot trials first; if baseline exceeds ~0.8, redesign |
| Skill formalizes behavior agent already exhibits | A/B delta is zero — behavior is generic competence, not skill-specific | Ask "would baseline behave differently without this skill?" If no, use workflow or agent eval |
| Prompt leaks the repair pattern | Baseline follows the template and scores high without the skill | Remove explicit grader split or named repair structure from the prompt |
| Code-grading skill adherence via competence proxy | Both conditions pass, delta is zero | Mentally run the code grader against a bare agent — if it still passes, the artifact isn't discriminative |
| Using `--skill-file` for workflow eval | Varies the prompt instead of the environment | Workflow A/B varies the environment — use `eval ab <name>` without `--skill-file` |
| Workflow eval with no plugins installed | Baseline and treatment are identical, delta is always 0 | Ensure toolkit plugin is installed: `claude plugin list` should show active plugins |

## Integration

**Before:**
- **arc-brainstorming** → design the skill/agent being evaluated
- **arc-planning** → define what success looks like

**After:**
- arc-evaluating results inform whether to SHIP or iterate
- Track benchmarks over time in `evals/benchmarks/latest.json`

**Numeric vs qualitative analysis:** Numeric comparison (delta, CI, verdict) is programmatic — the harness computes it. The `eval-analyzer` agent adds qualitative analysis for model/human-graded A/B results; it does not replace the programmatic verdict.

**Reference files:**
- references/preflight.md — ceiling threshold, PASS/BLOCK semantics, scenario hash mechanics
- references/verdict-policy.md — full verdict enum, INSUFFICIENT_DATA, delta thresholds
- references/audit-workflow.md — promotion and retirement arbitration
- references/grading-and-execution.md — environment setup, graders, discovered_claims/weak_assertions schemas
- references/cli-and-metrics.md — CLI commands, metrics, storage, scenario template
- references/common-mistakes-catalog.md — full 23-entry mistake catalog
