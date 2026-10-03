#!/usr/bin/env bash
# Bash tests for observer-daemon.sh behavior (Slice B)
# Minimal POSIX shell test framework — no external deps.
#
# Usage: bash tests/observer-daemon/run-tests.sh
# Requires: bash 4+ (macOS ships bash 3.2 but uses zsh by default — this
# script is invoked as 'bash run-tests.sh' so homebrew bash is not required)

set -uo pipefail

DAEMON_SCRIPT="$(cd "$(dirname "$0")/../../scripts/lib/learning-curator" && pwd)/observer-daemon.sh"
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

# Whether PID $1 is a live process. kill -0 alone is not enough: an exited
# daemon is disowned, so its parent is PID 1, and a container whose PID 1 does
# not reap leaves it a zombie that kill -0 still finds. Uses the real ps even
# where a test hides it from the daemon.
pid_live() {
  local stat
  kill -0 "$1" 2>/dev/null || return 1
  if stat=$(cat "/proc/$1/stat" 2>/dev/null); then
    stat="${stat##*) }"
  else
    stat=$(ps -o stat= -p "$1" 2>/dev/null) || return 0
  fi
  case "$stat" in
    Z*) return 1 ;;
  esac
  return 0
}

# The daemon analyzes a project only where learning is enabled (learning B-1),
# and only observations recorded at or after the opt-in took effect, so every
# test that expects analysis opts in globally, stamped before its fixture rows.
enable_global_learning() {
  local home="$1"
  mkdir -p "${home}/.arcforge/learning"
  printf '{"scope":"global","enabled":true,"updated_at":"2026-01-01T00:00:00.000Z"}\n' \
    > "${home}/.arcforge/learning/config.json"
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
enable_global_learning "$TEST_HOME_C4"

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
  echo '{"ts":"2026-05-21T01:00:00.000Z","event":"tool_start","tool":"Read"}' >> "${PROJ_DIR}/observations.jsonl"
done

C4_LOG=$(
  HOME="$TEST_HOME_C4"
  PATH="${STUB_BIN}:${PATH}"
  OBSERVER_DAEMON_WATCHDOG_SECS=3
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_project 'test-proj' 2>/dev/null || true
  cat "$LOG_FILE" 2>/dev/null || true
) 2>/dev/null

assert_match \
  'C4: logs timeout/kill message when claude exceeds watchdog' \
  'WATCHDOG|timeout|timed.out|killed' \
  "$C4_LOG"

# Watchdog effectiveness is asserted via DETERMINISTIC signals — the WATCHDOG/timeout
# log line (above) and the parse_status=timeout failure manifest (below) — not
# wall-clock elapsed time. An absolute elapsed-seconds bound is load-sensitive and
# flaky on busy CI/dev machines, so it was removed (audit TEST-3).

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

TMPDIR_PRF=$(mktemp -d)
trap 'rm -rf "$TMPDIR_PRF"' EXIT
TEST_HOME_PRF="${TMPDIR_PRF}/home"
STUB_BIN_PRF="${TMPDIR_PRF}/bin"
mkdir -p "$TEST_HOME_PRF" "$STUB_BIN_PRF"
enable_global_learning "$TEST_HOME_PRF"

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
  PATH="${STUB_BIN_PRF}:${PATH}"
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

# B-9: a failed run's manifest records the tool access of the argv it ran with.
manifest_tool_access() {
  node -e '
    const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(m.invocation && m.invocation.tool_access));
  ' "$1" 2>/dev/null || true
}
assert_eq \
  'B9-T2: timeout failure manifest records tool_access false' \
  'false' \
  "$([ -n "$C4_TIMEOUT_STATUS" ] && manifest_tool_access "$C4_TIMEOUT_STATUS")"
assert_eq \
  'B9-T2: transport_error failure manifest records tool_access false' \
  'false' \
  "$([ -n "$PRF_TRANSPORT_MANIFEST" ] && manifest_tool_access "$PRF_TRANSPORT_MANIFEST")"

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
#   (c) source daemon + invoke analyze_project (curator CLI resolves as a sibling)
#   (d) assert queue.jsonl has one new candidate, instincts dir for the project is empty
# ─────────────────────────────────────────────

echo ""
echo "=== E2-G3: End-to-end integration test ==="

TMPDIR_G3=$(mktemp -d)
trap 'rm -rf "$TMPDIR_G3"' EXIT
TEST_HOME_G3="${TMPDIR_G3}/home"
STUB_BIN_G3="${TMPDIR_G3}/bin"
mkdir -p "$TEST_HOME_G3" "$STUB_BIN_G3"
enable_global_learning "$TEST_HOME_G3"

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
# Let node calls go to real node (the daemon resolves cli.js as its own sibling).

# Slice E.2b: daemon calls claude with `--output-format json --json-schema ...`,
# so the response file is a CLI envelope whose .structured_output holds the payload.
# The stub reads the latest batch manifest to get the real batch_hash and evidence_ids,
# then emits a valid CandidateProposalPayload with ≥2 evidence_refs (MIN_EVIDENCE_REFS=2).
G3_ARGV_FILE="${TMPDIR_G3}/claude-argv.txt"
cat > "${STUB_BIN_G3}/claude" << STUB_EOF
#!/usr/bin/env bash
# Record the argv, one bracketed arg per line, so an empty arg stays visible
printf '<%s>\n' "\$@" > "${G3_ARGV_FILE}"
# Consume stdin (prompt file piped in)
cat > /dev/null
# Find the most recent batch manifest in TEST_HOME_G3
BATCHES_DIR="${TEST_HOME_G3}/.arcforge/learning/curator-batches"
MANIFEST_FILE=\$(ls -t "\${BATCHES_DIR}"/*.manifest.json 2>/dev/null | head -1)
if [ -z "\$MANIFEST_FILE" ]; then
  # Fallback: emit empty proposals (ingestor will write empty parse_status)
  printf '{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"result":"stub","structured_output":{"schema_version":1,"source":{"layer":4,"curator":"llm","run_id":"stub_run","created_at":"2026-05-21T03:00:00.000Z","prompt_policy_version":"v1","output_schema_version":1},"proposals":[]}}\n'
  exit 0
fi
# Extract batch_id, batch_hash, and first 2 evidence_ids from manifest via node
node -e "
  const m = JSON.parse(require('fs').readFileSync('\${MANIFEST_FILE}','utf8'));
  const ids = (m.evidence_ids || []).slice(0,2);
  const typeById = m.evidence_type_by_id || {};
  const refs = ids.map((id,i) => ({
    evidence_id: id,
    evidence_type: typeById[id] || 'observation',
    relevance: 'E2 test evidence ref ' + i
  }));
  const payload = {
    schema_version: 1,
    source: {
      layer: 4, curator: 'llm',
      run_id: 'curator_run_e2_stub_00000000',
      created_at: '2026-05-21T03:00:00.000Z',
      batch_id: m.batch_id,
      batch_hash: m.batch_hash,
      prompt_policy_version: 'v1',
      output_schema_version: 1
    },
    proposals: refs.length >= 2 ? [{
      proposal_index: 0,
      artifact_type: 'instinct',
      proposed_scope: { kind: 'project', project_id: m.scope && m.scope.project_id || 'proj_abc123456789ab' },
      name: 'e2-test-instinct',
      summary: 'Test instinct from E2 stub',
      rationale: 'Observed in E2 test fixture',
      domain: 'workflow',
      body: 'When in E2 test, always write tests first.',
      body_source: 'llm_curator',
      evidence_refs: refs,
      llm_confidence: 'medium',
      risk_notes: [],
      uncertainty_notes: [],
      recommended_review_action: 'review'
    }] : []
  };
  const envelope = {
    type: 'result', subtype: 'success', is_error: false,
    api_error_status: null, duration_ms: 100,
    result: 'stub success', structured_output: payload
  };
  process.stdout.write(JSON.stringify(envelope) + '\n');
"
STUB_EOF
chmod +x "${STUB_BIN_G3}/claude"

# Run analyze_project via sourced daemon.
# Key overrides:
#   HOME          = TEST_HOME_G3 (isolates all .arcforge paths)
#   PATH          = stub bin first (so our stub claude is found)
#   OBSERVER_DAEMON_WATCHDOG_SECS = 10 (fast watchdog for test)

G3_RESULT=$(
  HOME="$TEST_HOME_G3"
  PATH="${STUB_BIN_G3}:${PATH}"
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
# B9-T1: the curator run is tool-less, and its manifest says so
# learning B-9 / D-023: the argv carries `--tools ""` plus a strict, empty MCP
# config, and the run manifest's tool_access is derived from that argv.
# Reuses the E2-G3 run above, whose stub recorded the argv it was given.
# ─────────────────────────────────────────────

echo ""
echo "=== B9-T1: Curator run is tool-less ==="

G3_ARGV=$(cat "$G3_ARGV_FILE" 2>/dev/null || true)
G3_TOOLS_VALUE=$(printf '%s\n' "$G3_ARGV" | grep -A1 -x '<--tools>' | sed -n 2p)
assert_eq \
  'B9-T1: claude argv carries --tools with an empty value' \
  '<>' \
  "$G3_TOOLS_VALUE"
assert_match \
  'B9-T1: claude argv carries --strict-mcp-config' \
  '^<--strict-mcp-config>$' \
  "$G3_ARGV"

G3_TOOL_ACCESS=""
G3_RUN_MANIFEST=$(find "$G3_RUNS_DIR" -name '*.manifest.json' 2>/dev/null | head -1 || true)
if [ -n "$G3_RUN_MANIFEST" ]; then
  G3_TOOL_ACCESS=$(node -e '
    const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(m.invocation && m.invocation.tool_access));
  ' "$G3_RUN_MANIFEST" 2>/dev/null || true)
fi
assert_eq \
  'B9-T1: run manifest records tool_access false, derived from the argv' \
  'false' \
  "$G3_TOOL_ACCESS"

# ─────────────────────────────────────────────
# B1-T1: a project learning is not enabled for is never analyzed
# learning B-1 / D-023: observations left behind by an earlier opt-in must not
# reach the model. The stub claude leaves a marker if it is ever invoked.
# B1-T2 is the positive control: the same setup under a project-scope opt-in,
# found through the project root SessionStart records, does reach the model.
# ─────────────────────────────────────────────

echo ""
echo "=== B1-T1: Disabled project is skipped ==="

TMPDIR_B1=$(mktemp -d)
trap 'rm -rf "$TMPDIR_G3" "$TMPDIR_B1"' EXIT
STUB_BIN_B1="${TMPDIR_B1}/bin"
mkdir -p "$STUB_BIN_B1"
cat > "${STUB_BIN_B1}/claude" << STUB_EOF
#!/usr/bin/env bash
cat > "\${CLAUDE_MARKER}.prompt"
touch "\${CLAUDE_MARKER}"
exit 1
STUB_EOF
chmod +x "${STUB_BIN_B1}/claude"

seed_b1_home() {
  local home="$1"
  local obs_dir="${home}/.arcforge/observations/b1-proj"
  mkdir -p "$obs_dir"
  for i in $(seq 1 15); do
    printf '{"ts":"2026-05-22T01:%02d:00.000Z","event":"tool_start","tool":"Read","session":"s1","project":"b1-proj","project_id":"proj_abc123456789ab","evidence_status":"present","input_summary":"file %d"}\n' \
      "$i" "$i" >> "${obs_dir}/observations.jsonl"
  done
}

run_b1_analysis() {
  local home="$1"
  (
    HOME="$home"
    PATH="${STUB_BIN_B1}:${PATH}"
    CLAUDE_MARKER="${home}/claude-was-called"
    export CLAUDE_MARKER
    OBSERVER_DAEMON_WATCHDOG_SECS=10
    set +e
    # shellcheck source=/dev/null
    source "$DAEMON_SCRIPT" 2>/dev/null
    mkdir -p "$INSTINCTS_DIR"
    analyze_project 'b1-proj' 2>/dev/null || true
    cat "$LOG_FILE" 2>/dev/null || true
  ) 2>/dev/null
}

B1_OFF_HOME="${TMPDIR_B1}/off"
seed_b1_home "$B1_OFF_HOME"
# An earlier opt-in that was since turned off: the project root is on record,
# its project-scope config now says disabled.
mkdir -p "${B1_OFF_HOME}/b1-proj/.arcforge/learning" "${B1_OFF_HOME}/.arcforge/learning/project-roots"
printf '{"scope":"project","enabled":false}\n' > "${B1_OFF_HOME}/b1-proj/.arcforge/learning/config.json"
printf '{"project":"b1-proj","project_root":"%s"}\n' "${B1_OFF_HOME}/b1-proj" \
  > "${B1_OFF_HOME}/.arcforge/learning/project-roots/b1-proj.json"
B1_OFF_LOG=$(run_b1_analysis "$B1_OFF_HOME")

assert_match \
  'B1-T1: logs that learning is not enabled for the project' \
  'Skipping b1-proj: learning is not enabled' \
  "$B1_OFF_LOG"
assert_eq \
  'B1-T1: claude is never invoked for a disabled project' \
  'no' \
  "$([ -f "${B1_OFF_HOME}/claude-was-called" ] && echo yes || echo no)"
assert_eq \
  'B1-T1: no curator batch is assembled for a disabled project' \
  '0' \
  "$(find "${B1_OFF_HOME}/.arcforge/learning/curator-batches" -name '*.manifest.json' 2>/dev/null | wc -l | tr -d ' ')"

B1_ON_HOME="${TMPDIR_B1}/on"
seed_b1_home "$B1_ON_HOME"
mkdir -p "${B1_ON_HOME}/b1-proj/.arcforge/learning" "${B1_ON_HOME}/.arcforge/learning/project-roots"
printf '{"scope":"project","enabled":true,"updated_at":"2026-01-01T00:00:00.000Z"}\n' \
  > "${B1_ON_HOME}/b1-proj/.arcforge/learning/config.json"
printf '{"project":"b1-proj","project_root":"%s"}\n' "${B1_ON_HOME}/b1-proj" \
  > "${B1_ON_HOME}/.arcforge/learning/project-roots/b1-proj.json"
run_b1_analysis "$B1_ON_HOME" > /dev/null

assert_eq \
  'B1-T2: claude is invoked for a project under its project-scope opt-in' \
  'yes' \
  "$([ -f "${B1_ON_HOME}/claude-was-called" ] && echo yes || echo no)"

# B1-T3: disable, then enable again, then run. Observations recorded under the
# first opt-in are older than the re-enable's stamp, so they are never
# submitted — by their own timestamps, not by moving the file.
REPO_CLI="$(cd "$(dirname "$0")/../.." && pwd)/scripts/cli.js"
B1_RE_HOME="${TMPDIR_B1}/re"
B1_RE_ROOT="${B1_RE_HOME}/b1-proj"
mkdir -p "$B1_RE_ROOT" "${B1_RE_HOME}/.arcforge/learning/project-roots"
printf '{"project":"b1-proj","project_root":"%s"}\n' "$B1_RE_ROOT" \
  > "${B1_RE_HOME}/.arcforge/learning/project-roots/b1-proj.json"
b1_learn() {
  env -u ARCFORGE_HOME HOME="$B1_RE_HOME" CLAUDE_PROJECT_DIR="$B1_RE_ROOT" \
    node "$REPO_CLI" learn "$1" --project > /dev/null 2>&1
}
b1_rows() {
  local label="$1" count="$2" obs_dir="${B1_RE_HOME}/.arcforge/observations/b1-proj" ts
  mkdir -p "$obs_dir"
  for i in $(seq 1 "$count"); do
    ts=$(node -e 'process.stdout.write(new Date().toISOString())')
    printf '{"ts":"%s","event":"tool_start","tool":"Bash","session":"s1","project":"b1-proj","project_id":"proj_abc123456789ab","evidence_status":"present","input":"%s row %d"}\n' \
      "$ts" "$label" "$i" >> "${obs_dir}/observations.jsonl"
  done
}

b1_diary() {
  local label="$1" day dir
  day=$(node -e 'process.stdout.write(new Date().toISOString().slice(0, 10))')
  dir="${B1_RE_HOME}/.arcforge/diaries/b1-proj/${day}"
  mkdir -p "$dir"
  printf '# Session Summary\n\n%s diary entry\n' "$label" > "${dir}/diary-${label}.md"
}

b1_learn enable
b1_rows pre-disable 15
b1_diary pre-disable
sleep 1
b1_learn disable
sleep 1
b1_learn enable
sleep 1
B1_RE_LOG=$(run_b1_analysis "$B1_RE_HOME")

assert_eq \
  'B1-T3: after disable then enable, the earlier backlog alone is not submitted' \
  'no' \
  "$([ -f "${B1_RE_HOME}/claude-was-called" ] && echo yes || echo no)"
assert_match \
  'B1-T3: logs that too few observations were recorded since the re-enable' \
  'fewer than 10 observations recorded since learning was enabled' \
  "$B1_RE_LOG"
assert_eq \
  'B1-T3: the earlier observations stay on disk' \
  '15' \
  "$(wc -l < "${B1_RE_HOME}/.arcforge/observations/b1-proj/observations.jsonl" | tr -d ' ')"

b1_rows post-enable 12
b1_diary post-enable
run_b1_analysis "$B1_RE_HOME" > /dev/null
B1_RE_PROMPT=$(cat "${B1_RE_HOME}/claude-was-called.prompt" 2>/dev/null || true)

assert_match \
  'B1-T3: rows recorded after the re-enable are submitted' \
  'post-enable row 12' \
  "$B1_RE_PROMPT"
assert_not_match \
  'B1-T3: rows recorded before the opt-out are not submitted' \
  'pre-disable row' \
  "$B1_RE_PROMPT"
assert_match \
  'B1-T3: a diary written after the re-enable is submitted' \
  'post-enable diary entry' \
  "$B1_RE_PROMPT"
assert_not_match \
  'B1-T3: a diary written before the opt-out is not submitted' \
  'pre-disable diary entry' \
  "$B1_RE_PROMPT"
assert_eq \
  'B1-T3: the earlier diary stays on disk' \
  '1' \
  "$(find "${B1_RE_HOME}/.arcforge/diaries/b1-proj" -name 'diary-pre-disable.md' | wc -l | tr -d ' ')"

# ─────────────────────────────────────────────
# B1-T4: consent is re-checked immediately before every model attempt
# learning B-1: a `learn disable` after the batch is assembled but before
# claude is spawned is honoured — nothing is submitted, and the run's failure
# manifest records transport_status "cancelled". A `node` wrapper on PATH turns
# learning off right after assemble-batch returns.
# ─────────────────────────────────────────────

echo ""
echo "=== B1-T4: Consent re-checked before the model call ==="

TMPDIR_B4=$(mktemp -d)
trap 'rm -rf "$TMPDIR_G3" "$TMPDIR_B1" "$TMPDIR_B4"' EXIT
B4_HOME="${TMPDIR_B4}/home"
B4_BIN="${TMPDIR_B4}/bin"
mkdir -p "$B4_BIN"
enable_global_learning "$B4_HOME"
REAL_NODE="$(command -v node)"
cat > "${B4_BIN}/node" << STUB_EOF
#!/usr/bin/env bash
"${REAL_NODE}" "\$@"
status=\$?
if [ "\$2" = "assemble-batch" ]; then
  printf '{"scope":"global","enabled":false,"updated_at":"2026-06-01T00:00:00.000Z"}\n' \
    > "${B4_HOME}/.arcforge/learning/config.json"
fi
exit \$status
STUB_EOF
chmod +x "${B4_BIN}/node"
cat > "${B4_BIN}/claude" << STUB_EOF
#!/usr/bin/env bash
cat > /dev/null
touch "${TMPDIR_B4}/claude-was-called"
exit 1
STUB_EOF
chmod +x "${B4_BIN}/claude"
B4_OBS="${B4_HOME}/.arcforge/observations/b4-proj"
mkdir -p "$B4_OBS"
for i in $(seq 1 15); do
  printf '{"ts":"2026-05-22T01:%02d:00.000Z","event":"tool_start","tool":"Read","session":"s1","project":"b4-proj","project_id":"proj_abc123456789ab","evidence_status":"present","input":"file %d"}\n' \
    "$i" "$i" >> "${B4_OBS}/observations.jsonl"
done

B4_LOG=$(
  HOME="$B4_HOME"
  PATH="${B4_BIN}:${PATH}"
  OBSERVER_DAEMON_WATCHDOG_SECS=10
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_project 'b4-proj' 2>/dev/null || true
  cat "$LOG_FILE" 2>/dev/null || true
) 2>/dev/null

assert_eq \
  'B1-T4: claude is not invoked after learning is turned off mid-run' \
  'no' \
  "$([ -f "${TMPDIR_B4}/claude-was-called" ] && echo yes || echo no)"
assert_match \
  'B1-T4: logs the withdrawn consent' \
  'learning was turned off before the batch was submitted' \
  "$B4_LOG"
B4_CANCELLED=$(find "${B4_HOME}/.arcforge/learning/curator-runs" -name '*.manifest.json' \
  -exec grep -l '"transport_status": *"cancelled"' {} \; 2>/dev/null | head -1 || true)
assert_eq \
  'B1-T4: the failure manifest records transport_status cancelled' \
  'yes' \
  "$([ -n "$B4_CANCELLED" ] && echo yes || echo no)"

# ─────────────────────────────────────────────
# B1-T5: a disable and re-enable between assembly and the model call
# The batch was rendered under the old opt-in stamp, so it may carry evidence
# from the earlier period: the recheck compares stamps, and a changed stamp
# withdraws the run just like a disable. The wrapper rewrites the config with
# learning still on but a new updated_at — what disable-then-enable leaves.
# ─────────────────────────────────────────────

echo ""
echo "=== B1-T5: Re-enable between assembly and the model call ==="

TMPDIR_B5=$(mktemp -d)
trap 'rm -rf "$TMPDIR_G3" "$TMPDIR_B1" "$TMPDIR_B4" "$TMPDIR_B5"' EXIT
B5_HOME="${TMPDIR_B5}/home"
B5_BIN="${TMPDIR_B5}/bin"
mkdir -p "$B5_BIN"
enable_global_learning "$B5_HOME"
cat > "${B5_BIN}/node" << STUB_EOF
#!/usr/bin/env bash
"${REAL_NODE}" "\$@"
status=\$?
if [ "\$2" = "assemble-batch" ]; then
  printf '{"scope":"global","enabled":true,"updated_at":"2026-06-02T00:00:00.000Z"}\n' \
    > "${B5_HOME}/.arcforge/learning/config.json"
fi
exit \$status
STUB_EOF
chmod +x "${B5_BIN}/node"
cat > "${B5_BIN}/claude" << STUB_EOF
#!/usr/bin/env bash
cat > /dev/null
touch "${TMPDIR_B5}/claude-was-called"
exit 1
STUB_EOF
chmod +x "${B5_BIN}/claude"
B5_OBS="${B5_HOME}/.arcforge/observations/b5-proj"
mkdir -p "$B5_OBS"
for i in $(seq 1 15); do
  printf '{"ts":"2026-05-22T01:%02d:00.000Z","event":"tool_start","tool":"Read","session":"s1","project":"b5-proj","project_id":"proj_abc123456789ab","evidence_status":"present","input":"file %d"}\n' \
    "$i" "$i" >> "${B5_OBS}/observations.jsonl"
done

B5_LOG=$(
  HOME="$B5_HOME"
  PATH="${B5_BIN}:${PATH}"
  OBSERVER_DAEMON_WATCHDOG_SECS=10
  set +e
  # shellcheck source=/dev/null
  source "$DAEMON_SCRIPT" 2>/dev/null
  mkdir -p "$INSTINCTS_DIR"
  analyze_project 'b5-proj' 2>/dev/null || true
  cat "$LOG_FILE" 2>/dev/null || true
) 2>/dev/null

assert_eq \
  'B1-T5: claude is not invoked after a disable and re-enable mid-run' \
  'no' \
  "$([ -f "${TMPDIR_B5}/claude-was-called" ] && echo yes || echo no)"
assert_match \
  'B1-T5: logs that the opt-in changed since the batch was assembled' \
  'opt-in changed since the batch was assembled' \
  "$B5_LOG"
B5_CANCELLED=$(find "${B5_HOME}/.arcforge/learning/curator-runs" -name '*.manifest.json' \
  -exec grep -l '"transport_status": *"cancelled"' {} \; 2>/dev/null | head -1 || true)
assert_eq \
  'B1-T5: the failure manifest records transport_status cancelled' \
  'yes' \
  "$([ -n "$B5_CANCELLED" ] && echo yes || echo no)"

# ─────────────────────────────────────────────
# UP-T1: start replaces a daemon started from another copy of the script
# ─────────────────────────────────────────────
# After a plugin upgrade the previous version's daemon can hold the singleton
# lock for up to MAX_AGE, running that version's code. `start` must replace a
# daemon whose lock names a different script directory — or none, as every
# lock written before the lock recorded it does — and leave its own alone.
# daemon_loop is stubbed so no real analysis loop starts.

echo ""
echo "=== UP-T1: start replaces a daemon from another plugin version ==="

TMPDIR_UP=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UP"' EXIT

# A stand-in for a daemon from another plugin copy: its command line names an
# observer-daemon.sh, which is what the takeover checks before it signals.
UP_OLD_DIR="${TMPDIR_UP}/old-copy"
mkdir -p "$UP_OLD_DIR"
cat > "${UP_OLD_DIR}/observer-daemon.sh" <<'STANDIN'
trap 'kill $! 2>/dev/null; exit 0' TERM
sleep 30 &
wait
STANDIN

# Runs `cmd_start` against a lock held by a live process. $1 is what the lock's
# script file says (empty = no file); $3 is the holder: `daemon` (the stand-in
# above) or `other` (a plain sleep that merely reuses the PID). Prints:
# old-alive|replaced-or-kept|script.
up_start_against() {
  local home="${TMPDIR_UP}/$2"
  local lock="${home}/.arcforge/instincts/.observer.lock"
  mkdir -p "$lock"
  if [ "$3" = daemon ]; then
    bash "${UP_OLD_DIR}/observer-daemon.sh" &
  else
    sleep 30 &
  fi
  local old=$!
  echo "$old" > "${lock}/pid"
  [ -n "$1" ] && echo "$1" > "${lock}/script"
  (
    # shellcheck disable=SC1090
    env -u ARCFORGE_HOME HOME="$home" bash -c '
      source "$1"
      daemon_loop() { exec sleep 30; }
      cmd_start > /dev/null
    ' _ "$DAEMON_SCRIPT"
  )
  local alive=no
  pid_live "$old" && alive=yes
  local new script
  new=$(cat "${lock}/pid" 2>/dev/null || true)
  script=$(cat "${lock}/script" 2>/dev/null || true)
  kill "$old" "$new" 2>/dev/null || true
  echo "${alive}|$([ "$new" != "$old" ] && echo replaced || echo kept)|${script}"
}

DAEMON_DIR="$(dirname "$DAEMON_SCRIPT")"
UP_LEGACY=$(up_start_against '' legacy daemon)
assert_eq \
  'UP-T1: a live daemon whose lock records no script (pre-check daemon) is replaced' \
  "no|replaced|${DAEMON_DIR}" \
  "$UP_LEGACY"
UP_OTHER=$(up_start_against "$UP_OLD_DIR" other daemon)
assert_eq \
  'UP-T1: a live daemon whose lock names another script directory is replaced' \
  "no|replaced|${DAEMON_DIR}" \
  "$UP_OTHER"
UP_SAME=$(up_start_against "$DAEMON_DIR" same daemon)
assert_eq \
  'UP-T1: a live daemon whose lock names this script directory is left running' \
  "yes|kept|${DAEMON_DIR}" \
  "$UP_SAME"

# A daemon that died without removing its lock leaves a PID the OS can hand to
# an unrelated process. That process is never signaled: the lock is stale and
# is reclaimed around it, whether or not the lock records a script.
UP_REUSED_LEGACY=$(up_start_against '' reused-legacy other)
assert_eq \
  'UP-T1: a legacy lock whose PID is a non-daemon process is reclaimed, process untouched' \
  "yes|replaced|${DAEMON_DIR}" \
  "$UP_REUSED_LEGACY"
UP_REUSED_SAME=$(up_start_against "$DAEMON_DIR" reused-same other)
assert_eq \
  'UP-T1: a current lock whose PID is a non-daemon process is reclaimed, process untouched' \
  "yes|replaced|${DAEMON_DIR}" \
  "$UP_REUSED_SAME"

# `stop` must not signal a non-daemon process holding a stale lock's PID.
UP_STOP_LOCK="${TMPDIR_UP}/stop/.arcforge/instincts/.observer.lock"
mkdir -p "$UP_STOP_LOCK"
sleep 30 &
UP_STOP_PID=$!
echo "$UP_STOP_PID" > "${UP_STOP_LOCK}/pid"
env -u ARCFORGE_HOME HOME="${TMPDIR_UP}/stop" bash "$DAEMON_SCRIPT" stop > /dev/null 2>&1 || true
UP_STOP_ALIVE=$(pid_live "$UP_STOP_PID" && echo yes || echo no)
UP_STOP_LOCKED=$([ -d "$UP_STOP_LOCK" ] && echo yes || echo no)
kill "$UP_STOP_PID" 2>/dev/null || true
assert_eq \
  'UP-T1: stop leaves a non-daemon process alive and clears the stale lock' \
  'yes|no' \
  "${UP_STOP_ALIVE}|${UP_STOP_LOCKED}"

# ─────────────────────────────────────────────
# LR-T1: concurrent starts leave exactly one daemon
# ─────────────────────────────────────────────
# The observe hook can spawn `start` from several tool calls at once, and every
# one of them may find the same stale lock. However many race, one becomes the
# daemon. daemon_loop is stubbed: it records its own PID and idles, keeping this
# script on its command line so the other starts see a live daemon.

echo ""
echo "=== LR-T1: concurrent starts leave exactly one daemon ==="

TMPDIR_LR=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UP" "$TMPDIR_LR"' EXIT
LR_ROUNDS=5
LR_STARTS=30

lr_start() {
  env -u ARCFORGE_HOME HOME="$1" bash -c '
    source "$1"
    daemon_loop() {
      touch "${HOME}/daemon.$(exec sh -c "echo \$PPID")"
      while :; do sleep 1; done
    }
    cmd_start
  ' _ "$DAEMON_SCRIPT" > /dev/null 2>&1  # no daemon may hold the runner's output pipe
}

# Prints the PIDs of the live daemons recorded under home $1.
lr_daemons() {
  local marker
  for marker in "$1"/daemon.*; do
    [ -e "$marker" ] || continue
    pid_live "${marker##*.}" && echo "${marker##*.}"
  done
}

# Waits up to 5 s for a first daemon under home $1, then lets stragglers settle.
lr_settle() {
  local i
  for i in $(seq 50); do
    [ -n "$(lr_daemons "$1")" ] && break
    sleep 0.1
  done
  sleep 0.5
}

lr_reap() {
  # shellcheck disable=SC2046
  kill $(lr_daemons "$1") 2>/dev/null || true
}

# A lock left behind by a daemon that died: its PID is of an exited process.
lr_stale_lock() {
  local lock="$1/.arcforge/instincts/.observer.lock"
  mkdir -p "$lock"
  true &
  local dead=$!
  wait "$dead"
  echo "$dead" > "${lock}/pid"
  echo "$dead"
}

# Runs LR_STARTS concurrent starts per round; prints each round's daemon count.
lr_race() {
  local mode="$1" round home i counts=""
  for round in $(seq "$LR_ROUNDS"); do
    home="${TMPDIR_LR}/${mode}-${round}"
    mkdir -p "${home}/.arcforge/instincts"
    [ "$mode" = stale ] && lr_stale_lock "$home" > /dev/null
    for i in $(seq "$LR_STARTS"); do lr_start "$home" & done
    wait
    lr_settle "$home"
    counts="${counts}$(lr_daemons "$home" | grep -c .) "
    lr_reap "$home"
  done
  echo "$counts"
}

LR_ONE=$(printf '1 %.0s' $(seq "$LR_ROUNDS"))
assert_eq \
  "LR-T1: ${LR_STARTS} concurrent starts against a stale lock leave one daemon, every round" \
  "$LR_ONE" \
  "$(lr_race stale)"
assert_eq \
  "LR-T1: ${LR_STARTS} concurrent starts with no lock leave one daemon, every round" \
  "$LR_ONE" \
  "$(lr_race clean)"

# A start that died mid-reclaim leaves its reservation behind. While it is fresh
# it holds the reclaim (that start may still be finishing); once older than the
# claim window it is abandoned, and the next start reclaims the lock.
LR_HOLD="${TMPDIR_LR}/reservation-fresh"
LR_HOLD_PID=$(lr_stale_lock "$LR_HOLD")
mkdir "${LR_HOLD}/.arcforge/instincts/.observer.lock.reclaim.${LR_HOLD_PID}"
lr_start "$LR_HOLD"
sleep 0.5
assert_eq \
  'LR-T1: a fresh reclaim reservation makes start back off, lock untouched' \
  "0|${LR_HOLD_PID}" \
  "$(lr_daemons "$LR_HOLD" | grep -c .)|$(cat "${LR_HOLD}/.arcforge/instincts/.observer.lock/pid")"
lr_reap "$LR_HOLD"

LR_DEAD="${TMPDIR_LR}/reservation-abandoned"
LR_DEAD_PID=$(lr_stale_lock "$LR_DEAD")
mkdir "${LR_DEAD}/.arcforge/instincts/.observer.lock.reclaim.${LR_DEAD_PID}"
touch -t 200001010000 "${LR_DEAD}/.arcforge/instincts/.observer.lock.reclaim.${LR_DEAD_PID}"
lr_start "$LR_DEAD"
lr_settle "$LR_DEAD"
assert_eq \
  'LR-T1: a reservation abandoned by a dead start expires, and start reclaims the lock' \
  '1' \
  "$(lr_daemons "$LR_DEAD" | grep -c .)"
lr_reap "$LR_DEAD"

# A lock with no PID yet is a start mid-claim; one that stayed that way past the
# claim window is a start that crashed there.
LR_CLAIMING="${TMPDIR_LR}/pidless-fresh"
mkdir -p "${LR_CLAIMING}/.arcforge/instincts/.observer.lock"
lr_start "$LR_CLAIMING"
sleep 0.5
assert_eq \
  'LR-T1: a fresh lock with no PID is left to the start claiming it' \
  "0|yes" \
  "$(lr_daemons "$LR_CLAIMING" | grep -c .)|$([ -d "${LR_CLAIMING}/.arcforge/instincts/.observer.lock" ] && echo yes || echo no)"
lr_reap "$LR_CLAIMING"

LR_CRASHED="${TMPDIR_LR}/pidless-old"
mkdir -p "${LR_CRASHED}/.arcforge/instincts/.observer.lock"
touch -t 200001010000 "${LR_CRASHED}/.arcforge/instincts/.observer.lock"
lr_start "$LR_CRASHED"
lr_settle "$LR_CRASHED"
assert_eq \
  'LR-T1: a lock with no PID older than the claim window is reclaimed' \
  '1' \
  "$(lr_daemons "$LR_CRASHED" | grep -c .)"
lr_reap "$LR_CRASHED"

# A pid file holding anything but a PID counts as no PID: held while the lock
# is fresh, reclaimed once it is old. Its content never names a path — a
# reservation built from `./../../../outside` would land outside instincts/.
LR_JUNK_NAMES='traversal dotdot overlong empty spaced pair'
lr_junk() {
  case "$1" in
    traversal) printf './../../../outside' ;;
    dotdot) printf '../x' ;;
    overlong) printf '1%.0s' $(seq 300) ;;
    empty) printf '' ;;
    spaced) printf ' 4242 \n' ;;
    pair) printf '4242\n4343\n' ;;
  esac
}

# Runs one start against a lock whose pid file holds junk $1, aged $2 (fresh or
# old). Prints daemons|pid file unchanged|anything created outside instincts/.
lr_junk_case() {
  local home="${TMPDIR_LR}/junk-$1-$2"
  local lock="${home}/.arcforge/instincts/.observer.lock"
  mkdir -p "$lock"
  lr_junk "$1" > "${lock}/pid"
  # What an earlier pid file of `.` left behind: with it in place, a reservation
  # named from `./../../../outside` resolves to <home>/outside.
  [ "$1" = traversal ] && mkdir "${home}/.arcforge/instincts/.observer.lock.reclaim.."
  [ "$2" = old ] && touch -t 200001010000 "$lock"
  lr_start "$home"
  if [ "$2" = old ]; then lr_settle "$home"; else sleep 0.3; fi
  local same=no
  [ "$(cat "${lock}/pid" 2>/dev/null)" = "$(lr_junk "$1")" ] && same=yes
  local outside
  outside=$(find "$TMPDIR_LR" -maxdepth 1 -name outside | grep -c .)
  outside=$((outside + $(find "$home" -mindepth 1 -maxdepth 1 ! -name .arcforge ! -name 'daemon.*' | grep -c .)))
  echo "$(lr_daemons "$home" | grep -c .)|${same}|${outside}"
  lr_reap "$home"
}

LR_JUNK_FRESH="" LR_JUNK_FRESH_WANT="" LR_JUNK_OLD="" LR_JUNK_OLD_WANT=""
for name in $LR_JUNK_NAMES; do
  LR_JUNK_FRESH="${LR_JUNK_FRESH}${name}=$(lr_junk_case "$name" fresh) "
  LR_JUNK_FRESH_WANT="${LR_JUNK_FRESH_WANT}${name}=0|yes|0 "
  LR_JUNK_OLD="${LR_JUNK_OLD}${name}=$(lr_junk_case "$name" old | cut -d'|' -f1,3) "
  LR_JUNK_OLD_WANT="${LR_JUNK_OLD_WANT}${name}=1|0 "
done
assert_eq \
  'LR-T1: a fresh lock whose pid file is not a PID is held, untouched, nothing made outside' \
  "$LR_JUNK_FRESH_WANT" \
  "$LR_JUNK_FRESH"
assert_eq \
  'LR-T1: an old lock whose pid file is not a PID is reclaimed, nothing made outside' \
  "$LR_JUNK_OLD_WANT" \
  "$LR_JUNK_OLD"

# A reservation or PID-less lock dated in the future was stamped before the
# clock went back. Fresh-looking forever, it would hold for the size of the
# jump; past the skew allowance it counts as abandoned.
LR_FUTURE_RES="${TMPDIR_LR}/future-reservation"
LR_FUTURE_RES_PID=$(lr_stale_lock "$LR_FUTURE_RES")
mkdir "${LR_FUTURE_RES}/.arcforge/instincts/.observer.lock.reclaim.${LR_FUTURE_RES_PID}"
touch -t 203001010000 "${LR_FUTURE_RES}/.arcforge/instincts/.observer.lock.reclaim.${LR_FUTURE_RES_PID}"
lr_start "$LR_FUTURE_RES"
lr_settle "$LR_FUTURE_RES"
assert_eq \
  'LR-T1: a future-dated reclaim reservation counts as abandoned' \
  '1' \
  "$(lr_daemons "$LR_FUTURE_RES" | grep -c .)"
lr_reap "$LR_FUTURE_RES"

LR_FUTURE_LOCK="${TMPDIR_LR}/future-pidless"
mkdir -p "${LR_FUTURE_LOCK}/.arcforge/instincts/.observer.lock"
touch -t 203001010000 "${LR_FUTURE_LOCK}/.arcforge/instincts/.observer.lock"
lr_start "$LR_FUTURE_LOCK"
lr_settle "$LR_FUTURE_LOCK"
assert_eq \
  'LR-T1: a future-dated lock with no PID is reclaimed' \
  '1' \
  "$(lr_daemons "$LR_FUTURE_LOCK" | grep -c .)"
lr_reap "$LR_FUTURE_LOCK"

# Interrupted reclaims leave a moved-aside lock (.stale.<reclaimer PID>) and a
# reservation behind. A later start removes the moved lock once its reclaimer
# is gone and the reservation once expired, and keeps a live reclaimer's.
LR_LITTER="${TMPDIR_LR}/leftovers"
LR_LITTER_DIR="${LR_LITTER}/.arcforge/instincts"
mkdir -p "$LR_LITTER_DIR"
true &
LR_LITTER_GONE=$!
wait "$LR_LITTER_GONE"
mkdir "${LR_LITTER_DIR}/.observer.lock.stale.${LR_LITTER_GONE}"
mkdir "${LR_LITTER_DIR}/.observer.lock.stale.$$"
mkdir "${LR_LITTER_DIR}/.observer.lock.reclaim.4242"
touch -t 200001010000 "${LR_LITTER_DIR}/.observer.lock.reclaim.4242"
lr_start "$LR_LITTER"
lr_settle "$LR_LITTER"
assert_eq \
  'LR-T1: a later start clears a dead reclaimer'"'"'s moved lock and an expired reservation' \
  "1|no|yes|no" \
  "$(lr_daemons "$LR_LITTER" | grep -c .)|$([ -d "${LR_LITTER_DIR}/.observer.lock.stale.${LR_LITTER_GONE}" ] && echo yes || echo no)|$([ -d "${LR_LITTER_DIR}/.observer.lock.stale.$$" ] && echo yes || echo no)|$([ -d "${LR_LITTER_DIR}/.observer.lock.reclaim.4242" ] && echo yes || echo no)"
lr_reap "$LR_LITTER"

# ─────────────────────────────────────────────
# NP-T1: without a usable ps, a live holder is never reclaimed (#247)
# ─────────────────────────────────────────────
# On a host with no ps, or a ps that rejects -p, the daemon cannot tell a live
# daemon from a reused PID. A process that is alive is then treated as holding
# the lock: no second daemon, no signal, no removal. A dead PID is still stale.
# The stub ps fails the way busybox's does on -p: no output, non-zero exit.

echo ""
echo "=== NP-T1: no usable ps fails closed ==="

TMPDIR_NP=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UP" "$TMPDIR_LR" "$TMPDIR_NP"' EXIT
NP_STUB="${TMPDIR_NP}/bin"
mkdir -p "$NP_STUB"
printf '#!/bin/sh\nexit 1\n' > "${NP_STUB}/ps"
chmod +x "${NP_STUB}/ps"

# Like lr_start, with the stub ps first on PATH; prints start's own output.
np_start() {
  env -u ARCFORGE_HOME HOME="$1" PATH="${NP_STUB}:${PATH}" bash -c '
    source "$1"
    daemon_loop() {
      touch "${HOME}/daemon.$(exec sh -c "echo \$PPID")"
      while :; do sleep 1; done
    }
    cmd_start
  ' _ "$DAEMON_SCRIPT" 2>&1 | head -1
}

NP_LIVE="${TMPDIR_NP}/live"
mkdir -p "${NP_LIVE}/.arcforge/instincts"
lr_start "$NP_LIVE"
lr_settle "$NP_LIVE"
NP_LIVE_PID=$(lr_daemons "$NP_LIVE")
NP_OUT1=$(np_start "$NP_LIVE")
NP_OUT2=$(np_start "$NP_LIVE")
sleep 0.5
assert_eq \
  'NP-T1: two starts without ps leave the live daemon the only one, lock unchanged' \
  "1|${NP_LIVE_PID}" \
  "$(lr_daemons "$NP_LIVE" | grep -c .)|$(cat "${NP_LIVE}/.arcforge/instincts/.observer.lock/pid")"
assert_match \
  'NP-T1: a start without ps reports the daemon as already running' \
  'already running' \
  "${NP_OUT1} ${NP_OUT2}"
assert_match \
  'NP-T1: the log says why the lock was not reclaimed' \
  'cannot verify' \
  "$(cat "${NP_LIVE}/.arcforge/instincts/observer.log" 2>/dev/null)"

env -u ARCFORGE_HOME HOME="$NP_LIVE" PATH="${NP_STUB}:${PATH}" \
  bash "$DAEMON_SCRIPT" stop > /dev/null 2>&1 || true
sleep 0.3
assert_eq \
  'NP-T1: stop without ps neither signals nor unlocks a live holder it cannot identify' \
  "1|yes" \
  "$(lr_daemons "$NP_LIVE" | grep -c .)|$([ -d "${NP_LIVE}/.arcforge/instincts/.observer.lock" ] && echo yes || echo no)"
lr_reap "$NP_LIVE"

# A live daemon whose lock names another script directory is not replaced
# without ps either: nothing is signaled that cannot be shown to be a daemon.
NP_FOREIGN="${TMPDIR_NP}/foreign"
NP_FOREIGN_LOCK="${NP_FOREIGN}/.arcforge/instincts/.observer.lock"
mkdir -p "$NP_FOREIGN_LOCK"
bash "${UP_OLD_DIR}/observer-daemon.sh" &
NP_FOREIGN_PID=$!
echo "$UP_OLD_DIR" > "${NP_FOREIGN_LOCK}/script"
echo "$NP_FOREIGN_PID" > "${NP_FOREIGN_LOCK}/pid"
np_start "$NP_FOREIGN" > /dev/null
sleep 0.5
assert_eq \
  'NP-T1: without ps a live holder from another copy is neither signaled nor replaced' \
  "yes|${NP_FOREIGN_PID}|0" \
  "$(pid_live "$NP_FOREIGN_PID" && echo yes || echo no)|$(cat "${NP_FOREIGN_LOCK}/pid")|$(lr_daemons "$NP_FOREIGN" | grep -c .)"
kill "$NP_FOREIGN_PID" 2>/dev/null || true

NP_DEAD="${TMPDIR_NP}/dead"
lr_stale_lock "$NP_DEAD" > /dev/null
np_start "$NP_DEAD" > /dev/null
lr_settle "$NP_DEAD"
assert_eq \
  'NP-T1: without ps a lock whose PID is dead is still reclaimed' \
  '1' \
  "$(lr_daemons "$NP_DEAD" | grep -c .)"
lr_reap "$NP_DEAD"

# ─────────────────────────────────────────────
# OW-T1: only the lock's holder removes it; status never mutates (#252)
# ─────────────────────────────────────────────
# stop and status used to remove any lock whose PID was not a live daemon,
# by path: a start mid-claim (no PID yet) lost its lock, and so did a start
# that took the lock between the check and the removal. A daemon's own exit
# removed whatever lock stood at the path, twice on TERM. Each of those lets
# the next start run a second daemon.

echo ""
echo "=== OW-T1: a lock is removed only by its owner ==="

TMPDIR_OW=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UP" "$TMPDIR_LR" "$TMPDIR_NP" "$TMPDIR_OW"' EXIT

ow_cmd() {
  env -u ARCFORGE_HOME HOME="$1" bash "$DAEMON_SCRIPT" "$2" > /dev/null 2>&1 || true
}

OW_CLAIM="${TMPDIR_OW}/pidless"
mkdir -p "${OW_CLAIM}/.arcforge/instincts/.observer.lock"
ow_cmd "$OW_CLAIM" status
OW_AFTER_STATUS=$([ -d "${OW_CLAIM}/.arcforge/instincts/.observer.lock" ] && echo yes || echo no)
ow_cmd "$OW_CLAIM" stop
OW_AFTER_STOP=$([ -d "${OW_CLAIM}/.arcforge/instincts/.observer.lock" ] && echo yes || echo no)
assert_eq \
  'OW-T1: status and stop leave a fresh lock with no PID (a start mid-claim) in place' \
  'yes|yes' \
  "${OW_AFTER_STATUS}|${OW_AFTER_STOP}"

OW_STALE="${TMPDIR_OW}/stale"
OW_STALE_PID=$(lr_stale_lock "$OW_STALE")
ow_cmd "$OW_STALE" status
assert_eq \
  'OW-T1: status leaves even a stale lock in place' \
  "$OW_STALE_PID" \
  "$(cat "${OW_STALE}/.arcforge/instincts/.observer.lock/pid" 2>/dev/null)"
ow_cmd "$OW_STALE" stop
assert_eq \
  'OW-T1: stop still clears a lock whose PID is dead' \
  'no' \
  "$([ -d "${OW_STALE}/.arcforge/instincts/.observer.lock" ] && echo yes || echo no)"

# A real daemon_loop whose lock has since passed to another holder must leave
# that lock alone when it exits, by TERM or by its own timeout.
ow_exit_case() {
  local home="${TMPDIR_OW}/exit-$1"
  local lock="${home}/.arcforge/instincts/.observer.lock"
  mkdir -p "${home}/.arcforge/instincts"
  env -u ARCFORGE_HOME HOME="$home" bash -c '
    source "$1"
    POLL_INTERVAL=1
    [ "$2" = timeout ] && MAX_AGE=2
    cmd_start
  ' _ "$DAEMON_SCRIPT" "$1" > /dev/null 2>&1
  local daemon
  daemon=$(cat "${lock}/pid")
  sleep 0.3
  sleep 30 &
  local other=$!
  rm -rf "$lock"
  mkdir "$lock"
  echo "$other" > "${lock}/pid"
  if [ "$1" = term ]; then kill "$daemon"; fi
  local i
  for i in $(seq 50); do pid_live "$daemon" || break; sleep 0.1; done
  echo "$(pid_live "$daemon" && echo alive || echo exited)|$(cat "${lock}/pid" 2>/dev/null)|${other}"
  kill "$daemon" "$other" 2>/dev/null || true
}

OW_TERM=$(ow_exit_case term)
assert_eq \
  'OW-T1: a daemon stopped by TERM leaves a lock another holder has taken' \
  "exited|${OW_TERM##*|}|${OW_TERM##*|}" \
  "$OW_TERM"
OW_TIMEOUT=$(ow_exit_case timeout)
assert_eq \
  'OW-T1: a daemon exiting on its own leaves a lock another holder has taken' \
  "exited|${OW_TIMEOUT##*|}|${OW_TIMEOUT##*|}" \
  "$OW_TIMEOUT"

# The daemon still removes its own lock when it exits.
OW_OWN="${TMPDIR_OW}/own"
mkdir -p "${OW_OWN}/.arcforge/instincts"
env -u ARCFORGE_HOME HOME="$OW_OWN" bash -c '
  source "$1"; POLL_INTERVAL=1; cmd_start
' _ "$DAEMON_SCRIPT" > /dev/null 2>&1
OW_OWN_PID=$(cat "${OW_OWN}/.arcforge/instincts/.observer.lock/pid")
sleep 0.3
ow_cmd "$OW_OWN" stop
for i in $(seq 50); do pid_live "$OW_OWN_PID" || break; sleep 0.1; done
assert_eq \
  'OW-T1: stop ends a live daemon, and the daemon removes its own lock' \
  'exited|no' \
  "$(pid_live "$OW_OWN_PID" && echo alive || echo exited)|$([ -d "${OW_OWN}/.arcforge/instincts/.observer.lock" ] && echo yes || echo no)"

# Concurrent starts with one stop (or one status) among them: every round ends
# with at most one daemon. Daemons here are the LR-T1 stub (no exit trap), so
# a stopped one leaves a dead PID for the next start to reclaim.
OW_ROUNDS=10
OW_STARTS=40
ow_storm() {
  local cmd="$1" round home i at counts=""
  for round in $(seq "$OW_ROUNDS"); do
    home="${TMPDIR_OW}/storm-${cmd}-${round}"
    mkdir -p "${home}/.arcforge/instincts"
    at=$((RANDOM % OW_STARTS))
    for i in $(seq "$OW_STARTS"); do
      [ "$i" = "$at" ] && { ow_cmd "$home" "$cmd" & }
      lr_start "$home" &
    done
    wait
    lr_settle "$home"
    for i in 1 2 3; do lr_start "$home"; done
    sleep 0.5
    counts="${counts}$([ "$(lr_daemons "$home" | grep -c .)" -le 1 ] && echo ok || echo "$(lr_daemons "$home" | grep -c .)") "
    lr_reap "$home"
  done
  echo "$counts"
}

OW_OK=$(printf 'ok %.0s' $(seq "$OW_ROUNDS"))
assert_eq \
  "OW-T1: ${OW_STARTS} concurrent starts and one stop leave at most one daemon, every round" \
  "$OW_OK" \
  "$(ow_storm stop)"
assert_eq \
  "OW-T1: ${OW_STARTS} concurrent starts and one status leave at most one daemon, every round" \
  "$OW_OK" \
  "$(ow_storm status)"

# ─────────────────────────────────────────────
# ZB-T1: a lock held by a zombie is stale
# ─────────────────────────────────────────────
# A daemon that exited but was never reaped (a container whose PID 1 does not
# reap) is a zombie: kill -0 still succeeds on it. Without ps, a lock it held
# would read as an unverifiable live holder and be kept for as long as the
# zombie stood. Where /proc can say it is a zombie, the lock is stale. Where
# neither /proc nor ps can, the holder is unverifiable and the lock is held.

echo ""
echo "=== ZB-T1: a zombie lock holder is not live ==="

TMPDIR_ZB=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UP" "$TMPDIR_LR" "$TMPDIR_NP" "$TMPDIR_OW" "$TMPDIR_ZB"' EXIT

# A lock under home $1 whose PID is a zombie: the child of a process that
# exec'd into a sleep and so never reaps it. Prints the reaping parent's PID.
zb_zombie_lock() {
  local lock="$1/.arcforge/instincts/.observer.lock"
  mkdir -p "$lock"
  # Not on the caller's $(...) pipe, which would otherwise wait out the sleep.
  bash -c 'sleep 0 & echo $! > "$1"; exec sleep 30' _ "${lock}/pid" > /dev/null 2>&1 &
  local parent=$!
  sleep 0.5
  echo "$parent"
}

ZB_PS="${TMPDIR_ZB}/with-ps"
ZB_PS_PARENT=$(zb_zombie_lock "$ZB_PS")
lr_start "$ZB_PS"
lr_settle "$ZB_PS"
assert_eq \
  'ZB-T1: with ps, a lock whose PID is a zombie is reclaimed' \
  '1' \
  "$(lr_daemons "$ZB_PS" | grep -c .)"
lr_reap "$ZB_PS"
kill "$ZB_PS_PARENT" 2>/dev/null || true

ZB_NOPS="${TMPDIR_ZB}/no-ps"
ZB_NOPS_PARENT=$(zb_zombie_lock "$ZB_NOPS")
np_start "$ZB_NOPS" > /dev/null
lr_settle "$ZB_NOPS"
if [ -r /proc/self/stat ]; then
  assert_eq \
    'ZB-T1: without ps, /proc shows a zombie lock holder, and its lock is reclaimed' \
    '1' \
    "$(lr_daemons "$ZB_NOPS" | grep -c .)"
else
  assert_eq \
    'ZB-T1: without ps or /proc, a zombie lock holder is unverifiable, and its lock is held' \
    '0' \
    "$(lr_daemons "$ZB_NOPS" | grep -c .)"
fi
lr_reap "$ZB_NOPS"
kill "$ZB_NOPS_PARENT" 2>/dev/null || true

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
