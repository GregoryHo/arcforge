#!/usr/bin/env bash
# Test: subagent-driven-development skill
# Verifies that the skill is loaded and follows correct workflow
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo "=== Test: subagent-driven-development skill ==="
echo ""

FAILED=0

# Test 1: Verify skill can be loaded
echo "Test 1: Skill loading..."
output=$(run_claude "What is the subagent-driven-development skill? Describe its key steps briefly.") || true

if require_output "$output" "Skill loading"; then
    assert_contains "$output" "subagent-driven-development" "Skill is recognized" || FAILED=$((FAILED + 1))
    assert_contains "$output" "Load Plan\|read.*plan\|extract.*tasks" "Mentions loading plan" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 2: Verify skill describes correct workflow order
echo "Test 2: Workflow ordering..."
output=$(run_claude "In the subagent-driven-development skill, what comes first: spec compliance review or code quality review? Be specific about the order.") || true

if require_output "$output" "Workflow ordering"; then
    assert_order "$output" "spec.*compliance" "code.*quality" "Spec compliance before code quality" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Verify self-review is mentioned
echo "Test 3: Self-review requirement..."
output=$(run_claude "Does the subagent-driven-development skill require implementers to do self-review? What should they check?") || true

if require_output "$output" "Self-review requirement"; then
    assert_contains "$output" "self-review\|self review" "Mentions self-review" || FAILED=$((FAILED + 1))
    assert_contains "$output" "completeness\|Completeness" "Checks completeness" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: Verify plan is read once
echo "Test 4: Plan reading efficiency..."
output=$(run_claude "In subagent-driven-development, how many times should the controller read the plan file? When does this happen?") || true

if require_output "$output" "Plan reading efficiency"; then
    assert_contains "$output" "once\|one time\|single" "Read plan once" || FAILED=$((FAILED + 1))
    assert_contains "$output" "Step 1\|beginning\|start\|Load Plan" "Read at beginning" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 5: Verify spec compliance reviewer is skeptical
echo "Test 5: Spec compliance reviewer mindset..."
output=$(run_claude "What is the spec compliance reviewer's attitude toward the implementer's report in subagent-driven-development?") || true

if require_output "$output" "Spec compliance reviewer mindset"; then
    assert_contains "$output" "not trust\|don't trust\|skeptical\|verify.*independently\|suspiciously" "Reviewer is skeptical" || FAILED=$((FAILED + 1))
    assert_contains "$output" "read.*code\|inspect.*code\|verify.*code" "Reviewer reads code" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 6: Verify review loops
echo "Test 6: Review loop requirements..."
output=$(run_claude "In subagent-driven-development, what happens if a reviewer finds issues? Is it a one-time review or a loop?") || true

if require_output "$output" "Review loop requirements"; then
    assert_contains "$output" "loop\|again\|repeat\|until.*approved\|until.*compliant" "Review loops mentioned" || FAILED=$((FAILED + 1))
    assert_contains "$output" "implementer.*fix\|fix.*issues" "Implementer fixes issues" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 7: Verify full task text is provided
echo "Test 7: Task context provision..."
output=$(run_claude "In subagent-driven-development, how does the controller provide task information to the implementer subagent? Does it make them read a file or provide it directly?") || true

if require_output "$output" "Task context provision"; then
    assert_contains "$output" "provide.*directly\|full.*text\|paste\|include.*prompt" "Provides text directly" || FAILED=$((FAILED + 1))
    assert_not_contains "$output" "read.*file\|open.*file" "Doesn't make subagent read file" || FAILED=$((FAILED + 1))
else
    FAILED=$((FAILED + 1))
fi
echo ""

if [ $FAILED -gt 0 ]; then
    echo "=== $FAILED assertion(s) failed ==="
    exit 1
fi

echo "=== All subagent-driven-development skill tests passed ==="
