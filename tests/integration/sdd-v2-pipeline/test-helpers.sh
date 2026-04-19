#!/usr/bin/env bash
# Helpers for SDD v2 pipeline e2e tests.
#
# Source this file from each test-*.sh. It re-exports the shared bash
# assertions from tests/integration/claude-code/test-helpers.sh and adds:
#
#   Trial-dir setup:
#     setup_trial_dir <name>           sets TRIAL_BASE, PROJECT_DIR, LOG_FILE
#     cleanup_trial_worktree <path>    rm -rf a worktree if it exists
#
#   claude -p wrapper:
#     run_claude_p <prompt> <timeout_seconds> <log_file> [extra_claude_args...]
#
#   Assertions:
#     assert_file_exists <path> [test_name]
#     assert_file_contains <path> <pattern> [test_name]
#     assert_json_field <json> <jq_expr> <expected> [test_name]
#     assert_json_predicate <json> <jq_expr> [test_name]
#     extract_tool_calls <stream_json_log>      (prints lines to stdout)

SDD_V2_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCFORGE_ROOT="${ARCFORGE_ROOT:-$(cd "$SDD_V2_HELPERS_DIR/../../.." && pwd)}"
export ARCFORGE_ROOT

# shellcheck source=/dev/null
source "$ARCFORGE_ROOT/tests/integration/claude-code/test-helpers.sh"

# setup_trial_dir — claim an isolated /tmp trial directory for a test run.
# Sets globals: TRIAL_BASE, PROJECT_DIR, LOG_FILE. Prints a banner.
setup_trial_dir() {
    local name="$1"
    local timestamp
    timestamp=$(date +%s)
    TRIAL_BASE="/tmp/arcforge-tests/$timestamp/sdd-v2-pipeline/$name"
    PROJECT_DIR="$TRIAL_BASE/project"
    LOG_FILE="$TRIAL_BASE/claude-output.json"
    mkdir -p "$TRIAL_BASE"
    echo "=== SDD v2 Pipeline — $name ==="
    echo "Trial dir:  $TRIAL_BASE"
    echo "Plugin dir: $ARCFORGE_ROOT"
    echo ""
}

# run_claude_p — spawn `claude -p` for a test with the SDD-v2 standard flags
# (--plugin-dir, --dangerously-skip-permissions, --output-format stream-json,
# --verbose) under a timeout. On non-zero exit, dump the first 20 log lines
# so the real error becomes visible (stream-json is not human-readable).
# Extra args after <log_file> are passed through to claude (e.g. --max-turns).
# Always returns 0 so callers can proceed to artifact-based assertions.
run_claude_p() {
    local prompt="$1"
    local timeout_seconds="$2"
    local log_file="$3"
    shift 3
    timeout --kill-after=30 "$timeout_seconds" \
        claude -p "$prompt" \
            --plugin-dir "$ARCFORGE_ROOT" \
            --dangerously-skip-permissions \
            --output-format stream-json \
            --verbose \
            "$@" \
        > "$log_file" 2>&1 \
        || {
            echo "(claude -p exited non-zero; first 20 lines of log:)"
            head -20 "$log_file" | sed 's/^/    /' || true
        }
    return 0
}

# cleanup_trial_worktree — remove a worktree directory created by arcforge
# expand during a test. Tests typically call this only on success, leaving
# the worktree in place on failure so the user can inspect it.
cleanup_trial_worktree() {
    local wt="$1"
    [ -n "$wt" ] && [ -d "$wt" ] && rm -rf "$wt" || true
}

assert_file_exists() {
    local file_path="$1"
    local test_name="${2:-file exists: $file_path}"

    if [ -e "$file_path" ]; then
        echo "  [PASS] $test_name"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Expected file to exist: $file_path"
        return 1
    fi
}

assert_file_contains() {
    local file_path="$1"
    local pattern="$2"
    local test_name="${3:-$file_path contains '$pattern'}"

    if [ ! -e "$file_path" ]; then
        echo "  [FAIL] $test_name"
        echo "  File does not exist: $file_path"
        return 1
    fi

    if grep -qE "$pattern" "$file_path"; then
        echo "  [PASS] $test_name"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Pattern not found: $pattern"
        echo "  In file: $file_path"
        echo "  File contents (first 40 lines):"
        head -40 "$file_path" | sed 's/^/    /'
        return 1
    fi
}

# Assert that a JSON file's value at the given jq expression equals expected.
# Usage: assert_json_field <json_path> <jq_expr> <expected> <test_name>
# Example: assert_json_field .arcforge-loop.json '.pattern' '"dag"' "pattern is dag"
# Note: string values must be quoted in <expected> since jq emits JSON scalars.
assert_json_field() {
    local json_path="$1"
    local jq_expr="$2"
    local expected="$3"
    local test_name="${4:-$json_path $jq_expr == $expected}"

    if ! command -v jq >/dev/null 2>&1; then
        echo "  [FAIL] $test_name (jq not installed)"
        return 1
    fi

    if [ ! -f "$json_path" ]; then
        echo "  [FAIL] $test_name"
        echo "  JSON file does not exist: $json_path"
        return 1
    fi

    local actual
    actual=$(jq -c "$jq_expr" "$json_path" 2>/dev/null || echo "<jq error>")
    if [ "$actual" = "$expected" ]; then
        echo "  [PASS] $test_name"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        echo "  JSON contents:"
        jq . "$json_path" 2>/dev/null | head -30 | sed 's/^/    /'
        return 1
    fi
}

# Assert that a numeric field satisfies a jq boolean expression.
# Usage: assert_json_predicate <json_path> <jq_expr>   e.g. '.iteration >= 1'
assert_json_predicate() {
    local json_path="$1"
    local jq_expr="$2"
    local test_name="${3:-$json_path $jq_expr}"

    if [ ! -f "$json_path" ]; then
        echo "  [FAIL] $test_name"
        echo "  JSON file does not exist: $json_path"
        return 1
    fi

    local result
    result=$(jq -r "$jq_expr" "$json_path" 2>/dev/null || echo "")
    if [ "$result" = "true" ]; then
        echo "  [PASS] $test_name"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Predicate '$jq_expr' was not true (got: $result)"
        jq . "$json_path" 2>/dev/null | head -30 | sed 's/^/    /'
        return 1
    fi
}

# Extract tool_use and tool_result events from a stream-json claude log.
# Emits one line per tool call: "<tool_name>\t<short_input>"
extract_tool_calls() {
    local log_path="$1"
    if [ ! -f "$log_path" ]; then
        return 1
    fi
    jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | "\(.name)\t\(.input | tostring | .[0:120])"' \
        "$log_path" 2>/dev/null
}

export -f setup_trial_dir
export -f run_claude_p
export -f cleanup_trial_worktree
export -f assert_file_exists
export -f assert_file_contains
export -f assert_json_field
export -f assert_json_predicate
export -f extract_tool_calls
