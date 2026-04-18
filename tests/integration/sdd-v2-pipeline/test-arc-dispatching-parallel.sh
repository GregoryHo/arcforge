#!/usr/bin/env bash
# SDD v2 pipeline e2e test — arc-dispatching-parallel
#
# Scaffolds the demo-spec fixture, expands the epic-parser worktree, then
# pre-creates task lists for BOTH fr-parser-001 and fr-parser-002 (which
# are independent — see fr-parser-001.md Technical Notes). Spawns `claude -p`
# inside the worktree asking the agent to dispatch both task lists in
# parallel via arc-dispatching-parallel. Verifies that both source files
# are produced and that the Agent tool was used at least twice (one
# subagent per parallel branch).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./test-helpers.sh
source "$SCRIPT_DIR/test-helpers.sh"

TIMESTAMP=$(date +%s)
TRIAL_BASE="/tmp/arcforge-tests/$TIMESTAMP/sdd-v2-pipeline/arc-dispatching-parallel"
PROJECT_DIR="$TRIAL_BASE/project"
LOG_FILE="$TRIAL_BASE/claude-output.json"
mkdir -p "$TRIAL_BASE"

echo "=== SDD v2 Pipeline — arc-dispatching-parallel ==="
echo "Trial dir:  $TRIAL_BASE"
echo "Plugin dir: $ARCFORGE_ROOT"
echo ""

echo ">>> Scaffolding fixture into trial dir..."
"$SCRIPT_DIR/fixture/scaffold.sh" "$PROJECT_DIR"

echo ""
echo ">>> Expanding epic-parser worktree via arcforge CLI..."
cd "$PROJECT_DIR"
EXPAND_OUTPUT=$(node "$ARCFORGE_ROOT/scripts/cli.js" expand --spec-id demo-spec --epic epic-parser --json)
echo "$EXPAND_OUTPUT"

WORKTREE_PATH=$(echo "$EXPAND_OUTPUT" | jq -r '.epics[] | select(.id == "epic-parser") | .path')

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "null" ]; then
    echo "FATAL: could not resolve epic-parser worktree path from expand output."
    exit 1
fi
echo "Worktree: $WORKTREE_PATH"

echo ""
echo ">>> Pre-creating independent task lists for fr-parser-001 and fr-parser-002..."
mkdir -p "$WORKTREE_PATH/docs/tasks"

cat > "$WORKTREE_PATH/docs/tasks/fr-parser-001-tasks.md" <<'TASKS'
# Tasks: fr-parser-001 — parseInteger Primitive

Implement the parseInteger function as specified in
specs/demo-spec/epics/epic-parser/features/fr-parser-001.md.

## Task 1: Create src/parsers/int.js

Create `src/parsers/int.js` exporting `parseInteger(input)`:
- Returns the integer value of input string using Number.parseInt(input, 10)
- Returns null (not throw) if the result is NaN or input is empty string
- Must be independent of src/parsers/float.js — no cross-imports

## Task 2: Create test/parsers/int.test.js

Create Jest unit tests covering: happy path (numeric string), NaN input,
empty string input.
TASKS

cat > "$WORKTREE_PATH/docs/tasks/fr-parser-002-tasks.md" <<'TASKS'
# Tasks: fr-parser-002 — parseFloat Primitive

Implement the parseFloat function as specified in
specs/demo-spec/epics/epic-parser/features/fr-parser-002.md.

## Task 1: Create src/parsers/float.js

Create `src/parsers/float.js` exporting `parseFloat(input)`:
- Returns the float value of input string using Number.parseFloat(input)
- Returns null (not throw) if the result is NaN or input is empty string
- Must be independent of src/parsers/int.js — no cross-imports

## Task 2: Create test/parsers/float.test.js

Create Jest unit tests covering: happy path (decimal string), NaN input,
empty string input.
TASKS

git -C "$WORKTREE_PATH" add docs/tasks/
git -C "$WORKTREE_PATH" commit --quiet -m "test fixture: add fr-parser-001 and fr-parser-002 task lists"

echo ""
echo ">>> Spawning claude -p inside worktree to run arc-dispatching-parallel..."
cd "$WORKTREE_PATH"

PROMPT="You are inside an arcforge worktree for the epic-parser epic. Task lists have been pre-created at docs/tasks/fr-parser-001-tasks.md and docs/tasks/fr-parser-002-tasks.md. These two features are completely independent (no shared files, no shared dependencies). Use arc-dispatching-parallel to dispatch both task lists in parallel: each task list gets its own subagent, and both agents run concurrently. Do not run them sequentially."

# 20-minute ceiling for two parallel subagents.
TIMEOUT_SECONDS="${SDD_V2_PARALLEL_TIMEOUT:-1200}"
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

assert_file_exists "$WORKTREE_PATH/src/parsers/int.js" \
    "parseInteger source file produced" || FAILED=$((FAILED+1))

assert_file_exists "$WORKTREE_PATH/src/parsers/float.js" \
    "parseFloat source file produced" || FAILED=$((FAILED+1))

assert_file_contains "$WORKTREE_PATH/src/parsers/int.js" \
    "parseInteger" "int.js exports parseInteger" || FAILED=$((FAILED+1))

assert_file_contains "$WORKTREE_PATH/src/parsers/float.js" \
    "parseFloat" "float.js exports parseFloat" || FAILED=$((FAILED+1))

# Behavioral assertion: arc-dispatching-parallel must dispatch at least 2
# subagents via the Agent tool concurrently. A single-Agent dispatch would
# indicate sequential execution, not parallel.
if [ -f "$LOG_FILE" ]; then
    AGENT_CALLS=$(jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent") | .name' \
        "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$AGENT_CALLS" -ge 2 ]; then
        echo "  [PASS] Agent tool dispatched $AGENT_CALLS times (parallel pattern observed)"
    else
        echo "  [FAIL] Agent tool dispatched $AGENT_CALLS time(s) — expected >= 2 for parallel dispatch"
        echo "  All tool calls in log:"
        extract_tool_calls "$LOG_FILE" | head -20 | sed 's/^/    /' || true
        FAILED=$((FAILED+1))
    fi
fi

echo ""
echo "=== arc-dispatching-parallel test: $FAILED failure(s) ==="
echo "Log: $LOG_FILE"
echo "Worktree: $WORKTREE_PATH"
exit $FAILED
