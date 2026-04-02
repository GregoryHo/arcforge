# Agent Eval Extension Design

## Vision

Extend arc-evaluating from a prompt-response eval harness into an agent behavior eval harness. The key shift: from "what did the agent say?" to "what did the agent do?"

Currently arc-evaluating tests whether a skill changes text output (skill A/B). After this extension, it can also verify that agents execute correct tool calls in correct order within a full toolkit environment.

## Architecture Decision

**Approach: Transcript-Based Assertions** — extend the existing harness rather than replace it.

The eval harness already captures rich transcripts with `[Tool: Name] args` entries via `parseStreamJsonOutput()`. We add a parser to structure these into an action log, then grade behavioral assertions deterministically against that log.

Key decisions:
- **Additive, not breaking** — existing scenarios, results, and grading unchanged
- **Code grading for behavior** — behavioral assertions are deterministic (no model calls)
- **Mixed grading** — scenarios can combine behavioral (code) and text (model) assertions
- **Semi-isolated environment** — disable global plugins but load local plugin via `--plugin-dir`

## Background

### Problem

Scenario 2 & 3 of the discipline routing eval showed baseline at ceiling — Claude already knows "verify before finishing" from general knowledge. The eval couldn't distinguish because:

1. Trials are isolated prompt-response (no toolkit, no tool calls)
2. Assertions check text output, not actual behavior
3. No multi-turn execution (agent can't actually invoke skills)

### Evidence

| Scenario | Baseline | Treatment | Delta | Issue |
|----------|----------|-----------|-------|-------|
| discipline-routing-verify | 0.35 | 1.00 | +0.65 | Worked (text assertion was discriminative) |
| review-feedback-handoff | 1.00 | 1.00 | 0.00 | Ceiling (Claude infers correct answer) |
| completion-pipeline-ordering | 1.00 | 1.00 | 0.00 | Ceiling (Claude infers correct answer) |

### Reference

everything-claude-code project patterns informed this design:
- Session-level behavior eval (Stop hook transcript analysis)
- Observation JSONL pipeline (structured action logging)
- Scenario strictness levels (supportive / neutral / competing)
- GAN evaluator pattern (separate agent for evaluation)

---

## Components

### 1. Transcript Action Parser

**File:** `scripts/lib/eval.js`

Parses rich transcript into structured action log.

**Input:** Rich transcript string (already produced by `parseStreamJsonOutput()`)
```
[Assistant] I'll verify the work first.
[Tool: Skill] arc-verifying
[Tool: Bash] npm test
[Tool: Write] src/discount.js
```

**Output:** Structured action array
```javascript
[
  { type: 'text', content: "I'll verify the work first.", index: 0 },
  { type: 'tool', name: 'Skill', args: 'arc-verifying', index: 1 },
  { type: 'tool', name: 'Bash', args: 'npm test', index: 2 },
  { type: 'tool', name: 'Write', args: 'src/discount.js', index: 3 },
]
```

**Storage:** `actions` field added to TrialResult (additive — existing results remain valid).

### 2. Behavioral Assertions

**File:** `scripts/lib/eval-graders.js`

New assertion types identified by `[prefix]` in scenario assertions:

| Operator | Syntax | Example | Logic |
|----------|--------|---------|-------|
| `tool_called` | `Name:pattern` | `[tool_called] Skill:arc-verifying` | Any action matches name + args substring |
| `tool_not_called` | `Name:pattern` | `[tool_not_called] Bash:git push` | No action matches |
| `tool_before` | `A < B` | `[tool_before] Skill:arc-verifying < Skill:arc-finishing-epic` | A's index < B's index |
| `tool_count` | `Name:pattern >= N` | `[tool_count] Bash:npm test >= 2` | Match count >= N |
| `tool_adjacent` | `A ~ B` | `[tool_adjacent] Skill:arc-verifying ~ Skill:arc-finishing-epic` | No tool calls between A and B |

All behavioral assertions are graded by **code grader** (deterministic, no model calls).

### 3. Mixed Grading

**File:** `scripts/lib/eval-graders.js`

When `## Grader` is `mixed`:
1. Parser splits assertions into behavioral (`[tool_*]` prefix) and text (no prefix)
2. Behavioral assertions → code grader against action log
3. Text assertions → model grader (existing)
4. Combined score = weighted average by assertion count

```
score = (behavioral_pass_count + model_score_sum) / total_assertion_count
```

### 4. Environment Control

**File:** `scripts/lib/eval.js` + `scripts/cli.js`

Three modes of trial isolation:

| Mode | Plugins | CLAUDE.md/Rules | MCP | Use Case |
|------|---------|-----------------|-----|----------|
| `isolated` (default) | All disabled | Excluded | `--strict-mcp-config` | Baseline, skill A/B |
| `semi-isolated` (plugin-dir) | All disabled, `--plugin-dir` loads local | Preserved | Not restricted | Agent eval with toolkit |
| `non-isolated` (no-isolate) | User settings | User settings | User settings | Rare, manual testing |

**Semi-isolated** (`--plugin-dir` provided):
- `buildPluginDirSettings()` — disables all installed plugins + auto-memory
- Does NOT exclude CLAUDE.md/rules (plugin may need them)
- Does NOT use `--strict-mcp-config` (plugin may register MCP servers)
- Passes `--plugin-dir <path>` to claude CLI

**New runTrial() parameters:**
- `options.pluginDir` → `--plugin-dir <path>`
- `options.maxTurns` → `--max-turns <N>`
- Both passed through to claude CLI args

### 5. Scenario Template Extension

**File:** `scripts/lib/eval.js` (loadScenario)

New optional fields in scenario markdown:

```markdown
## Plugin Dir
${PROJECT_ROOT}

## Max Turns
10
```

- `Plugin Dir` — expanded at parse time (`${PROJECT_ROOT}` → actual path)
- `Max Turns` — integer, defaults to 1 (single response, backward compatible)
- Both stored in EvalScenario object

### 6. Dashboard Updates

**Files:** `scripts/eval-dashboard.js` + `scripts/eval-dashboard-ui.html`

| Area | Change |
|------|--------|
| Assertion breakdown | Render behavioral assertions with type icons and match status |
| Transcript modal | Add "Action Log" tab with tool call timeline |
| Scenario detail | Show Plugin Dir and Max Turns fields |
| Trial results table | Add turnsUsed column |
| Mixed grading | Show code and model scores separately with combined result |

---

## Data Flow

### Trial Execution (with new features)

```
Scenario (with Plugin Dir + Max Turns)
  ↓
runTrial()
  ├── createTrialDir()
  ├── runSetup() if setup exists
  ├── writePluginDirSettings() if pluginDir (semi-isolated)
  │   OR writeIsolationSettings() if isolated
  ├── buildTrialPrompt()
  ├── spawn claude -p --plugin-dir X --max-turns N
  ├── parseStreamJsonOutput() → richTranscript (existing)
  ├── parseActionsFromTranscript() → actions[] (NEW)
  └── return TrialResult { ..., actions }

  ↓
gradeTrialResult()
  ├── splitAssertions() → { behavioral[], text[] } (NEW)
  ├── gradeBehavioral(actions, behavioral) → code scores (NEW)
  ├── gradeText(output, text) → model scores (existing)
  └── combineMixedScores() → final score (NEW)

  ↓
appendResult() → JSONL
  ↓
Dashboard renders actions + mixed scores
```

---

## Error Handling

| Failure | Handling |
|---------|----------|
| `--plugin-dir` path doesn't exist | Fail trial with `infraError: true`, error message |
| Plugin hooks fail during trial | Captured in transcript, trial continues |
| `--max-turns` exceeded | Claude exits normally, transcript captured as-is |
| No `[Tool:]` entries in transcript | Behavioral assertions all fail (score 0), not infra error |
| Mixed grading with 0 behavioral assertions | Falls back to pure model grading |
| Mixed grading with 0 text assertions | Falls back to pure code grading |
| Existing scenario without new fields | Backward compatible — Plugin Dir=none, Max Turns=1, no behavioral assertions |

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: `parseActionsFromTranscript(richTranscript)` parses `[Tool: Name] args` and `[Assistant] text` patterns into structured action array `[{ type, name, args, index }]`
- REQ-F002: `buildPluginDirSettings()` disables all installed plugins and auto-memory, but preserves CLAUDE.md/rules access
- REQ-F003: `runTrial()` accepts `pluginDir` and `maxTurns` options, passes them as `--plugin-dir` and `--max-turns` to claude CLI
- REQ-F004: `runTrial()` when `pluginDir` is set, writes semi-isolated settings via `buildPluginDirSettings()` and does not use `--strict-mcp-config`
- REQ-F005: Trial results include `actions` field parsed from transcript
- REQ-F006: Behavioral assertions with `[tool_called]`, `[tool_not_called]`, `[tool_before]`, `[tool_count]`, `[tool_adjacent]` prefixes are parsed from scenario assertions
- REQ-F007: Behavioral assertions are graded deterministically via code grader against the action log
- REQ-F008: `mixed` grader type splits assertions into behavioral (code) and text (model), scores as weighted average by assertion count
- REQ-F009: CLI supports `--no-isolate`, `--plugin-dir <path>`, `--max-turns <N>` for `eval run` and `eval ab`
- REQ-F010: Scenario parser reads optional `Plugin Dir` and `Max Turns` fields, expands `${PROJECT_ROOT}`
- REQ-F011: Dashboard assertion breakdown renders behavioral assertions with type-specific icons and match status
- REQ-F012: Dashboard transcript modal includes action log timeline view
- REQ-F013: Dashboard scenario detail shows Plugin Dir and Max Turns fields
- REQ-F014: Dashboard trial results show turns used vs max turns
- REQ-F015: Dashboard supports mixed grading display — code and model scores shown separately with combined result

### Non-Functional Requirements

- REQ-N001: Zero external dependencies (Node.js standard library only)
- REQ-N002: Backward compatible — existing scenarios and results must work unchanged
- REQ-N003: Behavioral assertion grading must be deterministic (no model calls)

### Constraints

- No changes to arc-evaluating/SKILL.md in this scope (requires arc-writing-skills TDD process)
- Existing eval results JSONL format must remain valid (additive fields only)
- `parseActionsFromTranscript` depends on existing `parseStreamJsonOutput` format
- `--plugin-dir` requires Claude Code CLI support (verified: `claude --help` shows flag)

<!-- REFINER_INPUT_END -->
