#!/usr/bin/env bash
# learning-probe.sh — end-to-end probe for the learning subsystem (v6 P5 AC #1).
#
# Walks the whole chain and asserts each link from the FILESYSTEM, never from an
# agent's self-report:
#
#   observe → daemon → curator → queue → approve → materialize → activate
#           → SessionStart injection
#
# ISOLATION: `ARCFORGE_HOME` alone. That is the point of this script — before the
# v6/P5 home-resolver unification the curator layer read `os.homedir()`/`$HOME`
# directly, so isolating the chain required redirecting HOME, which also broke
# the `claude` CLI's own auth lookup. Every module now resolves through
# `getArcforgeHome()`, so a probe can run against a throwaway tree while `claude`
# still authenticates from the real home. **This script must never set HOME.**
# `tests/scripts/arcforge-home-isolation.test.js` is the regression lock.
#
# COST: step 3 invokes the real LLM curator (`claude --model haiku`) exactly once
# via the daemon's own `analyze_project`. Everything else is local. That cost is
# why this script is deliberately NOT wired into `npm test` — the five runners
# must stay free and offline. Run it by hand at a phase gate.
#
# USAGE:
#   bash tests/e2e/learning-probe.sh [work-dir]
#
# Always run it whole, into a FRESH work dir. Step 3 ends with the daemon's
# `archive_observations`, which MOVES observations.jsonl into archive/ — so
# re-running step 3 against an already-analyzed tree finds nothing to analyze.
#
# Exits non-zero on the first failed assertion. Evidence for every step is left
# under <work-dir>/evidence/ for transcription into
# docs/plans/v6/p5-learning-e2e-evidence.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${1:-$(mktemp -d "${TMPDIR:-/tmp}/arcforge-learning-probe-XXXXXX")}"
PROJECT_DIR="${WORK_DIR}/probe-app"
EVIDENCE_DIR="${WORK_DIR}/evidence"

export ARCFORGE_HOME="${WORK_DIR}/.arcforge"
export CLAUDE_PROJECT_DIR="${PROJECT_DIR}"
PROJECT_NAME="probe-app"

mkdir -p "${PROJECT_DIR}" "${EVIDENCE_DIR}" "${ARCFORGE_HOME}"

CLI="${REPO_ROOT}/scripts/cli.js"
CURATOR_CLI="${REPO_ROOT}/scripts/lib/learning-curator/cli.js"
DAEMON="${REPO_ROOT}/scripts/lib/learning-curator/observer-daemon.sh"

pass() { printf '  PASS: %s\n' "$1"; }
fail() { printf '  FAIL: %s\n' "$1" >&2; exit 1; }
step() { printf '\n=== %s ===\n' "$1"; }

# Guard: refuse to run against the real home. A probe that pollutes the user's
# learning state is worse than no probe.
if [ "${ARCFORGE_HOME}" = "${HOME}/.arcforge" ]; then
  fail "ARCFORGE_HOME resolves to the real home — refusing to run"
fi

step "0. Isolation self-check"
RESOLVED_HOME=$(node -e "console.log(require('${REPO_ROOT}/scripts/lib/utils').getArcforgeHome())")
[ "${RESOLVED_HOME}" = "${ARCFORGE_HOME}" ] || fail "getArcforgeHome() = ${RESOLVED_HOME}"
RESOLVED_QUEUE=$(node -e "
  const l = require('${REPO_ROOT}/scripts/lib/learning');
  console.log(l.getCandidateQueuePath({ scope: 'global' }));
")
case "${RESOLVED_QUEUE}" in
  "${ARCFORGE_HOME}"/*) pass "curator queue resolves inside the probe home" ;;
  *) fail "curator queue escaped isolation: ${RESOLVED_QUEUE}" ;;
esac

step "1. Enable learning (global scope — the daemon reads global config)"
node "${CLI}" learn enable --global --json > "${EVIDENCE_DIR}/01-learn-enable.json"
node "${CLI}" learn status --json > "${EVIDENCE_DIR}/01-learn-status.json"
grep -q '"enabled": true' "${EVIDENCE_DIR}/01-learn-enable.json" \
  || fail "learning was not enabled"
pass "learning enabled in the probe home"

step "2. Observe — drive the PostToolUse hook to produce observations"
# The daemon needs MIN_OBSERVATIONS (10) before it will call the curator. Each
# call is the hook's real entry point reading a real hook payload on stdin.
OBS_HOOK="${REPO_ROOT}/hooks/observe/main.js"
for i in $(seq 1 12); do
  printf '%s' "{
    \"session_id\": \"probe-session\",
    \"hook_event_name\": \"PostToolUse\",
    \"cwd\": \"${PROJECT_DIR}\",
    \"tool_name\": \"Grep\",
    \"tool_input\": {\"pattern\": \"handleRequest\", \"path\": \"src/\"},
    \"tool_response\": {\"matches\": ${i}}
  }" | CLAUDE_SESSION_ID=probe-session node "${OBS_HOOK}" >/dev/null 2>&1 || true
done
OBS_FILE="${ARCFORGE_HOME}/observations/${PROJECT_NAME}/observations.jsonl"
[ -f "${OBS_FILE}" ] || fail "no observations.jsonl at ${OBS_FILE}"
OBS_COUNT=$(wc -l < "${OBS_FILE}" | tr -d ' ')
[ "${OBS_COUNT}" -ge 10 ] || fail "only ${OBS_COUNT} observations (need >= 10)"
cp "${OBS_FILE}" "${EVIDENCE_DIR}/02-observations.jsonl"
pass "${OBS_COUNT} observations captured inside the probe home"

step "3. Daemon → curator → queue (invokes the real Haiku curator once)"
# Source the daemon and call its own analyze_project — same code path the daemon
# runs, without the 5-minute poll loop.
#
# The subshell + `set +e` is the pattern tests/observer-daemon/run-tests.sh uses,
# and it is load-bearing here: analyze_project carries `trap ... RETURN` and bare
# `return`s in its error paths, so under the caller's `set -e` an internal
# `return 1` would abort this script with a confusing message instead of reaching
# the assertion below. Errors are absorbed and the FILESYSTEM is the verdict.
#
# Several of analyze_project's early exits (too few observations, circuit
# breaker, missing prompt file) `return` cleanly after only writing to the
# daemon log — so a zero exit here does NOT mean a candidate was produced. The
# queue assertion below is the real check, which is why it is not `|| true`.
DAEMON_EXIT=$(
  set +e
  # shellcheck source=/dev/null
  source "${DAEMON}" 2>/dev/null
  mkdir -p "${INSTINCTS_DIR}"
  analyze_project "${PROJECT_NAME}"
  echo "EXIT_CODE:$?"
)
printf '%s\n' "${DAEMON_EXIT}" > "${EVIDENCE_DIR}/03-daemon-exit.txt"
cp "${ARCFORGE_HOME}/instincts/observer.log" "${EVIDENCE_DIR}/03-observer.log" 2>/dev/null || true

QUEUE="${ARCFORGE_HOME}/learning/candidates/queue.jsonl"
[ -f "${QUEUE}" ] || fail "curator produced no queue.jsonl (see ${EVIDENCE_DIR}/03-observer.log)"
cp "${QUEUE}" "${EVIDENCE_DIR}/03-queue.jsonl"
cp -R "${ARCFORGE_HOME}/learning/curator-batches" "${EVIDENCE_DIR}/03-curator-batches" 2>/dev/null || true
cp -R "${ARCFORGE_HOME}/learning/curator-runs" "${EVIDENCE_DIR}/03-curator-runs" 2>/dev/null || true

CANDIDATE_ID=$(node -e "
  const { readCurrentCandidates } = require('${REPO_ROOT}/scripts/lib/learning-curator/queue-writer');
  const ids = Object.keys(readCurrentCandidates());
  if (!ids.length) { console.error('no candidates'); process.exit(1); }
  console.log(ids[0]);
") || fail "queue holds no candidate originating from the probe session"
pass "candidate queued: ${CANDIDATE_ID}"

step "4. Approve → materialize → activate (the canonical review gate)"
# handleDashboardAction is the same entry point the dashboard HTTP layer calls;
# driving it directly exercises the real gate without starting a browser.
node -e "
  const { handleDashboardAction } = require('${REPO_ROOT}/scripts/lib/learning-dashboard');
  const id = process.argv[1];
  const out = [];
  for (const [action, expected] of [
    ['approve', 'pending_review'],
    ['materialize', 'approved'],
    ['activate', 'materialized'],
  ]) {
    const res = handleDashboardAction({
      action,
      candidate_id: id,
      expected_current_status: expected,
      safety_ack: true,
    });
    out.push({ action, accepted: res.accepted, reason: res.reason || null });
    if (!res.accepted) {
      console.error(JSON.stringify(out, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify(out, null, 2));
" "${CANDIDATE_ID}" > "${EVIDENCE_DIR}/04-lifecycle.json" \
  || fail "lifecycle transition rejected (see ${EVIDENCE_DIR}/04-lifecycle.json)"
pass "approve → materialize → activate accepted"

DRAFTS_DIR="${ARCFORGE_HOME}/learning/drafts/${CANDIDATE_ID}"
[ -d "${DRAFTS_DIR}" ] || fail "no draft written under ${DRAFTS_DIR}"
find "${DRAFTS_DIR}" -type f > "${EVIDENCE_DIR}/04-draft-files.txt"
pass "draft artifacts written"

ACTIVE_FILE=$(find "${ARCFORGE_HOME}/instincts" -name "${CANDIDATE_ID}.md" -not -path '*/archived/*' | head -1)
[ -n "${ACTIVE_FILE}" ] || fail "no active instinct file for ${CANDIDATE_ID}"
cp "${ACTIVE_FILE}" "${EVIDENCE_DIR}/04-active-instinct.md"
pass "active instinct at ${ACTIVE_FILE}"

step "5. SessionStart injection sees the activated instinct"
INJECT="${REPO_ROOT}/hooks/session-tracker/inject-context.js"
printf '%s' "{
  \"session_id\": \"probe-session-2\",
  \"hook_event_name\": \"SessionStart\",
  \"source\": \"startup\",
  \"cwd\": \"${PROJECT_DIR}\"
}" | node "${INJECT}" > "${EVIDENCE_DIR}/05-sessionstart-output.json" 2>&1 || true

grep -q "${CANDIDATE_ID}" "${EVIDENCE_DIR}/05-sessionstart-output.json" \
  || fail "SessionStart output does not mention ${CANDIDATE_ID} (see ${EVIDENCE_DIR}/05-sessionstart-output.json)"
grep -q "Active Behavioral Instincts" "${EVIDENCE_DIR}/05-sessionstart-output.json" \
  || fail "SessionStart output carries no activated-instinct block"
pass "activated instinct is injected at SessionStart"

step "6. Real home untouched"
# The probe must leave no trace outside its own tree.
for d in learning/candidates instincts observations reflections recalls; do
  if [ -e "${HOME}/.arcforge/${d}" ]; then
    NEWER=$(find "${HOME}/.arcforge/${d}" -newer "${EVIDENCE_DIR}/01-learn-enable.json" -type f 2>/dev/null | head -5)
    [ -z "${NEWER}" ] || fail "probe wrote into the real home: ${NEWER}"
  fi
done
pass "no file under ~/.arcforge was written during the probe"

printf '\n=== PROBE COMPLETE ===\n'
printf 'candidate_id : %s\n' "${CANDIDATE_ID}"
printf 'work dir     : %s\n' "${WORK_DIR}"
printf 'evidence     : %s\n' "${EVIDENCE_DIR}"
printf '\nTranscribe the evidence files into docs/plans/v6/p5-learning-e2e-evidence.md.\n'
