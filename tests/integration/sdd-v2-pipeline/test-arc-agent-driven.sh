#!/usr/bin/env bash
# SDD v2 pipeline e2e test — arc-agent-driven
#
# Scaffolds the demo-spec fixture, expands the epic-formatter worktree,
# pre-creates a task list for fr-formatter-001, then spawns `claude -p`
# inside the worktree asking the agent to execute the task list via
# arc-agent-driven. Verifies that the expected source file is produced
# and that the Agent tool was used (subagent dispatch pattern).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./test-helpers.sh
source "$SCRIPT_DIR/test-helpers.sh"

TIMESTAMP=$(date +%s)
TRIAL_BASE="/tmp/arcforge-tests/$TIMESTAMP/sdd-v2-pipeline/arc-agent-driven"
PROJECT_DIR="$TRIAL_BASE/project"
LOG_FILE="$TRIAL_BASE/claude-output.json"
mkdir -p "$TRIAL_BASE"

echo "=== SDD v2 Pipeline — arc-agent-driven ==="
echo "Trial dir:  $TRIAL_BASE"
echo "Plugin dir: $ARCFORGE_ROOT"
echo ""

echo ">>> Scaffolding fixture into trial dir..."
"$SCRIPT_DIR/fixture/scaffold.sh" "$PROJECT_DIR"

echo ""
echo ">>> Expanding epic-formatter worktree via arcforge CLI..."
cd "$PROJECT_DIR"
EXPAND_OUTPUT=$(node "$ARCFORGE_ROOT/scripts/cli.js" expand --spec-id demo-spec --epic epic-formatter --json)
echo "$EXPAND_OUTPUT"

WORKTREE_PATH=$(echo "$EXPAND_OUTPUT" | jq -r '.epics[] | select(.id == "epic-formatter") | .path')

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "null" ]; then
    echo "FATAL: could not resolve epic-formatter worktree path from expand output."
    exit 1
fi
echo "Worktree: $WORKTREE_PATH"

echo ""
echo ">>> Pre-creating task list for fr-formatter-001..."
mkdir -p "$WORKTREE_PATH/docs/tasks"
cat > "$WORKTREE_PATH/docs/tasks/fr-formatter-001-tasks.md" <<'TASKS'
# Tasks: fr-formatter-001 — formatNumber Primitive

Implement the formatNumber function as specified in
specs/demo-spec/epics/epic-formatter/features/fr-formatter-001.md.

## Task 1: Create src/formatters/number.js

Create `src/formatters/number.js` that exports a single function
`formatNumber(n)` which returns the string `"#" + n` using a template
literal. Null-safety is handled naturally by template literals
(`String(null) === "null"`).

Acceptance criteria:
- `formatNumber(42)` returns `"#42"`
- `formatNumber(null)` returns `"#null"`
- `formatNumber(3.14)` returns `"#3.14"`

## Task 2: Create test/formatters/number.test.js

Create a Jest unit test at `test/formatters/number.test.js` covering:
- Happy path: numeric input produces `"#N"` string
- Null input: returns `"#null"`
- Decimal input: returns `"#3.14"`
TASKS

git -C "$WORKTREE_PATH" add docs/tasks/fr-formatter-001-tasks.md
git -C "$WORKTREE_PATH" commit --quiet -m "test fixture: add fr-formatter-001 task list"

echo ""
echo ">>> Spawning claude -p inside worktree to run arc-agent-driven..."
cd "$WORKTREE_PATH"

PROMPT="You are inside an arcforge worktree for the epic-formatter epic. A task list has been pre-created at docs/tasks/fr-formatter-001-tasks.md. Use arc-agent-driven to execute this task list: dispatch a fresh subagent per task, then run spec-reviewer and quality-reviewer after each task completes. Do not re-generate the task list — it already exists."

# 15-minute ceiling for arc-agent-driven with a single 2-task list.
TIMEOUT_SECONDS="${SDD_V2_AGENT_DRIVEN_TIMEOUT:-900}"
timeout --kill-after=30 "$TIMEOUT_SECONDS" \
    claude -p "$PROMPT" \
        --plugin-dir "$ARCFORGE_ROOT" \
        --dangerously-skip-permissions \
        --output-format stream-json \
        --verbose \
    > "$LOG_FILE" 2>&1 \
    || {
        echo "(claude -p exited non-zero; first 20 lines of log:)"
        head -20 "$LOG_FILE" | sed 's/^/    /' || true
    }

echo ""
echo ">>> Assertions (against worktree: $WORKTREE_PATH)"
FAILED=0

assert_file_exists "$WORKTREE_PATH/src/formatters/number.js" \
    "formatNumber source file produced" || FAILED=$((FAILED+1))

assert_file_contains "$WORKTREE_PATH/src/formatters/number.js" \
    "formatNumber" "number.js exports formatNumber" || FAILED=$((FAILED+1))

assert_file_exists "$WORKTREE_PATH/test/formatters/number.test.js" \
    "formatNumber unit test produced" || FAILED=$((FAILED+1))

# Behavioral assertion: arc-agent-driven must dispatch subagents via the
# Agent tool. Check for Agent tool_use calls in the stream-json log.
if [ -f "$LOG_FILE" ]; then
    AGENT_CALLS=$(jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent") | .name' \
        "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$AGENT_CALLS" -ge 1 ]; then
        echo "  [PASS] Agent tool dispatched ($AGENT_CALLS calls — subagent-per-task pattern)"
    else
        echo "  [FAIL] Agent tool not dispatched — arc-agent-driven subagent pattern not observed"
        echo "  All tool calls in log:"
        extract_tool_calls "$LOG_FILE" | head -20 | sed 's/^/    /' || true
        FAILED=$((FAILED+1))
    fi
fi

echo ""
echo "=== arc-agent-driven test: $FAILED failure(s) ==="
echo "Log: $LOG_FILE"
echo "Worktree: $WORKTREE_PATH"
exit $FAILED
