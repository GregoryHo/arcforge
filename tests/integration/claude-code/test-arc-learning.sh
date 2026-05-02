#!/usr/bin/env bash
# Test: arc-learning skill
# Verifies Claude Code sees the current optional learning lifecycle and safety gates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo "=== Test: arc-learning skill ==="
echo ""

FAILED=0

# Test 1: Verify skill can be loaded and describes optional learning.
echo "Test 1: Skill loading and opt-in behavior..."
output=$(run_claude "What is the arc-learning skill? Answer briefly with its default state and lifecycle." 120) || true

if require_output "$output" "arc-learning skill loading"; then
    assert_contains "$output" "arc-learning\|learning" "Skill is recognized" || FAILED=$((FAILED + 1))
    assert_contains "$output" "disabled by default\|[Dd]efault.*disabled\|opt-in\|enable" "Learning is opt-in / disabled by default" || FAILED=$((FAILED + 1))
    assert_contains "$output" "candidate\|queue" "Mentions candidate queue" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 2: Verify automatic trigger is safe and limited to queueing.
echo "Test 2: Automatic trigger safety..."
output=$(run_claude "In arc-learning, after learning is enabled and an observation is written, what does the automatic trigger do? Does it materialize or activate anything?" 120) || true

if require_output "$output" "automatic trigger safety"; then
    assert_contains "$output" "automatic\|trigger" "Mentions automatic trigger" || FAILED=$((FAILED + 1))
    assert_contains "$output" "pending\|candidate\|queue" "Automatic trigger queues candidates" || FAILED=$((FAILED + 1))
    assert_contains "$output" "not.*materialize\|doesn't.*materialize\|does not.*materialize\|no.*materialize\|nothing else" "Does not materialize automatically" || FAILED=$((FAILED + 1))
    assert_contains "$output" "not.*activate\|doesn't.*activate\|does not.*activate\|no.*activate\|nothing else" "Does not activate automatically" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Verify manual lifecycle gates.
echo "Test 3: Manual review/materialize/activate gates..."
output=$(run_claude "In arc-learning, list the safe lifecycle after a candidate is queued. Include review, approve/reject, materialize, inspect, and activate semantics." 120) || true

if require_output "$output" "manual lifecycle gates"; then
    assert_contains "$output" "review" "Mentions review" || FAILED=$((FAILED + 1))
    assert_contains "$output" "approve\|reject" "Mentions approve/reject" || FAILED=$((FAILED + 1))
    assert_contains "$output" "inactive\|draft" "Materialize creates inactive draft" || FAILED=$((FAILED + 1))
    assert_contains "$output" "inspect" "Mentions inspect before activation" || FAILED=$((FAILED + 1))
    assert_contains "$output" "activate" "Mentions explicit activation" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

if [ $FAILED -gt 0 ]; then
    echo "=== $FAILED assertion(s) failed ==="
    exit 1
fi

echo "=== All arc-learning skill tests passed ==="
