#!/usr/bin/env bash
# Run both Phase A SDD v2 pipeline tests sequentially.
# Integration tests are manual-only (not wired into npm test).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TESTS=(
    "test-arc-implementing.sh"
    "test-arc-looping.sh"
)

RESULTS=()
OVERALL_STATUS=0

for test_script in "${TESTS[@]}"; do
    echo ""
    echo "==================================================================="
    echo "  Running: $test_script"
    echo "==================================================================="
    if bash "$SCRIPT_DIR/$test_script"; then
        RESULTS+=("PASS  $test_script")
    else
        RESULTS+=("FAIL  $test_script")
        OVERALL_STATUS=1
    fi
done

echo ""
echo "==================================================================="
echo "  Summary"
echo "==================================================================="
for line in "${RESULTS[@]}"; do
    echo "  $line"
done

exit $OVERALL_STATUS
