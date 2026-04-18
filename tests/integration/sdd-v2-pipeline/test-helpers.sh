#!/usr/bin/env bash
# Helpers for SDD v2 pipeline e2e tests.
#
# Source this file from each test-*.sh. It re-exports the shared bash
# assertions from tests/integration/claude-code/test-helpers.sh and adds
# four SDD-v2-specific helpers:
#   - assert_file_exists <path> <test_name>
#   - assert_file_contains <path> <pattern> <test_name>
#   - assert_json_field <json_path> <jq_expr> <expected> <test_name>
#   - extract_tool_calls <stream_json_log>  (writes matching lines to stdout)

SDD_V2_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCFORGE_ROOT="${ARCFORGE_ROOT:-$(cd "$SDD_V2_HELPERS_DIR/../../.." && pwd)}"
export ARCFORGE_ROOT

# shellcheck source=/dev/null
source "$ARCFORGE_ROOT/tests/integration/claude-code/test-helpers.sh"

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

export -f assert_file_exists
export -f assert_file_contains
export -f assert_json_field
export -f assert_json_predicate
export -f extract_tool_calls
