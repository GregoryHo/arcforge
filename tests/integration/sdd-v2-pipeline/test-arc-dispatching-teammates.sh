#!/usr/bin/env bash
# SDD v2 pipeline e2e test — arc-dispatching-teammates
#
# Scaffolds the demo-spec fixture (no worktree expansion — this skill
# operates from project root). epic-parser and epic-formatter are both
# status:pending with no dependency between them, satisfying the
# "2+ ready epics, single spec" precondition. Spawns `claude -p` at
# project root asking the agent to dispatch both epics to teammates.
#
# Full teammate execution is intentionally capped (--max-turns 25) to
# keep test cost low. The behavioral assertions verify that the skill
# correctly identifies the ready epics and invokes TeamCreate + Agent
# with team_name — not that the teammates finish their work.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./test-helpers.sh
source "$SCRIPT_DIR/test-helpers.sh"

setup_trial_dir "arc-dispatching-teammates"

echo ">>> Scaffolding fixture into trial dir..."
"$SCRIPT_DIR/fixture/scaffold.sh" "$PROJECT_DIR"

echo ""
echo ">>> Verifying fixture has 2 independent ready epics..."
cd "$PROJECT_DIR"
STATUS_JSON=$(node "$ARCFORGE_ROOT/scripts/cli.js" status --spec-id demo-spec --json 2>/dev/null || echo '{}')
READY_COUNT=$(echo "$STATUS_JSON" | jq '[.epics[] | select(.status == "pending" and (.worktree == null or .worktree == ""))] | length' 2>/dev/null || echo 0)
echo "Ready epics (pending, no worktree): $READY_COUNT"
if [ "$READY_COUNT" -lt 2 ]; then
    echo "WARN: expected >= 2 ready epics, got $READY_COUNT — test may not exercise teammates dispatch"
fi

echo ""
echo ">>> Spawning claude -p at project root to run arc-dispatching-teammates..."

PROMPT="You are at the project root for a demo-spec project. The specs/demo-spec/dag.yaml has two independent ready epics: epic-parser and epic-formatter (both status:pending, no worktree assigned, no dependencies between them). Use arc-dispatching-teammates to dispatch both epics to agent teammates in parallel. Follow the skill's workflow: create a team with TeamCreate, expand each worktree, then dispatch an Agent teammate per epic. You do not need to wait for the teammates to finish — stop after dispatching both agents."

# 10-minute ceiling. We only need to see TeamCreate + Agent dispatch, not
# full teammate execution. Cap turns to avoid expensive runaway.
TIMEOUT_SECONDS="${SDD_V2_TEAMMATES_TIMEOUT:-600}"
run_claude_p "$PROMPT" "$TIMEOUT_SECONDS" "$LOG_FILE" --max-turns 25

echo ""
echo ">>> Assertions (against project: $PROJECT_DIR)"
FAILED=0

# Behavioral assertion 1: TeamCreate must be called before any Agent dispatch.
if [ -f "$LOG_FILE" ]; then
    if jq -e 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "TeamCreate")' \
            "$LOG_FILE" > /dev/null 2>&1; then
        echo "  [PASS] TeamCreate tool invoked"
    else
        echo "  [FAIL] TeamCreate tool not invoked — skill must create a team before dispatching"
        echo "  All tool calls in log:"
        extract_tool_calls "$LOG_FILE" | head -20 | sed 's/^/    /' || true
        FAILED=$((FAILED+1))
    fi
fi

# Behavioral assertion 2: Agent tool must be called with a team_name parameter.
if [ -f "$LOG_FILE" ]; then
    TEAM_AGENT_CALLS=$(jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent") | select(.input.team_name != null) | .name' \
        "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$TEAM_AGENT_CALLS" -ge 1 ]; then
        echo "  [PASS] Agent dispatched with team_name ($TEAM_AGENT_CALLS teammate(s))"
    else
        echo "  [FAIL] Agent not dispatched with team_name — teammate dispatch pattern not observed"
        echo "  Agent calls found:"
        jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent") | "  Agent: team_name=\(.input.team_name // "null") name=\(.input.name // "null")"' \
            "$LOG_FILE" 2>/dev/null | head -10 | sed 's/^/    /' || true
        FAILED=$((FAILED+1))
    fi
fi

# Behavioral assertion 3: arcforge expand must be called for the epics.
if [ -f "$LOG_FILE" ]; then
    if grep -q '"expand"' "$LOG_FILE" || grep -q 'cli.js.*expand\|expand.*--epic' "$LOG_FILE"; then
        echo "  [PASS] arcforge expand invoked for epic worktree creation"
    else
        echo "  [FAIL] arcforge expand not observed in log — worktrees not created before dispatch"
        FAILED=$((FAILED+1))
    fi
fi

echo ""
echo "=== arc-dispatching-teammates test: $FAILED failure(s) ==="
echo "Log: $LOG_FILE"
echo "Project: $PROJECT_DIR"
exit $FAILED
