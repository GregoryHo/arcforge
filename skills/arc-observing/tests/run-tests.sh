#!/usr/bin/env bash
# Bash tests for observer-daemon.sh behavior (Slice B)
# Minimal POSIX shell test framework — no external deps.
#
# Usage: bash skills/arc-observing/tests/run-tests.sh
# Requires: bash 4+ (macOS ships bash 3.2 but uses zsh by default — this
# script is invoked as 'bash run-tests.sh' so homebrew bash is not required)

set -uo pipefail

DAEMON_SCRIPT="$(cd "$(dirname "$0")/../scripts" && pwd)/observer-daemon.sh"
PASS=0
FAIL=0
ERRORS=()

# ─────────────────────────────────────────────
# Test Framework
# ─────────────────────────────────────────────

assert_eq() {
  local description="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $description"
    echo "        expected: $expected"
    echo "        actual:   $actual"
    FAIL=$((FAIL + 1))
    ERRORS+=("$description")
  fi
}

assert_match() {
  local description="$1"
  local pattern="$2"
  local actual="$3"
  if echo "$actual" | grep -qEi "$pattern"; then
    echo "  PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $description"
    echo "        pattern:  $pattern"
    echo "        actual:   $actual"
    FAIL=$((FAIL + 1))
    ERRORS+=("$description")
  fi
}

assert_not_match() {
  local description="$1"
  local pattern="$2"
  local actual="$3"
  if ! echo "$actual" | grep -qEi "$pattern"; then
    echo "  PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $description"
    echo "        pattern should NOT match: $pattern"
    echo "        actual: $actual"
    FAIL=$((FAIL + 1))
    ERRORS+=("$description")
  fi
}

# ─────────────────────────────────────────────
# C5: --max-turns value is 15
# ─────────────────────────────────────────────

echo ""
echo "=== C5: --max-turns value ==="

MAX_TURNS_LINE=$(grep -- '--max-turns' "$DAEMON_SCRIPT" | head -1 || true)
assert_match \
  'daemon script contains --max-turns 15' \
  '\-\-max-turns 15' \
  "$MAX_TURNS_LINE"

assert_not_match \
  'daemon script does not contain old --max-turns 3' \
  '\-\-max-turns 3[^0-9]' \
  "$MAX_TURNS_LINE"

# ─────────────────────────────────────────────
# C3: ANALYZING re-entrancy guard
# ─────────────────────────────────────────────
# Strategy: source the daemon with HOME pointing to a temp dir so all paths
# (INSTINCTS_DIR, LOG_FILE) resolve under that temp dir. The BASH_SOURCE guard
# at the bottom of the daemon ensures the case block is skipped when sourced.

echo ""
echo "=== C3: ANALYZING re-entrancy guard ==="

TMPDIR_C3=$(mktemp -d)
trap 'rm -rf "$TMPDIR_C3"' EXIT
TEST_HOME_C3="${TMPDIR_C3}/home"
mkdir -p "$TEST_HOME_C3"

# Test 1: pre-create .analyzing.lock → analyze_all_projects must skip and log
C3_LOCKED_LOG=$(
  HOME="$TEST_HOME_C3"
  SCRIPT_DIR="$(dirname "$DAEMON_SCRIPT")"
  OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
  OBSERVER_SYSTEM_PROMPT="${SCRIPT_DIR}/observer-system-prompt.md"
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  touch "${INSTINCTS_DIR}/.analyzing.lock"
  analyze_all_projects 2>/dev/null
  cat "$LOG_FILE" 2>/dev/null || true
) 2>/dev/null

assert_match \
  'C3: logs skip message when .analyzing.lock exists' \
  'ANALYZING.*in.progress|ANALYZING.*skip|analysis.*in.progress|re.entrancy|already.analyz' \
  "$C3_LOCKED_LOG"

# Test 2: no lock → analysis runs normally, lock removed after completion
TEST_HOME_C3B="${TMPDIR_C3}/home2"
mkdir -p "$TEST_HOME_C3B"
C3_CLEAN_RESULT=$(
  HOME="$TEST_HOME_C3B"
  SCRIPT_DIR="$(dirname "$DAEMON_SCRIPT")"
  OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
  OBSERVER_SYSTEM_PROMPT="${SCRIPT_DIR}/observer-system-prompt.md"
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_all_projects 2>/dev/null
  [ -f "${INSTINCTS_DIR}/.analyzing.lock" ] && echo 'LOCK_EXISTS' || echo 'LOCK_GONE'
) 2>/dev/null

assert_eq \
  'C3: lock file removed after analysis completes (no stale lock)' \
  'LOCK_GONE' \
  "$C3_CLEAN_RESULT"

# Test 3: no skip message in clean run
TEST_HOME_C3C="${TMPDIR_C3}/home3"
mkdir -p "$TEST_HOME_C3C"
C3_CLEAN_LOG=$(
  HOME="$TEST_HOME_C3C"
  SCRIPT_DIR="$(dirname "$DAEMON_SCRIPT")"
  OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
  OBSERVER_SYSTEM_PROMPT="${SCRIPT_DIR}/observer-system-prompt.md"
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_all_projects 2>/dev/null
  cat "$LOG_FILE" 2>/dev/null || true
) 2>/dev/null

assert_not_match \
  'C3: no skip message in clean run (lock was not pre-created)' \
  'ANALYZING.*in.progress|ANALYZING.*skip' \
  "$C3_CLEAN_LOG"

# ─────────────────────────────────────────────
# C4: Watchdog around claude invocation
# ─────────────────────────────────────────────
# Strategy: create a stub 'claude' that sleeps longer than the test watchdog,
# inject it into PATH, set OBSERVER_DAEMON_WATCHDOG_SECS=3, and call analyze_project.
# Verify: (a) timeout log message appears, (b) elapsed time < stub sleep duration.

echo ""
echo "=== C4: Watchdog around claude invocation ==="

TMPDIR_C4=$(mktemp -d)
trap 'rm -rf "$TMPDIR_C3" "$TMPDIR_C4"' EXIT
TEST_HOME_C4="${TMPDIR_C4}/home"
STUB_BIN="${TMPDIR_C4}/bin"
mkdir -p "$TEST_HOME_C4" "$STUB_BIN"

# Stub 'claude' that sleeps 10 seconds (longer than 3s test watchdog)
cat > "${STUB_BIN}/claude" << 'STUB_EOF'
#!/usr/bin/env bash
sleep 10
STUB_EOF
chmod +x "${STUB_BIN}/claude"

# Create a project with enough observations to pass the MIN_OBSERVATIONS gate
PROJ_DIR="${TEST_HOME_C4}/.arcforge/observations/test-proj"
mkdir -p "$PROJ_DIR"
for i in $(seq 1 15); do
  echo '{"event":"tool_start","tool":"Read"}' >> "${PROJ_DIR}/observations.jsonl"
done

START_TS=$(date +%s)
C4_LOG=$(
  HOME="$TEST_HOME_C4"
  PATH="${STUB_BIN}:${PATH}"
  OBSERVER_DAEMON_WATCHDOG_SECS=3
  SCRIPT_DIR="$(dirname "$DAEMON_SCRIPT")"
  OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
  OBSERVER_SYSTEM_PROMPT="${SCRIPT_DIR}/observer-system-prompt.md"
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_project 'test-proj' 2>/dev/null || true
  cat "$LOG_FILE" 2>/dev/null || true
) 2>/dev/null
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

assert_match \
  'C4: logs timeout/kill message when claude exceeds watchdog' \
  'WATCHDOG|timeout|timed.out|killed' \
  "$C4_LOG"

# Should complete in ~3-7s (3s watchdog + overhead), not 10s (stub sleep)
if [ "$ELAPSED" -lt 10 ]; then
  echo "  PASS: C4: process killed before stub sleep (${ELAPSED}s elapsed, expected < 10s)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: C4: watchdog did not kill process in time (${ELAPSED}s elapsed, expected < 10s)"
  FAIL=$((FAIL + 1))
  ERRORS+=('C4: process killed before stub sleep (elapsed check)')
fi

# ─────────────────────────────────────────────
# Results
# ─────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [ "${#ERRORS[@]}" -gt 0 ]; then
  echo "Failed tests:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
  exit 1
fi

exit 0
