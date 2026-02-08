#!/usr/bin/env bash
# Test: arc-agent-driven skill
# Verifies that the skill is loaded and follows correct workflow
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo "=== Test: arc-agent-driven skill ==="
echo ""

# Test 1: Verify skill can be loaded
echo "Test 1: Skill loading..."

output=$(run_claude "What is the arc-agent-driven skill? Describe its key steps briefly." 60)

if assert_contains "$output" "arc-agent-driven\|agent.driven" "Skill is recognized"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "task\|subagent\|dispatch" "Mentions task execution"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 2: Verify skill describes correct workflow order
echo "Test 2: Workflow ordering..."

output=$(run_claude "In the arc-agent-driven skill, which review comes first: spec compliance or code quality? Answer with the order." 60)

if assert_contains "$output" "spec.*first\|spec.*before.*code\|first.*spec\|compliance.*then.*quality\|compliance.*followed.*quality" "Spec compliance comes first"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 3: Verify self-review is mentioned
echo "Test 3: Self-review requirement..."

output=$(run_claude "Does the arc-agent-driven skill require implementers to do self-review before the review stage?" 60)

if assert_contains "$output" "self-review\|self review\|self.review" "Mentions self-review"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 4: Verify review loops
echo "Test 4: Review loop requirements..."

output=$(run_claude "In arc-agent-driven, what happens if a reviewer finds issues? Is it a one-time review or a loop?" 60)

if assert_contains "$output" "loop\|again\|repeat\|until.*approved\|until.*compliant" "Review loops mentioned"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "fix\|resolve\|address" "Issues get fixed"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 5: Verify full task text is provided
echo "Test 5: Task context provision..."

output=$(run_claude "In arc-agent-driven, how does the controller provide task information to the implementer subagent? Does it make them read a file or provide it directly?" 60)

if assert_contains "$output" "provide.*directly\|full.*text\|paste\|include.*prompt\|provide.*full" "Provides text directly"; then
    : # pass
else
    exit 1
fi

echo ""

echo "=== All arc-agent-driven skill tests passed ==="
