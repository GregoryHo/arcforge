#!/usr/bin/env bash
# Test: arc-agent-driven skill
# Verifies that the skill is loaded and follows correct workflow
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo "=== Test: arc-agent-driven skill ==="
echo ""

FAILED=0

# Test 1: Verify skill can be loaded
echo "Test 1: Skill loading..."
output=$(run_claude "What is the arc-agent-driven skill? Describe its key steps briefly.") || true

if require_output "$output" "Skill loading"; then
    assert_contains "$output" "arc-agent-driven\|agent.driven" "Skill is recognized" || FAILED=$((FAILED + 1))
    assert_contains "$output" "task\|subagent\|dispatch" "Mentions task execution" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 2: Verify skill describes correct workflow order
echo "Test 2: Workflow ordering..."
output=$(run_claude "In the arc-agent-driven skill, which review comes first: spec compliance or code quality? Answer with the order.") || true

if require_output "$output" "Workflow ordering"; then
    assert_contains "$output" "spec.*first\|spec.*before.*code\|first.*spec\|compliance.*then.*quality\|compliance.*followed.*quality" "Spec compliance comes first" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Verify self-review is mentioned
echo "Test 3: Self-review requirement..."
output=$(run_claude "Does the arc-agent-driven skill require implementers to do self-review before the review stage?") || true

if require_output "$output" "Self-review requirement"; then
    assert_contains "$output" "self-review\|self review\|self.review" "Mentions self-review" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: Verify review loops
echo "Test 4: Review loop requirements..."
output=$(run_claude "In arc-agent-driven, what happens if a reviewer finds issues? Is it a one-time review or a loop?") || true

if require_output "$output" "Review loop requirements"; then
    assert_contains "$output" "loop\|again\|repeat\|until.*approved\|until.*compliant" "Review loops mentioned" || FAILED=$((FAILED + 1))
    assert_contains "$output" "fix\|resolve\|address" "Issues get fixed" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 5: Verify full task text is provided
echo "Test 5: Task context provision..."
output=$(run_claude "In arc-agent-driven, how does the controller provide task information to the implementer subagent? Does it make them read a file or provide it directly?") || true

if require_output "$output" "Task context provision"; then
    assert_contains "$output" "provide.*directly\|full.*text\|paste\|include.*prompt\|provide.*full" "Provides text directly" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

if [ $FAILED -gt 0 ]; then
    echo "=== $FAILED assertion(s) failed ==="
    exit 1
fi

echo "=== All arc-agent-driven skill tests passed ==="
