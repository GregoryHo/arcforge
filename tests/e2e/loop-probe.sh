#!/usr/bin/env bash
# loop-probe.sh — end-to-end probe for the unattended loop (v6 P6 AC #2).
#
# Answers one question from the FILESYSTEM, never from an agent's self-report:
# does `arcforge loop` actually drive a D3 task list across fresh sessions,
# update the markers, and stop where it said it would?
#
#   list + --max-runs 1  →  one iteration, T1 [x], status max_runs
#   resume, --max-runs 5 →  T2 [x], nothing runnable, status complete
#
# Two runs, not one, because the two stop conditions are reached by different
# code paths and only one of them can be observed per run: `max_runs` is stamped
# at finalize when `iteration >= maxRuns`, and it OVERWRITES whatever the loop
# body decided — so a single run sized exactly to the task count can never show
# `complete`. Phase A pins the ceiling path, phase B pins the exhausted-list path
# and the resume semantics between them (`iteration` keeps climbing, completed
# tasks are not re-run).
#
# ISOLATION: `CLAUDE_PROJECT_DIR` (the loop's project root, hence where the state
# file and the fixture repo live) plus `ARCFORGE_HOME` (the loop queues a
# `loop-finished` pending action at finalize). **This script must never set HOME**
# — the spawned `claude` sessions authenticate from the real one. Guards below
# refuse to run if either would resolve onto the real tree.
#
# COST: two `claude -p` sessions, one per task, each capped by --task-timeout.
# The fixture tasks are deliberately trivial (write a file with one word in it)
# so the money buys the loop mechanics, not the model's reasoning. That cost is
# why this script is NOT wired into `npm test` — the five runners stay free and
# offline. Run it by hand at a phase gate.
#
# USAGE:
#   bash tests/e2e/loop-probe.sh [work-dir]
#
# Always run it whole, into a FRESH work dir: phase B resumes the state phase A
# left behind, so a re-run against an already-complete tree has nothing to do.
#
# Exits non-zero on the first failed assertion. Evidence for every phase is left
# under <work-dir>/evidence/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${1:-$(mktemp -d "${TMPDIR:-/tmp}/arcforge-loop-probe-XXXXXX")}"
PROJECT_DIR="${WORK_DIR}/probe-app"
EVIDENCE_DIR="${WORK_DIR}/evidence"

export ARCFORGE_HOME="${WORK_DIR}/.arcforge"
export CLAUDE_PROJECT_DIR="${PROJECT_DIR}"

CLI="${REPO_ROOT}/scripts/cli.js"
TASKS="${PROJECT_DIR}/tasks.md"
STATE="${PROJECT_DIR}/.arcforge-loop.json"

# Pre-authorized so the headless sessions never hit a permission prompt: a
# blocked session is silent until --task-timeout kills it and surfaces as a
# timeout, which reads like a loop defect and is not one.
PERMISSION_MODE="acceptEdits"
ALLOWED_TOOLS="Bash,Edit,Write,Read"
TASK_TIMEOUT=180

pass() { printf '  PASS: %s\n' "$1"; }
fail() { printf '  FAIL: %s\n' "$1" >&2; exit 1; }
step() { printf '\n=== %s ===\n' "$1"; }

# Read one field out of the loop state file.
state_field() {
  node -e "
    const s = require('${STATE}');
    const v = s[process.argv[1]];
    console.log(Array.isArray(v) ? v.join(',') : String(v));
  " "$1"
}

# Assert a task line carries the expected marker: task_marker T1 x
task_marker() {
  local id="$1" want="$2"
  grep -qE "^- \[${want}\] ${id} " "${TASKS}" \
    || fail "${id} is not marked [${want}] in the task list: $(grep -E "^- \[.\] ${id} " "${TASKS}" || echo '<no such task>')"
}

step "0. Guards and preflight"
if [ "${ARCFORGE_HOME}" = "${HOME}/.arcforge" ]; then
  fail "ARCFORGE_HOME resolves to the real home — refusing to run"
fi
case "${PROJECT_DIR}" in
  "${REPO_ROOT}"/*|"${REPO_ROOT}")
    fail "project dir is inside the arcforge repo — refusing to loop over the repo itself" ;;
esac
command -v claude >/dev/null 2>&1 || fail "the claude CLI is not on PATH — the loop spawns it per task"
mkdir -p "${PROJECT_DIR}" "${EVIDENCE_DIR}" "${ARCFORGE_HOME}"
# Baseline for the pollution check in step 4. Captured before anything runs so a
# tree that was already dirty does not read as damage this probe caused.
git -C "${REPO_ROOT}" status --porcelain > "${EVIDENCE_DIR}/00-repo-status-before.txt"
pass "isolated: project ${PROJECT_DIR}, ARCFORGE_HOME ${ARCFORGE_HOME}"

step "1. Fixture — a two-task D3 list in a throwaway git repo"
# No package.json ON PURPOSE: with no detectable project type the loop omits the
# "run the suite, then lint, then commit" block from the task prompt, so each
# session does exactly the one thing the task names. The acceptance floor is the
# per-task `verify:` line instead, and it checks CONTENT, not just existence — a
# session that creates an empty file must not be able to pass it.
cat > "${TASKS}" <<'EOF'
# Tasks: loop probe

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked.

- [ ] T1 — Create a file named `alpha.txt` in the project root whose entire contents are the single word `ready`
  - verify: `grep -q ready alpha.txt`
- [ ] T2 — Create a file named `beta.txt` in the project root whose entire contents are the single word `ready`
  - verify: `grep -q ready beta.txt`
EOF

git -C "${PROJECT_DIR}" init -q -b main
git -C "${PROJECT_DIR}" config user.email probe@example.com
git -C "${PROJECT_DIR}" config user.name probe
git -C "${PROJECT_DIR}" add tasks.md
git -C "${PROJECT_DIR}" commit -q -m "chore: loop probe task list"
cp "${TASKS}" "${EVIDENCE_DIR}/01-tasks-initial.md"
pass "fixture list committed with T1 and T2 pending"

step "2. Phase A — --max-runs 1 stops at the ceiling with one task left"
node "${CLI}" loop \
  --tasks "${TASKS}" \
  --max-runs 1 \
  --max-cost 5 \
  --task-timeout "${TASK_TIMEOUT}" \
  --permission-mode "${PERMISSION_MODE}" \
  --allowed-tools "${ALLOWED_TOOLS}" \
  > "${EVIDENCE_DIR}/02-phase-a.log" 2>&1 \
  || fail "phase A exited non-zero (see ${EVIDENCE_DIR}/02-phase-a.log)"

[ -f "${STATE}" ] || fail "no ${STATE} after phase A"
cp "${STATE}" "${EVIDENCE_DIR}/02-state-a.json"
cp "${TASKS}" "${EVIDENCE_DIR}/02-tasks-a.md"

A_ITER=$(state_field iteration)
A_STATUS=$(state_field status)
A_DONE=$(state_field completed_tasks)
A_FINISHED=$(state_field finished_at)

[ "${A_ITER}" = "1" ] || fail "phase A ran ${A_ITER} iterations, expected 1"
[ "${A_STATUS}" = "max_runs" ] || fail "phase A status is '${A_STATUS}', expected max_runs"
[ "${A_DONE}" = "T1" ] || fail "phase A completed_tasks is '${A_DONE}', expected T1"
[ "${A_FINISHED}" != "null" ] || fail "phase A left finished_at null — the run did not finalize"
pass "one iteration, status max_runs, finished_at stamped"

task_marker T1 x
task_marker T2 " "
pass "task list updated in place: T1 [x], T2 still pending"
grep -q ready "${PROJECT_DIR}/alpha.txt" 2>/dev/null \
  || fail "T1's acceptance floor passed but alpha.txt does not carry the expected content"
[ ! -e "${PROJECT_DIR}/beta.txt" ] || fail "beta.txt exists — the loop ran past its --max-runs ceiling"
pass "T1's work landed; T2's did not"

step "3. Phase B — resume, exhaust the list, stop on complete"
# No --reset: this is the resume path. `iteration` must keep climbing from
# phase A rather than restart, and T1 must not be run a second time.
node "${CLI}" loop \
  --tasks "${TASKS}" \
  --max-runs 5 \
  --max-cost 5 \
  --task-timeout "${TASK_TIMEOUT}" \
  --permission-mode "${PERMISSION_MODE}" \
  --allowed-tools "${ALLOWED_TOOLS}" \
  > "${EVIDENCE_DIR}/03-phase-b.log" 2>&1 \
  || fail "phase B exited non-zero (see ${EVIDENCE_DIR}/03-phase-b.log)"

cp "${STATE}" "${EVIDENCE_DIR}/03-state-b.json"
cp "${TASKS}" "${EVIDENCE_DIR}/03-tasks-b.md"

B_ITER=$(state_field iteration)
B_STATUS=$(state_field status)
B_DONE=$(state_field completed_tasks)
B_FAILED=$(state_field failed_tasks)
B_FINISHED=$(state_field finished_at)

[ "${B_ITER}" -ge 2 ] || fail "cumulative iteration is ${B_ITER}, expected >= 2 (the resume did not carry the counter)"
[ "${B_STATUS}" = "complete" ] || fail "phase B status is '${B_STATUS}', expected complete"
[ "${B_FINISHED}" != "null" ] || fail "phase B left finished_at null — the run did not finalize"
[ "${B_DONE}" = "T1,T2" ] || fail "completed_tasks is '${B_DONE}', expected T1,T2 (T1 re-run, or T2 missing)"
[ "${B_FAILED}" = "" ] || fail "failed_tasks is '${B_FAILED}', expected none"
pass "${B_ITER} cumulative iterations, both tasks completed once, status complete"

task_marker T1 x
task_marker T2 x
pass "task list fully checked off"
grep -q ready "${PROJECT_DIR}/beta.txt" 2>/dev/null \
  || fail "T2's acceptance floor passed but beta.txt does not carry the expected content"
pass "T2's work landed"

step "4. Nothing outside the probe tree was touched"
[ ! -e "${REPO_ROOT}/.arcforge-loop.json" ] || fail "the loop wrote state into the arcforge repo root"
git -C "${REPO_ROOT}" status --porcelain > "${EVIDENCE_DIR}/04-repo-status-after.txt"
diff -q "${EVIDENCE_DIR}/00-repo-status-before.txt" "${EVIDENCE_DIR}/04-repo-status-after.txt" >/dev/null \
  || fail "the arcforge repo working tree changed during the probe (see ${EVIDENCE_DIR}/04-repo-status-after.txt)"
for d in pending-actions instincts learning; do
  if [ -e "${HOME}/.arcforge/${d}" ]; then
    NEWER=$(find "${HOME}/.arcforge/${d}" -newer "${EVIDENCE_DIR}/01-tasks-initial.md" -type f 2>/dev/null | head -5)
    [ -z "${NEWER}" ] || fail "probe wrote into the real home: ${NEWER}"
  fi
done
pass "arcforge repo and ~/.arcforge both untouched"

printf '\n=== PROBE COMPLETE ===\n'
printf 'iterations   : phase A %s, cumulative after phase B %s\n' "${A_ITER}" "${B_ITER}"
printf 'completed    : %s\n' "${B_DONE}"
printf 'stop reasons : max_runs (phase A) → complete (phase B)\n'
printf 'work dir     : %s\n' "${WORK_DIR}"
printf 'evidence     : %s\n' "${EVIDENCE_DIR}"
