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

# PR-F C4 extension: assert that a failure manifest with parse_status=timeout was written
C4_RUNS_DIR="${TEST_HOME_C4}/.arcforge/learning/curator-runs"
C4_TIMEOUT_STATUS=""
if [ -d "$C4_RUNS_DIR" ]; then
  C4_TIMEOUT_STATUS=$(find "$C4_RUNS_DIR" -name '*.manifest.json' 2>/dev/null \
    -exec grep -l '"timeout"' {} \; | head -1 || true)
fi

if [ -n "$C4_TIMEOUT_STATUS" ]; then
  echo "  PASS: C4 PR-F: failure manifest with parse_status=timeout was written"
  PASS=$((PASS + 1))
else
  echo "  FAIL: C4 PR-F: no failure manifest with parse_status=timeout found in ${C4_RUNS_DIR}"
  FAIL=$((FAIL + 1))
  ERRORS+=('C4 PR-F: failure manifest with parse_status=timeout was written')
fi

# PR-F C4 extension: when all attempts timed out, NO transport_error manifest should be written
C4_TRANSPORT_STATUS=""
if [ -d "$C4_RUNS_DIR" ]; then
  C4_TRANSPORT_STATUS=$(find "$C4_RUNS_DIR" -name '*.manifest.json' 2>/dev/null \
    -exec grep -l '"transport_error"' {} \; | head -1 || true)
fi

if [ -z "$C4_TRANSPORT_STATUS" ]; then
  echo "  PASS: C4 PR-F: no spurious transport_error manifest when all attempts timed out"
  PASS=$((PASS + 1))
else
  echo "  FAIL: C4 PR-F: spurious transport_error manifest written when all attempts timed out (should be timeout only)"
  echo "        manifest: ${C4_TRANSPORT_STATUS}"
  FAIL=$((FAIL + 1))
  ERRORS+=('C4 PR-F: no spurious transport_error manifest when all attempts timed out')
fi

# ─────────────────────────────────────────────
# PR-F-T1: transport_error — stub claude exits 1 → failure manifest written
# Strategy: stub claude exits 1 immediately. Daemon should call record-run-failure
# and write a manifest with parse_status=transport_error.
# ─────────────────────────────────────────────

echo ""
echo "=== PR-F-T1: transport_error failure manifest ==="

ARCFORGE_REPO_ROOT_PRF="$(cd "$(dirname "$0")/../../.." && pwd)"
TMPDIR_PRF=$(mktemp -d)
trap 'rm -rf "$TMPDIR_PRF"' EXIT
TEST_HOME_PRF="${TMPDIR_PRF}/home"
STUB_BIN_PRF="${TMPDIR_PRF}/bin"
mkdir -p "$TEST_HOME_PRF" "$STUB_BIN_PRF"

# Stub 'claude' that exits 1 immediately (transport_error)
cat > "${STUB_BIN_PRF}/claude" << 'STUB_EOF'
#!/usr/bin/env bash
exit 1
STUB_EOF
chmod +x "${STUB_BIN_PRF}/claude"

# Create a project with enough observations
PRF_PROJECT="prf-test-proj"
PRF_OBS_DIR="${TEST_HOME_PRF}/.arcforge/observations/${PRF_PROJECT}"
mkdir -p "$PRF_OBS_DIR"
for i in $(seq 1 15); do
  printf '{"ts":"2026-05-22T01:%02d:00.000Z","event":"tool_start","tool":"Read","session":"s1","project":"%s","project_id":"proj_abc123456789ab","evidence_status":"present","input_summary":"file %d"}\n' \
    "$i" "$PRF_PROJECT" "$i" >> "${PRF_OBS_DIR}/observations.jsonl"
done

PRF_RESULT=$(
  HOME="$TEST_HOME_PRF"
  ARCFORGE_ROOT="$ARCFORGE_REPO_ROOT_PRF"
  PATH="${STUB_BIN_PRF}:${PATH}"
  SCRIPT_DIR="$(dirname "$DAEMON_SCRIPT")"
  OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
  OBSERVER_DAEMON_WATCHDOG_SECS=10
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_project "$PRF_PROJECT" 2>/dev/null || true
  echo "done"
) 2>/dev/null

# Assert: failure manifest with parse_status=transport_error was written
PRF_RUNS_DIR="${TEST_HOME_PRF}/.arcforge/learning/curator-runs"
PRF_TRANSPORT_MANIFEST=""
if [ -d "$PRF_RUNS_DIR" ]; then
  PRF_TRANSPORT_MANIFEST=$(find "$PRF_RUNS_DIR" -name '*.manifest.json' 2>/dev/null \
    -exec grep -l '"transport_error"' {} \; | head -1 || true)
fi

if [ -n "$PRF_TRANSPORT_MANIFEST" ]; then
  echo "  PASS: PR-F-T1: failure manifest with parse_status=transport_error was written"
  PASS=$((PASS + 1))
else
  echo "  FAIL: PR-F-T1: no failure manifest with parse_status=transport_error found"
  echo "        Runs dir: ${PRF_RUNS_DIR}"
  echo "        PRF_RESULT: ${PRF_RESULT}"
  FAIL=$((FAIL + 1))
  ERRORS+=('PR-F-T1: failure manifest with parse_status=transport_error was written')
fi

# ─────────────────────────────────────────────
# E2-G1: daemon no longer writes to per-project instincts subdir
# Strategy: the production analysis code must not contain mkdir + write
# operations targeting ${project_instincts}/<id>.md.
# We check that 'project_instincts' is NOT used with mkdir or as a write target
# in the production code section (below the ANALYZING lock acquisition).
# Comments/retired-label references are acceptable.
# ─────────────────────────────────────────────

echo ""
echo "=== E2-G1: No direct instinct file writes in production code ==="

# Grep for lines that use project_instincts in file-write contexts.
# The old pattern wrote to "${project_instincts}/<id>.md" via 'Write' tool
# or direct shell redirects. After rewire, project_instincts is not used for
# writing; only the instincts dir root is used for lock/log files.
INSTINCT_WRITE_LINES=$(grep -n 'project_instincts' "$DAEMON_SCRIPT" | \
  grep -v '^[[:space:]]*#' | \
  grep -E '(mkdir|before_count|after_count|\.md|find.*\.md|existing_instincts)' || true)

assert_eq \
  'E2-G1: daemon production code does not write to per-project instincts subdir' \
  '' \
  "$INSTINCT_WRITE_LINES"

# ─────────────────────────────────────────────
# E2-G2: daemon calls Node CLI assemble-batch and ingest-proposal
# ─────────────────────────────────────────────

echo ""
echo "=== E2-G2: Daemon calls Node CLI ==="

# Match patterns: either 'cli.js assemble-batch' or 'CURATOR_CLI' + 'assemble-batch' on same line
ASSEMBLE_BATCH_LINE=$(grep 'assemble-batch' "$DAEMON_SCRIPT" | grep -v '^[[:space:]]*#' | wc -l | tr -d ' ')
INGEST_PROPOSAL_LINE=$(grep 'ingest-proposal' "$DAEMON_SCRIPT" | grep -v '^[[:space:]]*#' | wc -l | tr -d ' ')

if [ "$ASSEMBLE_BATCH_LINE" -ge 1 ]; then
  echo "  PASS: E2-G2: daemon calls cli.js assemble-batch"
  PASS=$((PASS + 1))
else
  echo "  FAIL: E2-G2: daemon does not call cli.js assemble-batch"
  FAIL=$((FAIL + 1))
  ERRORS+=('E2-G2: daemon calls cli.js assemble-batch')
fi

if [ "$INGEST_PROPOSAL_LINE" -ge 1 ]; then
  echo "  PASS: E2-G2: daemon calls cli.js ingest-proposal"
  PASS=$((PASS + 1))
else
  echo "  FAIL: E2-G2: daemon does not call cli.js ingest-proposal"
  FAIL=$((FAIL + 1))
  ERRORS+=('E2-G2: daemon calls cli.js ingest-proposal')
fi

# ─────────────────────────────────────────────
# E2-G3: End-to-end integration test
# Strategy:
#   (a) seed observations in a temp dir
#   (b) stub 'claude' CLI that writes a known CandidateProposalPayload JSON to stdout
#   (c) source daemon + invoke analyze_project with ARCFORGE_ROOT pointing to repo
#   (d) assert queue.jsonl has one new candidate, instincts dir for the project is empty
# ─────────────────────────────────────────────

echo ""
echo "=== E2-G3: End-to-end integration test ==="

ARCFORGE_REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMPDIR_G3=$(mktemp -d)
trap 'rm -rf "$TMPDIR_G3"' EXIT
TEST_HOME_G3="${TMPDIR_G3}/home"
STUB_BIN_G3="${TMPDIR_G3}/bin"
mkdir -p "$TEST_HOME_G3" "$STUB_BIN_G3"

# Seed 15 observations so the MIN_OBSERVATIONS gate passes
G3_PROJECT="e2-test-proj"
G3_OBS_DIR="${TEST_HOME_G3}/.arcforge/observations/${G3_PROJECT}"
mkdir -p "$G3_OBS_DIR"
for i in $(seq 1 15); do
  printf '{"ts":"2026-05-21T01:%02d:00.000Z","event":"tool_start","tool":"Read","session":"session-abc","project":"%s","project_id":"proj_abc123456789ab","evidence_status":"present","input_summary":"reading file %d"}\n' \
    "$i" "$G3_PROJECT" "$i" >> "${G3_OBS_DIR}/observations.jsonl"
done

# Stub 'node' that intercepts cli.js calls:
#   - assemble-batch: writes a minimal manifest + prompt, prints JSON
#   - ingest-proposal: calls real Node to ingest (so queue.jsonl gets written)
# This stub delegates back to real node when the script is NOT cli.js,
# and handles cli.js calls with hardcoded responses.
#
# Actually: simplest approach — stub only 'claude' to emit known JSON.
# Let node calls go to real node (ARCFORGE_ROOT is set to repo root).

# Slice E.2b: daemon calls claude with `--output-format json --json-schema ...`,
# so the response file is a CLI envelope whose .structured_output holds the payload.
# The stub mimics that envelope shape — proposal-ingestor.js extracts structured_output.
STUB_PAYLOAD='{"schema_version":1,"source":{"layer":4,"curator":"llm","run_id":"curator_run_20260521T030000Z_aabbccddee11","created_at":"2026-05-21T03:00:00.000Z","batch_id":"STUB_BATCH","batch_hash":"STUB_HASH","prompt_policy_version":"v1","output_schema_version":1},"proposals":[{"proposal_index":0,"artifact_type":"instinct","proposed_scope":{"kind":"project","project_id":"proj_abc123456789ab"},"name":"e2-test-instinct","summary":"Test instinct from E2 stub","rationale":"Observed in E2 test fixture","domain":"workflow","body":"When in E2 test, always write tests first.","body_source":"llm_curator","evidence_refs":[],"llm_confidence":"medium","risk_notes":[],"uncertainty_notes":[],"recommended_review_action":"review"}]}'
STUB_ENVELOPE='{"type":"result","subtype":"success","is_error":false,"api_error_status":null,"duration_ms":100,"result":"stub success","structured_output":'$STUB_PAYLOAD'}'

# Stub claude that emits the CLI envelope (matches --output-format json + --json-schema)
cat > "${STUB_BIN_G3}/claude" << STUB_EOF
#!/usr/bin/env bash
# Consume stdin (prompt file piped in), emit the known envelope
cat > /dev/null
printf '%s\n' '$STUB_ENVELOPE'
STUB_EOF
chmod +x "${STUB_BIN_G3}/claude"

# Run analyze_project via sourced daemon.
# Key overrides:
#   HOME          = TEST_HOME_G3 (isolates all .arcforge paths)
#   ARCFORGE_ROOT = ARCFORGE_REPO_ROOT (so cli.js path resolves correctly)
#   PATH          = stub bin first (so our stub claude is found)
#   SCRIPT_DIR    = real scripts dir (for observer-prompt.md)
#   OBSERVER_DAEMON_WATCHDOG_SECS = 10 (fast watchdog for test)

G3_RESULT=$(
  HOME="$TEST_HOME_G3"
  ARCFORGE_ROOT="$ARCFORGE_REPO_ROOT"
  PATH="${STUB_BIN_G3}:${PATH}"
  SCRIPT_DIR="$(dirname "$DAEMON_SCRIPT")"
  OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
  OBSERVER_DAEMON_WATCHDOG_SECS=10
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_project "$G3_PROJECT" 2>/dev/null
  echo "EXIT_CODE:$?"
) 2>/dev/null

# Check for queue.jsonl having a candidate
G3_QUEUE="${TEST_HOME_G3}/.arcforge/learning/candidates/queue.jsonl"
G3_QUEUE_COUNT=0
if [ -f "$G3_QUEUE" ]; then
  G3_QUEUE_COUNT=$(grep -c '"event_type":"candidate.created"' "$G3_QUEUE" 2>/dev/null || echo 0)
fi

if [ "$G3_QUEUE_COUNT" -ge 1 ]; then
  echo "  PASS: E2-G3: queue.jsonl has at least one candidate after analysis"
  PASS=$((PASS + 1))
else
  echo "  FAIL: E2-G3: queue.jsonl has no candidates (count: ${G3_QUEUE_COUNT})"
  echo "        G3_RESULT: $G3_RESULT"
  echo "        queue path: $G3_QUEUE"
  FAIL=$((FAIL + 1))
  ERRORS+=('E2-G3: queue.jsonl has at least one candidate after analysis')
fi

# Check that per-project instincts subdir is NOT created with .md files
G3_INSTINCTS_DIR="${TEST_HOME_G3}/.arcforge/instincts/${G3_PROJECT}"
G3_INSTINCT_FILES=0
if [ -d "$G3_INSTINCTS_DIR" ]; then
  G3_INSTINCT_FILES=$(find "$G3_INSTINCTS_DIR" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
fi

assert_eq \
  'E2-G3: no .md instinct files written to per-project instincts dir' \
  '0' \
  "$G3_INSTINCT_FILES"

# Check that manifests were created
G3_BATCHES_DIR="${TEST_HOME_G3}/.arcforge/learning/curator-batches"
G3_BATCH_COUNT=0
if [ -d "$G3_BATCHES_DIR" ]; then
  G3_BATCH_COUNT=$(find "$G3_BATCHES_DIR" -name '*.manifest.json' 2>/dev/null | wc -l | tr -d ' ')
fi

if [ "$G3_BATCH_COUNT" -ge 1 ]; then
  echo "  PASS: E2-G3: curator batch manifest(s) created"
  PASS=$((PASS + 1))
else
  echo "  FAIL: E2-G3: no curator batch manifests found"
  FAIL=$((FAIL + 1))
  ERRORS+=('E2-G3: curator batch manifests created')
fi

# Check that run manifest was created (Layer 4 CuratorRunManifest persistence)
G3_RUNS_DIR="${TEST_HOME_G3}/.arcforge/learning/curator-runs"
G3_RUN_COUNT=0
if [ -d "$G3_RUNS_DIR" ]; then
  G3_RUN_COUNT=$(find "$G3_RUNS_DIR" -name '*.manifest.json' 2>/dev/null | wc -l | tr -d ' ')
fi

if [ "$G3_RUN_COUNT" -ge 1 ]; then
  echo "  PASS: E2-G3: curator run manifest(s) created"
  PASS=$((PASS + 1))
else
  echo "  FAIL: E2-G3: no curator run manifests found"
  FAIL=$((FAIL + 1))
  ERRORS+=('E2-G3: curator run manifests created')
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
