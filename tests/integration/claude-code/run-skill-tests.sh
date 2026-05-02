#!/usr/bin/env bash
# Test runner for Claude Code skills
# Tests skills by invoking Claude Code CLI and verifying behavior
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo " Claude Code Skills Test Suite"
echo "========================================"
echo ""
echo "Repository: $(cd ../../.. && pwd)"
echo "Test time: $(date)"
echo "Claude version: $(claude --version 2>/dev/null || echo 'not found')"
echo ""

TIMEOUT_CMD=""
if command -v timeout &> /dev/null; then
    TIMEOUT_CMD="timeout"
elif command -v gtimeout &> /dev/null; then
    TIMEOUT_CMD="gtimeout"
fi
if [ -z "$TIMEOUT_CMD" ]; then
    echo "Note: timeout/gtimeout not found; tests will run without per-test timeout."
    echo ""
fi

# Check if Claude Code is available
if ! command -v claude &> /dev/null; then
    echo "ERROR: Claude Code CLI not found"
    echo "Install Claude Code first: https://code.claude.com"
    exit 1
fi

# Parse command line arguments
VERBOSE=false
SPECIFIC_TEST=""
TIMEOUT=300  # Default 5 minute timeout per test
RUN_INTEGRATION=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --test|-t)
            SPECIFIC_TEST="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --integration|-i)
            RUN_INTEGRATION=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v        Show verbose output"
            echo "  --test, -t NAME      Run only the specified test"
            echo "  --timeout SECONDS    Set timeout per test (default: 300)"
            echo "  --integration, -i    Run integration tests (slow, 10-30 min)"
            echo "  --help, -h           Show this help"
            echo ""
            echo "Tests:"
            echo "  test-arc-agent-driven.sh         Test agent-driven skill loading and requirements"
            echo "  test-arc-learning.sh             Test optional learning lifecycle and safety gates"
            echo ""
            echo "Integration Tests (use --integration):"
            echo "  test-subagent-driven-development-integration.sh  Full workflow execution"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# List of skill tests to run (fast unit tests)
tests=(
    "test-arc-agent-driven.sh"
    "test-arc-learning.sh"
)

# Integration tests (slow, full execution)
integration_tests=(
    "test-subagent-driven-development-integration.sh"
)

# Add integration tests if requested
if [ "$RUN_INTEGRATION" = true ]; then
    tests+=("${integration_tests[@]}")
fi

# Filter to specific test if requested
if [ -n "$SPECIFIC_TEST" ]; then
    tests=("$SPECIFIC_TEST")
fi

# Track results
passed=0
failed=0
skipped=0

# Run each test
for test in "${tests[@]}"; do
    echo "----------------------------------------"
    echo "Running: $test"
    echo "----------------------------------------"

    test_path="$SCRIPT_DIR/$test"

    if [ ! -f "$test_path" ]; then
        echo "  [SKIP] Test file not found: $test"
        skipped=$((skipped + 1))
        continue
    fi

    if [ ! -x "$test_path" ]; then
        echo "  Making $test executable..."
        chmod +x "$test_path"
    fi

    start_time=$(date +%s)

    if [ "$VERBOSE" = true ]; then
        if [ -n "$TIMEOUT_CMD" ]; then
            test_command=("$TIMEOUT_CMD" "$TIMEOUT" bash "$test_path")
        else
            test_command=(bash "$test_path")
        fi
        if "${test_command[@]}"; then
            end_time=$(date +%s)
            duration=$((end_time - start_time))
            echo ""
            echo "  [PASS] $test (${duration}s)"
            passed=$((passed + 1))
        else
            exit_code=$?
            end_time=$(date +%s)
            duration=$((end_time - start_time))
            echo ""
            if [ $exit_code -eq 124 ] && [ $duration -ge $((TIMEOUT - 5)) ]; then
                echo "  [FAIL] $test (timeout after ${duration}s)"
            else
                echo "  [FAIL] $test (${duration}s, exit $exit_code)"
            fi
            failed=$((failed + 1))
        fi
    else
        # Capture output for non-verbose mode
        if [ -n "$TIMEOUT_CMD" ]; then
            test_command=("$TIMEOUT_CMD" "$TIMEOUT" bash "$test_path")
        else
            test_command=(bash "$test_path")
        fi
        if output=$("${test_command[@]}" 2>&1); then
            end_time=$(date +%s)
            duration=$((end_time - start_time))
            echo "  [PASS] (${duration}s)"
            passed=$((passed + 1))
        else
            exit_code=$?
            end_time=$(date +%s)
            duration=$((end_time - start_time))
            if [ $exit_code -eq 124 ] && [ $duration -ge $((TIMEOUT - 5)) ]; then
                echo "  [FAIL] (timeout after ${duration}s)"
            else
                echo "  [FAIL] (${duration}s, exit $exit_code)"
            fi
            echo ""
            echo "  Output:"
            echo "$output" | sed 's/^/    /'
            failed=$((failed + 1))
        fi
    fi

    echo ""
done

# Print summary
echo "========================================"
echo " Test Results Summary"
echo "========================================"
echo ""
echo "  Passed:  $passed"
echo "  Failed:  $failed"
echo "  Skipped: $skipped"
echo ""

if [ "$RUN_INTEGRATION" = false ] && [ ${#integration_tests[@]} -gt 0 ]; then
    echo "Note: Integration tests were not run (they take 10-30 minutes)."
    echo "Use --integration flag to run full workflow execution tests."
    echo ""
fi

if [ $failed -gt 0 ]; then
    echo "STATUS: FAILED"
    exit 1
else
    echo "STATUS: PASSED"
    exit 0
fi
