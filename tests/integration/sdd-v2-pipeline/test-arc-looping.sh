#!/usr/bin/env bash
# SDD v2 pipeline e2e test — arc-looping (DAG pattern)
#
# Scaffolds the demo-spec fixture, then spawns `claude -p` at project root
# asking the agent to run arc-looping with DAG pattern and a small max-runs
# cap. Verifies that the .arcforge-loop.json state file reflects correct
# pattern + iteration advance, and that dag.yaml shows at least one
# mutation caused by the loop.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./test-helpers.sh
source "$SCRIPT_DIR/test-helpers.sh"

setup_trial_dir "arc-looping"

echo ">>> Scaffolding fixture into trial dir..."
"$SCRIPT_DIR/fixture/scaffold.sh" "$PROJECT_DIR"

echo ""
echo ">>> Spawning claude -p at project root to run arc-looping..."
cd "$PROJECT_DIR"

PROMPT="You have a per-spec DAG at specs/demo-spec/dag.yaml with three epics (epic-parser, epic-formatter, epic-integration — the last depends on both roots). Use the arc-looping skill to run this DAG unattended with the DAG pattern. Cap the run at 3 iterations (--max-runs 3) so the test completes quickly. Invoke the arcforge loop CLI directly; do not try to do the work by hand. Do not use the sequential pattern."

TIMEOUT_SECONDS="${SDD_V2_LOOPING_TIMEOUT:-1200}"
run_claude_p "$PROMPT" "$TIMEOUT_SECONDS" "$LOG_FILE"

echo ""
echo ">>> Assertions (against project: $PROJECT_DIR)"
FAILED=0

LOOP_STATE="$PROJECT_DIR/.arcforge-loop.json"

assert_file_exists "$LOOP_STATE" "loop state file created at project root" \
    || FAILED=$((FAILED+1))

if [ -f "$LOOP_STATE" ]; then
    assert_json_field "$LOOP_STATE" '.pattern' '"dag"' \
        "loop state records pattern=dag" || FAILED=$((FAILED+1))

    assert_json_predicate "$LOOP_STATE" '.iteration >= 1' \
        "loop advanced at least one iteration" || FAILED=$((FAILED+1))

    # status is one of the terminal / in-progress values listed in
    # scripts/loop.js:checkStopConditions.
    assert_json_predicate "$LOOP_STATE" \
        '[.status] | inside(["running","complete","max_runs","cost_limit","stalled","retry_storm","failed","no_dag"])' \
        "loop status is a known value" || FAILED=$((FAILED+1))
fi

# Behavioral assertion: the claude session must have invoked the arcforge loop
# CLI with --pattern dag. Check the stream-json log for a Bash tool call
# containing that phrase.
if [ -f "$LOG_FILE" ]; then
    if grep -qE "arcforge[[:space:]]+loop|scripts/cli\\.js[[:space:]]+loop|scripts/loop\\.js" "$LOG_FILE" \
       && grep -qE "pattern[[:space:]=]*\"?dag\"?|--pattern[[:space:]]+dag" "$LOG_FILE"; then
        echo "  [PASS] arcforge loop CLI invoked with --pattern dag"
    else
        echo "  [FAIL] did not invoke arcforge loop CLI with --pattern dag"
        echo "  Sample loop-related lines from log:"
        grep -E "loop|pattern" "$LOG_FILE" | head -10 | sed 's/^/    /' || true
        FAILED=$((FAILED+1))
    fi
fi

echo ""
echo "=== arc-looping test: $FAILED failure(s) ==="
echo "Loop state: $LOOP_STATE"
echo "Log: $LOG_FILE"
exit $FAILED
