# Grading and Execution Reference

## Step 2: Prepare Environment

**Critical for AI agent evaluation.** Each trial runs in an isolated directory. The agent has tools (Read, Bash, Glob, Grep, etc.) and will use them. Design the environment accordingly:

| Scenario Type | Environment Needs | Setup Example |
|--------------|-------------------|---------------|
| Agent reads project code | Copy relevant files | `cp $PROJECT_ROOT/scripts/lib/eval.js .` |
| Agent writes new code | Empty dir is fine | (no setup needed) |
| Agent reviews existing code | Provide the code to review | `cp $PROJECT_ROOT/src/auth.js .` |
| Agent answers from context only | Empty dir, rich Context | (no setup needed, but Context must be sufficient) |

**If the agent times out** searching an empty directory, your scenario is missing a Setup or the Context is insufficient. This is a scenario design problem, not a system problem.

## Step 3: Run Eval

Trials run in isolated directories with plugins disabled, skills suppressed, and MCP servers stripped via `--strict-mcp-config`. The agent has built-in tools but no project-specific context (CLAUDE.md, rules, hooks) unless provided via Setup.

For skill evals (A/B):
```
1. Run scenario WITHOUT skill → capture transcript A
2. Run scenario WITH skill → capture transcript B
```

For agent evals:
```
1. Spawn agent with scenario → capture transcript
```

For workflow evals (A/B):
```
1. Run scenario in ISOLATED environment (no plugins/MCP) → capture baseline
2. Run same scenario with FULL TOOLKIT (plugins, MCP active) → capture treatment
```

Both conditions run in `.eval-trials/` for workspace safety. The treatment trial has access to all installed plugins, MCP servers, and project skills/hooks — the baseline is a bare agent with no toolkit.

### Workflow Eval Isolation Details

The baseline isolation is aggressive — `buildIsolationSettings()` queries installed plugins and generates settings that:
- Disable ALL plugins (`enabledPlugins: { id: false }` for each)
- Exclude CLAUDE.md files and rules (`claudeMdExcludes: ['**/CLAUDE.md', '**/rules/**']`)
- Disable auto-memory (`autoMemoryEnabled: false`)
- Strip MCP servers via `--strict-mcp-config`

The treatment trial runs with all of the above active — plugins, MCP, CLAUDE.md, rules, hooks. Same prompt, same scenario, only the environment differs.

**Good workflow scenarios**: Realistic dev tasks where toolkit value is non-obvious (e.g., "implement feature X following project conventions" — toolkit provides the conventions via CLAUDE.md/rules).

**Bad workflow scenarios**: Tasks that name a specific tool or skill — biases toward the toolkit. Tasks so simple that any agent succeeds without help.

## Step 4: Grade Eval

Three grader types — choose based on the assertion's nature, not convenience.

**Key principle:** Structured output (JSON, typed fields) does not make semantic quality deterministic. Structure is code-verifiable; quality is not. Match grader to assertion nature.

| Grader | Use When | Not For | How |
|--------|----------|---------|-----|
| **code** | Assertions have deterministic correct answers (file exists, test passes, value matches expected) | Quality or intent judgment — don't rewrite assertions into grep proxies to force code grading | Run test command, check exit code. `$TRIAL_DIR` env var available. For per-assertion results, echo `A1:PASS` or `A1:FAIL:reason` for each assertion — the harness parses these into `assertionScores` matching model grader output. Without labels, falls back to binary pass/fail. |
| **model** | Assertions require understanding intent, quality, or reasoning (e.g., "identifies root cause", "explanation is clear", "follows systematic methodology") | Checks that can be verified by running commands — adds noise without value | Reads `skills/arc-evaluating/agents/eval-grader.md` as grading methodology, scores each assertion on a normalized 0.0-1.0 scale, and uses trial artifacts as evidence when available. Harness logic computes overall score and pass/fail from the returned per-assertion scores. |
| **human** | Assertions involve audience-dependent experience, taste, or domain expertise that even LLMs assess unreliably (e.g., "feels intuitive", "tone matches brand") | Assessments an LLM can judge — save human bandwidth for what only humans can evaluate | Present output + checklist for review |

Some behavioral qualities cannot be captured by deterministic tests alone. When evaluating methodology, reasoning quality, or communication clarity, model or human grading captures signal that code grading structurally cannot.

**When a goal has both deterministic and judgment aspects** (e.g., "agent writes good error handling"): split into complementary scenarios — one code-graded for verifiable aspects (tests pass, no empty catch blocks), one model-graded for judgment aspects (error messages are contextual, errors handled at appropriate layer).

Example: an eval where the agent returns a JSON code review. Split the assertions:
- Code grader: "output is valid JSON", "every finding has required fields" (structure — deterministic)
- Model grader: "SQL injection finding is correctly categorized and fix is sound" (quality — requires judgment)

## Step 5: Track Results

Results stored in `evals/results/` as JSONL (gitignored):

```json
{"eval": "skill-tdd-compliance", "trial": 1, "k": 5, "passed": true, "grader": "model", "score": 1.0, "timestamp": "2026-03-17T10:00:00Z"}
```

See **REQUIRED BACKGROUND:** references/cli-and-metrics.md for storage layout and metric formulas.

## Grader Output Schemas

The eval-grader agent populates two additional fields in the grading output beyond the standard `scores` and `overall`. These fields accumulate into the audit corpus and drive the promotion/retirement workflow (see **REQUIRED BACKGROUND:** references/audit-workflow.md).

### discovered_claims[]

Behaviors observed during grading that the grader identified as noteworthy — patterns the agent exhibited that may warrant canonicalization into the skill body. Each entry:

```json
{
  "text": "Agent explicitly checked whether baseline scenario had discriminative traps before proceeding",
  "category": "process",
  "passed": true,
  "evidence": "Line 42 of transcript: 'I need to verify the scenario has a trap...' — agent paused to validate scenario design"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Human-readable description of the observed behavior |
| `category` | enum | One of `factual`, `process`, `quality` |
| `passed` | boolean | Whether the observed behavior matched expectations |
| `evidence` | string | Verbatim quote or reference to transcript supporting the claim |

**Category definitions:**
- `factual` — The claim is about a verifiable fact (a file exists, a value was computed correctly, an output matches a known correct answer).
- `process` — The claim is about how the agent went about the task (methodology, sequencing, decision-making steps).
- `quality` — The claim is about the caliber of the output (clarity, completeness, correctness of reasoning, depth of analysis).

Promotion candidates for `arc eval audit` come from `discovered_claims` entries where `passed: true` appears consistently across multiple trials. An agent cannot self-promote a discovered claim — human arbitration is required (see references/audit-workflow.md).

### weak_assertions[]

Assertions flagged during grading as poorly specified, ambiguous, or non-discriminative. These are signals that the assertion itself needs redesign, independent of whether the agent passed or failed. Each entry:

```json
{
  "assertion_id": "A2",
  "reason": "Assertion checks that 'output is clear' without specifying what clarity means in this context — any output could be argued to satisfy this"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `assertion_id` | string | Label matching the assertion in the scenario (e.g., `A1`, `A2`, or the assertion text) |
| `reason` | string | Explanation of why the assertion is weak — what makes it ambiguous, non-discriminative, or unverifiable |

Common reasons for weak assertions:
- Circular: assertion restates the task description without specifying what a passing response looks like
- Ambiguous scope: assertion could be satisfied by vastly different outputs depending on interpretation
- Competence proxy: assertion tests generic agent competence rather than skill-specific behavior
- Format proxy: assertion checks structure (valid JSON, required fields) but not semantic quality

A high rate of `weak_assertions` across trials indicates the scenario needs redesign. Retirement candidates for `arc eval audit` surface when the same assertion consistently appears in `weak_assertions` across 3+ trials.
