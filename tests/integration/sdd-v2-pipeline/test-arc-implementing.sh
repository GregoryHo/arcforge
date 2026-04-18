#!/usr/bin/env bash
# SDD v2 pipeline e2e test — arc-implementing
#
# Scaffolds the demo-spec fixture, expands the epic-parser worktree, then
# spawns `claude -p` inside the worktree asking the agent to implement
# the epic via arc-implementing. Verifies that the expected downstream
# artifacts (tasks files + source code) appear.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./test-helpers.sh
source "$SCRIPT_DIR/test-helpers.sh"

TIMESTAMP=$(date +%s)
TRIAL_BASE="/tmp/arcforge-tests/$TIMESTAMP/sdd-v2-pipeline/arc-implementing"
PROJECT_DIR="$TRIAL_BASE/project"
LOG_FILE="$TRIAL_BASE/claude-output.json"
mkdir -p "$TRIAL_BASE"

echo "=== SDD v2 Pipeline — arc-implementing ==="
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

# expand --json emits .epics[].path with the absolute worktree path. The
# status command's .worktree field is the epic name, not the path — so we
# must capture the path here at expand time.
WORKTREE_PATH=$(echo "$EXPAND_OUTPUT" | jq -r '.epics[] | select(.id == "epic-parser") | .path')

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "null" ]; then
    echo "FATAL: could not resolve epic-parser worktree path from expand output."
    exit 1
fi
echo "Worktree: $WORKTREE_PATH"

echo ""
echo ">>> Spawning claude -p inside worktree to run arc-implementing..."
cd "$WORKTREE_PATH"

PROMPT="You are inside an arcforge worktree. The .arcforge-epic marker in the current directory tells you which epic to implement. Run the arc-implementing skill to deliver the epic end-to-end: write task lists for each feature, then use arc-agent-driven to implement them. Stop when all features in this epic have passing tests."

# 25-minute ceiling. arc-implementing with multiple features is slow.
TIMEOUT_SECONDS="${SDD_V2_IMPLEMENTING_TIMEOUT:-1500}"
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

assert_file_exists "$WORKTREE_PATH/docs/tasks/fr-parser-001-tasks.md" \
    "tasks file for fr-parser-001 exists" || FAILED=$((FAILED+1))

assert_file_exists "$WORKTREE_PATH/docs/tasks/fr-parser-002-tasks.md" \
    "tasks file for fr-parser-002 exists" || FAILED=$((FAILED+1))

assert_file_contains "$WORKTREE_PATH/docs/tasks/fr-parser-001-tasks.md" \
    "[Tt]ask" "tasks file mentions Task/task" || FAILED=$((FAILED+1))

assert_file_exists "$WORKTREE_PATH/src/parsers/int.js" \
    "parser int.js produced" || FAILED=$((FAILED+1))

assert_file_exists "$WORKTREE_PATH/src/parsers/float.js" \
    "parser float.js produced" || FAILED=$((FAILED+1))

assert_file_contains "$WORKTREE_PATH/src/parsers/int.js" \
    "parseInteger" "int.js exports parseInteger" || FAILED=$((FAILED+1))

assert_file_contains "$WORKTREE_PATH/src/parsers/float.js" \
    "parseFloat" "float.js exports parseFloat" || FAILED=$((FAILED+1))

# Behavioral assertion: arc-implementing must delegate to arc-writing-tasks +
# arc-agent-driven. Check the stream-json log for Skill invocations.
if [ -f "$LOG_FILE" ]; then
    TOOL_CALLS=$(extract_tool_calls "$LOG_FILE" || echo "")
    if echo "$TOOL_CALLS" | grep -q "arc-writing-tasks\|writing-tasks"; then
        echo "  [PASS] delegated to arc-writing-tasks"
    else
        echo "  [FAIL] did not delegate to arc-writing-tasks"
        echo "  Observed tool calls:"
        echo "$TOOL_CALLS" | head -20 | sed 's/^/    /'
        FAILED=$((FAILED+1))
    fi

    if echo "$TOOL_CALLS" | grep -q "arc-agent-driven\|agent-driven"; then
        echo "  [PASS] delegated to arc-agent-driven"
    else
        echo "  [FAIL] did not delegate to arc-agent-driven"
        FAILED=$((FAILED+1))
    fi
fi

echo ""
echo "=== arc-implementing test: $FAILED failure(s) ==="
echo "Log: $LOG_FILE"
echo "Worktree: $WORKTREE_PATH"
exit $FAILED
