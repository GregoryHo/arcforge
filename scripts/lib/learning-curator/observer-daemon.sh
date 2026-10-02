#!/usr/bin/env bash
# Observer Daemon — Background behavioral pattern detection
#
# Commands: start, stop, status
# Runs in background, periodically analyzing observations with Haiku.
#
# Adapted from: continuous-learning-v2/agents/start-observer.sh

set -euo pipefail

# Shell-side equivalent of utils.js getArcforgeHome(): ARCFORGE_HOME wins,
# otherwise ~/.arcforge. Keeps the daemon in the same tree as every Node module
# it shells out to — before v6/P5 this read $HOME directly, so a run with
# ARCFORGE_HOME set had the daemon and the curator CLI pointing at different
# trees. Byte-identical to the old value when ARCFORGE_HOME is unset.
ARCFORGE_DIR="${ARCFORGE_HOME:-${HOME}/.arcforge}"
INSTINCTS_DIR="${ARCFORGE_DIR}/instincts"
OBS_DIR="${ARCFORGE_DIR}/observations"
LOCK_DIR="${INSTINCTS_DIR}/.observer.lock"
LOG_FILE="${INSTINCTS_DIR}/observer.log"

# The daemon lives INSIDE the curator module, so every engine file it needs is a
# sibling. BASH_SOURCE (not $0) is used so the path stays correct when the tests
# `source` this file instead of executing it — no env-var handshake, no repo-root
# derivation, nothing to keep in sync with a directory layout.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURATOR_CLI="${SCRIPT_DIR}/cli.js"

# Daemon configuration
POLL_INTERVAL=300      # 5 minutes
MIN_OBSERVATIONS=10    # Minimum obs before analysis
IDLE_TIMEOUT=1800      # 30 minutes no new obs → auto-stop
MAX_AGE=7200           # 2 hours maximum lifetime
ANALYSIS_COOLDOWN=60   # Minimum 60 seconds between analyses
# Watchdog timeout for claude CLI invocation (override via env var for tests)
OBSERVER_DAEMON_WATCHDOG_SECS="${OBSERVER_DAEMON_WATCHDOG_SECS:-120}"

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────

log_msg() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null || true
}

# ─────────────────────────────────────────────
# Lock Management (mkdir-based singleton)
# ─────────────────────────────────────────────

# How long a lock with no PID in it, or a reclaim reservation, may stand before
# it counts as abandoned. A claim writes its PID within milliseconds of the
# mkdir and a reclaim finishes as fast, so only a crash leaves one this old.
CLAIM_WINDOW_SECS=60
# One dated further ahead than this was stamped before the clock went back; it
# counts as abandoned too, or it would hold for the size of the jump.
CLAIM_CLOCK_SKEW_SECS=10

# The lock records which copy of this script holds it, so a daemon left running
# from the previous plugin version can be told apart (replace_foreign_daemon).
# The script goes in before the PID: a contender that can read the PID can read
# the owner too, and until the PID is in, the lock reads as a claim in progress.
claim_lock() {
  echo "$SCRIPT_DIR" > "$LOCK_DIR/script"
  echo $$ > "$LOCK_DIR/pid"
}

# The PID recorded in lock directory $1 (default: the lock), or nothing when
# the file is missing or holds anything but a PID — 1 to 10 digits, no leading
# zero. Every read of a pid file goes through here: the value names a process
# to signal and a reservation directory, so it is never used unchecked.
read_lock_pid() {
  local pid
  pid=$(cat "${1:-$LOCK_DIR}/pid" 2>/dev/null || true)
  case "$pid" in
    '' | 0* | *[!0-9]*) return 0 ;;
  esac
  if [ "${#pid}" -le 10 ]; then
    echo "$pid"
  fi
}

# Whether PID $1 is a live observer daemon. A daemon that died without removing
# its lock leaves a PID the OS can hand to an unrelated process, so being alive
# is not enough: nothing here signals a process, or treats a lock as held,
# unless its command line runs this script.
is_daemon_pid() {
  [ -n "$1" ] && ps -o command= -p "$1" 2>/dev/null | grep -q 'observer-daemon\.sh'
}

# Whether path $1 is past the claim window: changed more than CLAIM_WINDOW_SECS
# ago, or dated more than CLAIM_CLOCK_SKEW_SECS in the future. A path whose
# time cannot be read (it is gone) is not.
claim_window_expired() {
  local mtime now
  mtime=$(stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || true)
  case "$mtime" in
    '' | *[!0-9]*) return 1 ;;
  esac
  now=$(date +%s)
  [ $((now - mtime)) -gt "$CLAIM_WINDOW_SECS" ] ||
    [ $((mtime - now)) -gt "$CLAIM_CLOCK_SKEW_SECS" ]
}

acquire_lock() {
  clean_lock_leftovers
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    claim_lock
    return 0
  fi
  # Lock exists — check for stale lock from crashed process
  local old_pid
  old_pid=$(read_lock_pid)
  if [ -z "$old_pid" ]; then
    # No valid PID: another start is mid-claim, unless the lock is old enough
    # to be one that crashed there, or holds something that is not a PID.
    claim_window_expired "$LOCK_DIR" || return 1
  elif is_daemon_pid "$old_pid"; then
    return 1  # genuinely running
  fi
  # Read the PID again: a lock that changed between the two reads is changing
  # hands, not stale. `start` rewrites the PID from its own to the daemon's
  # before it exits, so a PID that read as dead because its starter exited has
  # already been replaced by the time this read runs.
  [ "$(read_lock_pid)" = "$old_pid" ] || return 1
  reclaim_stale_lock "${old_pid:-none}"
}

# Take over a lock classified stale; $1 is the validated PID read from it, or
# "none". Every contender that read the same stale lock races for one
# reservation named after that PID, and mkdir lets exactly one through. Without
# it, a contender that classified the lock before the winner replaced it would
# move the winner's fresh lock aside, and both would run as the daemon. The
# reservation outlives the reclaim, so a contender that read the stale PID late
# still finds it taken; it expires after the claim window, so a contender that
# died holding it cannot block reclaims for good.
reclaim_stale_lock() {
  local stale_id="$1"
  mkdir "${LOCK_DIR}.reclaim.${stale_id}" 2>/dev/null || return 1  # another start has it
  # Only a start or the holder's own exit changes a lock, and no other start
  # can be reclaiming this one, so it is still the lock classified — unless a
  # manual stop/status removed it and a new start took its place meanwhile.
  # Check once more as late as possible, right before the move.
  [ "$(read_lock_pid)" = "${stale_id#none}" ] || return 1
  local tmp_stale="${LOCK_DIR}.stale.$$"
  log_msg "Reclaiming stale lock (old PID: ${stale_id})"
  mv "$LOCK_DIR" "$tmp_stale" 2>/dev/null || return 1
  # If even so the lock changed hands between that check and the move, put it
  # back when the path is still free. A start that took the path in that gap is
  # a second holder no move can undo; the moved lock is left for
  # clean_lock_leftovers.
  if [ "$(read_lock_pid "$tmp_stale")" != "${stale_id#none}" ]; then
    log_msg "Lock changed hands during reclaim — putting it back"
    [ -e "$LOCK_DIR" ] || mv "$tmp_stale" "$LOCK_DIR" 2>/dev/null || true
    return 1
  fi
  rm -rf "$tmp_stale"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    claim_lock
    return 0
  fi
  return 1  # lost the race to a fresh start
}

# Remove what interrupted reclaims leave next to the lock: reservations past
# the claim window, and moved-aside locks whose reclaiming start (the PID in the
# name) is gone. A live reclaimer's moved lock is left to it.
clean_lock_leftovers() {
  local leftover owner
  for leftover in "${LOCK_DIR}".reclaim.*; do
    [ -d "$leftover" ] || continue
    if claim_window_expired "$leftover"; then
      rm -rf "$leftover"
    fi
  done
  for leftover in "${LOCK_DIR}".stale.*; do
    [ -d "$leftover" ] || continue
    owner="${leftover##*.}"
    case "$owner" in
      '' | *[!0-9]*) continue ;;
    esac
    kill -0 "$owner" 2>/dev/null || rm -rf "$leftover"
  done
}

# A live daemon started from another copy of this script — the previous plugin
# version, after an upgrade, since the plugin cache is keyed by version — would
# otherwise keep running that version's code for up to MAX_AGE. Stop it and take
# the lock. A lock with no script file predates the check and is foreign too.
# Returns 1 (leave it running) when the holder is this copy, or when it has not
# exited within ~2 s — mid-analysis a TERM waits for the model call to return.
replace_foreign_daemon() {
  local owner pid
  # PID before owner: claim_lock writes them in the other order, so a PID read
  # here means the owner is already on disk — read the other way round, a start
  # mid-claim would look foreign and be killed. No PID yet is a claim in progress.
  pid=$(read_lock_pid)
  [ -n "$pid" ] || return 1
  owner=$(cat "$LOCK_DIR/script" 2>/dev/null || true)
  [ "$owner" = "$SCRIPT_DIR" ] && return 1
  # acquire_lock has just reclaimed any lock whose PID is not a daemon; a
  # holder that is not one now is a race, and gets no signal.
  is_daemon_pid "$pid" || return 1
  log_msg "Replacing daemon (PID ${pid}) started from ${owner:-an older version}"
  kill "$pid" 2>/dev/null || true
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  acquire_lock
}

remove_lock() {
  rm -rf "$LOCK_DIR"
}

is_running() {
  if [ ! -d "$LOCK_DIR" ]; then
    return 1
  fi
  local pid
  pid=$(read_lock_pid)
  is_daemon_pid "$pid"
}

# ─────────────────────────────────────────────
# Observation Analysis
# ─────────────────────────────────────────────

count_observations() {
  local project="$1"
  local obs_file="${OBS_DIR}/${project}/observations.jsonl"
  if [ ! -f "$obs_file" ]; then
    echo 0
    return
  fi
  wc -l < "$obs_file" | tr -d ' '
}

# Print the instant learning took effect for a project (the engine's
# `learning-enabled` query), or nothing when it is not enabled or the query
# fails. Returns non-zero in both of those cases.
current_enabled_since() {
  local json=""
  json=$(node "$CURATOR_CLI" learning-enabled --project "$1" 2>/dev/null) || return 1
  printf '%s' "$json" | sed -n 's/.*"enabled_since":"\([^"]*\)".*/\1/p'
}

analyze_project() {
  local project="$1"
  local obs_file="${OBS_DIR}/${project}/observations.jsonl"

  if [ ! -f "$obs_file" ]; then
    return
  fi

  local obs_count
  obs_count=$(count_observations "$project")

  if [ "$obs_count" -lt "$MIN_OBSERVATIONS" ]; then
    log_msg "Skipping ${project}: only ${obs_count} observations (need ${MIN_OBSERVATIONS})"
    return
  fi

  # Consent gate (learning B-1): analysis sends observations to a model, so it
  # runs only where learning is enabled for this project, and only over what was
  # recorded under that opt-in. The engine answers both — global opt-in, or the
  # project-scope opt-in at the recorded root, and the stamp it took effect —
  # and anything other than a clear yes, errors included, skips. Observations
  # recorded before the stamp (an earlier opt-in, since turned off) are never
  # put in a batch; they stay on disk.
  if ! command -v node &>/dev/null; then
    log_msg "WARNING: node not found, skipping analysis"
    return
  fi
  local enabled_status=0 enabled_since=""
  enabled_since=$(current_enabled_since "$project") || enabled_status=$?
  if [ "$enabled_status" -ne 0 ]; then
    log_msg "Skipping ${project}: learning is not enabled for it"
    return
  fi
  if [ -z "$enabled_since" ]; then
    log_msg "Skipping ${project}: learning-enabled returned no enable stamp"
    return
  fi

  # Circuit breaker — skip after 3 consecutive failures (TTL: 30 min)
  local fail_count_file="${OBS_DIR}/${project}/.fail_count"
  if [ -f "$fail_count_file" ]; then
    # Reset circuit breaker if .fail_count is older than 30 minutes
    if [ -z "$(find "$fail_count_file" -mmin -30 2>/dev/null)" ]; then
      log_msg "Circuit breaker TTL expired for ${project} — resetting"
      rm -f "$fail_count_file"
    fi
  fi
  local fail_count
  fail_count=$(cat "$fail_count_file" 2>/dev/null || echo 0)
  if [ "$fail_count" -ge 3 ]; then
    log_msg "CIRCUIT BREAKER: Skipping ${project} — ${fail_count} consecutive failures"
    return
  fi

  log_msg "Analyzing ${project}: ${obs_count} observations"

  if [ ! -f "$CURATOR_CLI" ]; then
    log_msg "ERROR: curator CLI not found at ${CURATOR_CLI}"
    return
  fi

  # ── Layer 3: Assemble batch via Node CLI ──────────────────────────────────
  # Bash 'set -e' aborts the function if `var=$(node ...)` non-zero, so the
  # exit status is captured with `|| status=$?` (a bare failed assignment under
  # `set -e` would skip the next-line check entirely).
  # --since keeps observations recorded before the opt-in stamp out of the
  # batch; exit 3 means too few are left, and nothing was written.
  local batch_info=""
  local batch_err_file="${INSTINCTS_DIR}/.assemble-batch.err"
  local assemble_status=0
  mkdir -p "$INSTINCTS_DIR"
  batch_info=$(node "$CURATOR_CLI" assemble-batch --project "$project" \
    --since "$enabled_since" --min-observations "$MIN_OBSERVATIONS" \
    2>"$batch_err_file") || assemble_status=$?
  if [ "$assemble_status" -eq 3 ]; then
    log_msg "Skipping ${project}: fewer than ${MIN_OBSERVATIONS} observations recorded since learning was enabled (${enabled_since})"
    rm -f "$batch_err_file"
    return
  fi
  if [ "$assemble_status" -ne 0 ]; then
    log_msg "ERROR: assemble-batch failed for ${project}: $(cat "$batch_err_file" 2>/dev/null || true)"
    rm -f "$batch_err_file"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi
  rm -f "$batch_err_file"
  if [ -z "$batch_info" ]; then
    log_msg "ERROR: assemble-batch returned empty output for ${project}"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi

  # Extract both fields in ONE node call — emits TAB-separated values to stdout.
  # Halves the per-cycle node startup overhead (was 2 spawns per project).
  local extracted prompt_path batch_id
  if ! extracted=$(printf '%s' "$batch_info" | node -e '
    let d="";
    process.stdin.on("data", c => d += c);
    process.stdin.on("end", () => {
      try {
        const o = JSON.parse(d);
        process.stdout.write((o.prompt_path || "") + "\t" + (o.batch_id || ""));
      } catch {
        process.exit(1);
      }
    });
  ' 2>/dev/null); then
    log_msg "ERROR: assemble-batch output was not valid JSON for ${project}"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi
  IFS=$'\t' read -r prompt_path batch_id <<< "$extracted"

  if [ -z "$prompt_path" ] || [ -z "$batch_id" ]; then
    log_msg "ERROR: could not extract prompt_path or batch_id from assemble-batch output"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi

  if [ ! -f "$prompt_path" ]; then
    log_msg "ERROR: prompt file not found at ${prompt_path}"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi

  # ── Layer 4: Call claude with watchdog ────────────────────────────────────
  # Uses Anthropic structured output (--json-schema) to force the model to emit
  # a payload conforming to CandidateProposalPayload v1. Without this, claude
  # CLI's default Code-mode system prompt biases the model to wrap JSON in
  # markdown code fences (verified E.3). With --json-schema + --output-format
  # json, the model cannot wrap — the CLI returns an envelope containing the
  # structured payload under the `structured_output` field.
  #
  # Response file: transient, cleaned in EXIT trap and after ingestion.
  local response_file="${INSTINCTS_DIR}/.curator-response.${batch_id}.json"
  local analysis_success=false
  local retry_count=0
  local max_retries=1
  local last_was_timeout=false
  local schema_path="${SCRIPT_DIR}/candidate-proposal-schema.json"
  if [ ! -f "$schema_path" ]; then
    log_msg "ERROR: candidate-proposal-schema.json not found at ${schema_path}"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi
  # Read schema once per analyze_project call so the inner loop reuses it.
  local schema_json
  schema_json=$(cat "$schema_path")

  # The curator run gets no tools at all (learning B-9, D-023): `--tools ""`
  # empties the built-in set, and the strict, empty MCP config loads no server,
  # so the run can read the batch it is handed and return a proposal, and can
  # touch nothing on the machine. The same argv goes to ingest-proposal, which
  # derives the run manifest's tool_access from it rather than asserting one.
  local -a claude_args=(--model haiku --tools ""
    --max-turns 15
    --print
    --output-format json
    --json-schema "$schema_json"
    --disable-slash-commands
    --strict-mcp-config --mcp-config '{"mcpServers":{}}')

  # Ensure INSTINCTS_DIR exists for the response file
  mkdir -p "$INSTINCTS_DIR"

  # Register response file in EXIT trap (best-effort cleanup)
  local tmp_out="${INSTINCTS_DIR}/.analyzing.output.tmp"
  trap 'rm -f "$tmp_out" "$response_file"' RETURN

  # Marker file: set by watchdog subshell before killing claude.
  # Lets the outer loop distinguish timeout from plain transport_error.
  local watchdog_fired_marker="${INSTINCTS_DIR}/.watchdog-fired.${batch_id}"

  while [ "$retry_count" -le "$max_retries" ] && [ "$analysis_success" = false ]; do
    # Consent is re-checked immediately before every model attempt, retries
    # included (learning B-1). The batch was rendered under `enabled_since`, so
    # the run is withdrawn not only when learning is now off but also when the
    # stamp moved — a disable and re-enable since assembly — because the prompt
    # may carry evidence from the earlier period. The next cycle rebuilds it.
    local recheck_since="" recheck_status=0 withdrawn=""
    recheck_since=$(current_enabled_since "$project") || recheck_status=$?
    if [ "$recheck_status" -ne 0 ] || [ -z "$recheck_since" ]; then
      withdrawn="learning was turned off before the batch was submitted"
    elif [ "$recheck_since" != "$enabled_since" ]; then
      withdrawn="the opt-in changed since the batch was assembled (${enabled_since} -> ${recheck_since})"
    fi
    if [ -n "$withdrawn" ]; then
      log_msg "Aborting ${project}: ${withdrawn}; nothing was sent"
      node "$CURATOR_CLI" record-run-failure \
        --batch-id "$batch_id" \
        --parse-status "transport_error" \
        --transport-status "cancelled" \
        --detail "${withdrawn}; nothing was sent" \
        -- "${claude_args[@]}" \
        > /dev/null 2>&1 || true
      return
    fi
    if command -v claude &>/dev/null; then
      local exit_code=0
      local claude_pid=""
      local watchdog_pid=""
      rm -f "$watchdog_fired_marker"

      # Pipe prompt file to claude; capture JSON envelope to response_file.
      # --output-format json + --json-schema forces structured output (no
      # markdown wrap possible). The payload lives at .structured_output in
      # the envelope; ingest-proposal extracts it.
      (claude "${claude_args[@]}" \
        < "$prompt_path" \
        > "$response_file" 2>"$tmp_out") &
      claude_pid=$!

      # Watchdog: kill claude if it exceeds OBSERVER_DAEMON_WATCHDOG_SECS.
      # Touch watchdog_fired_marker before killing so the outer loop can
      # distinguish timeout from a plain claude crash (transport_error).
      (sleep "$OBSERVER_DAEMON_WATCHDOG_SECS" && \
        if kill -0 "$claude_pid" 2>/dev/null; then \
          log_msg "WATCHDOG: claude exceeded ${OBSERVER_DAEMON_WATCHDOG_SECS}s — killing (PID ${claude_pid})"; \
          touch "$watchdog_fired_marker" 2>/dev/null || true; \
          kill "$claude_pid" 2>/dev/null || true; \
        fi) &
      watchdog_pid=$!

      wait "$claude_pid" 2>/dev/null && exit_code=0 || exit_code=$?
      # Cancel watchdog if claude finished normally
      kill "$watchdog_pid" 2>/dev/null || true
      wait "$watchdog_pid" 2>/dev/null || true

      if [ "$exit_code" -eq 0 ]; then
        analysis_success=true
        log_msg "Claude analysis completed successfully"
      else
        log_msg "ERROR: claude analysis failed (exit code: ${exit_code})"
        # If watchdog fired, this attempt counts as a timeout.
        # Write a failure manifest for this attempt (Layer 4 spec §10).
        if [ -f "$watchdog_fired_marker" ]; then
          rm -f "$watchdog_fired_marker"
          node "$CURATOR_CLI" record-run-failure \
            --batch-id "$batch_id" \
            --parse-status "timeout" \
            --detail "claude CLI exceeded watchdog timeout (${OBSERVER_DAEMON_WATCHDOG_SECS}s)" \
            -- "${claude_args[@]}" \
            > /dev/null 2>&1 || true
          last_was_timeout=true
        else
          last_was_timeout=false
        fi
        retry_count=$((retry_count + 1))
        if [ "$retry_count" -le "$max_retries" ]; then
          log_msg "Retrying analysis (attempt ${retry_count}/${max_retries})..."
          sleep 2
        fi
      fi
    else
      log_msg "WARNING: claude CLI not found, skipping analysis"
      # PR-F: write failure manifest. CLI-binary-missing is recorded as
      # transport_error per layer-4 spec parse_status enum; detail carries
      # the "not found in PATH" specific reason.
      node "$CURATOR_CLI" record-run-failure \
        --batch-id "$batch_id" \
        --parse-status "transport_error" \
        --detail "claude CLI not found in PATH" \
        -- "${claude_args[@]}" \
        > /dev/null 2>&1 || true
      return
    fi
  done

  if [ "$analysis_success" = false ]; then
    log_msg "ERROR: Analysis failed after ${max_retries} retries for ${project}"
    echo $((fail_count + 1)) > "$fail_count_file"
    rm -f "$response_file"
    # PR-F: write failure manifest for transport_error only if the last attempt was NOT
    # a watchdog timeout (timeout attempts already wrote their own manifests).
    if [ "$last_was_timeout" != true ]; then
      node "$CURATOR_CLI" record-run-failure \
        --batch-id "$batch_id" \
        --parse-status "transport_error" \
        --detail "claude CLI exited non-zero after ${max_retries} retries" \
        -- "${claude_args[@]}" \
        > /dev/null 2>&1 || true
    fi
    return
  fi

  # ── Layer 5: Hand off to queue via Node CLI ───────────────────────────────
  local ingest_result=""
  local ingest_err_file="${INSTINCTS_DIR}/.ingest-proposal.err"
  if ! ingest_result=$(node "$CURATOR_CLI" ingest-proposal \
      --batch-id "$batch_id" \
      --response-file "$response_file" \
      -- "${claude_args[@]}" 2>"$ingest_err_file"); then
    log_msg "ERROR: ingest-proposal failed for batch ${batch_id}: $(cat "$ingest_err_file" 2>/dev/null || true)"
    rm -f "$ingest_err_file" "$response_file"
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi
  rm -f "$ingest_err_file"

  log_msg "Ingest result: ${ingest_result}"

  # Clean up transient response file (also removed by RETURN trap, but be explicit)
  rm -f "$response_file"

  # Circuit breaker — reset on success
  rm -f "$fail_count_file"

  log_msg "Analysis complete for ${project} (batch ${batch_id})"

  # Archive processed observations
  archive_observations "$project"

  # Note: direct writes to ~/.arcforge/instincts/<project>/<id>.md are retired.
  # Candidates now go to ~/.arcforge/learning/candidates/queue.jsonl via Layer 5.
  # Project → global promotion requires an explicit dashboard [Promote] action.
}

archive_observations() {
  local project="$1"
  local obs_file="${OBS_DIR}/${project}/observations.jsonl"
  local archive_dir="${OBS_DIR}/${project}/archive"

  if [ ! -f "$obs_file" ]; then
    return
  fi

  mkdir -p "$archive_dir"
  local timestamp
  timestamp=$(date '+%Y%m%d-%H%M%S')
  mv "$obs_file" "${archive_dir}/observations-${timestamp}.jsonl"
  log_msg "Archived observations for ${project}"
}

analyze_all_projects() {
  local analyzing_lock="${INSTINCTS_DIR}/.analyzing.lock"
  # Staleness: a SIGKILL/OOM can leave .analyzing.lock behind because EXIT
  # trap doesn't fire. Treat locks older than 30 minutes as stale and reclaim.
  local stale_lock_minutes=30

  if [ -f "$analyzing_lock" ]; then
    if find "$analyzing_lock" -mmin +"$stale_lock_minutes" -print 2>/dev/null | grep -q .; then
      log_msg "ANALYZING: stale .analyzing.lock (>${stale_lock_minutes}m old) — reclaiming"
      rm -f "$analyzing_lock"
    else
      log_msg "ANALYZING: analysis already in progress (.analyzing.lock exists) — skipping this round"
      return
    fi
  fi

  touch "$analyzing_lock" 2>/dev/null || true

  if [ ! -d "$OBS_DIR" ]; then
    rm -f "$analyzing_lock"
    return
  fi

  for project_dir in "$OBS_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    local project
    project=$(basename "$project_dir")
    analyze_project "$project"
  done

  rm -f "$analyzing_lock"
}

# ─────────────────────────────────────────────
# Daemon Loop
# ─────────────────────────────────────────────

daemon_loop() {
  log_msg "Observer daemon started"

  local last_activity
  last_activity=$(date +%s)
  local DAEMON_START
  DAEMON_START=$(date +%s)
  local LAST_ANALYSIS=0

  # Track observation state to detect actual new data
  local obs_state_file="${OBS_DIR}/.obs_state"

  # Cleanup lock + transient analyzer files on exit; also remove ANALYZING lock to prevent stale lock after crash.
  # Also clean up any transient curator response files left by an interrupted analysis.
  trap 'log_msg "Daemon stopping (EXIT)"; rm -f "${INSTINCTS_DIR}/.analyzing.lock" "${INSTINCTS_DIR}/.analyzing.output.tmp" "${INSTINCTS_DIR}"/.curator-response.*.json "${INSTINCTS_DIR}"/.watchdog-fired.*; remove_lock' EXIT
  trap 'log_msg "Daemon stopping (signal)"; rm -f "${INSTINCTS_DIR}/.analyzing.lock" "${INSTINCTS_DIR}/.analyzing.output.tmp" "${INSTINCTS_DIR}"/.curator-response.*.json "${INSTINCTS_DIR}"/.watchdog-fired.*; remove_lock; exit 0' TERM INT

  # SIGUSR1 handler with cooldown
  handle_sigusr1() {
    local now
    now=$(date +%s)
    last_activity=$now
    if [ $((now - LAST_ANALYSIS)) -lt "$ANALYSIS_COOLDOWN" ]; then
      log_msg "SIGUSR1 received — cooldown active (${ANALYSIS_COOLDOWN}s), skipping"
      return
    fi
    log_msg "SIGUSR1 received — immediate analysis"
    LAST_ANALYSIS=$now
    analyze_all_projects
    echo 0 > "$obs_state_file"
  }
  trap 'handle_sigusr1' USR1

  while true; do
    sleep "$POLL_INTERVAL" &
    wait $! 2>/dev/null || true

    local now
    now=$(date +%s)

    # Check max age
    local age=$((now - DAEMON_START))
    if [ "$age" -ge "$MAX_AGE" ]; then
      log_msg "Max age reached (${MAX_AGE}s) — auto-stopping"
      exit 0
    fi

    # Check idle timeout
    local idle_secs=$((now - last_activity))

    if [ "$idle_secs" -ge "$IDLE_TIMEOUT" ]; then
      log_msg "Idle timeout (${IDLE_TIMEOUT}s) — auto-stopping"
      exit 0
    fi

    # Check for NEW observations (compare line counts, not just existence)
    local has_new=false
    local current_obs_count=0
    if [ -d "$OBS_DIR" ]; then
      for project_dir in "$OBS_DIR"/*/; do
        [ -d "$project_dir" ] || continue
        local obs_file="${project_dir}observations.jsonl"
        if [ -f "$obs_file" ]; then
          current_obs_count=$((current_obs_count + $(wc -l < "$obs_file")))
        fi
      done
    fi

    local prev_obs_count
    prev_obs_count=$(cat "$obs_state_file" 2>/dev/null || echo 0)
    if [ "$current_obs_count" -gt "$prev_obs_count" ]; then
      has_new=true
      last_activity="$now"
      echo "$current_obs_count" > "$obs_state_file"
    fi

    if [ "$has_new" = true ]; then
      LAST_ANALYSIS=$now
      analyze_all_projects
      # Reset baseline — archives moved observations, so counts dropped.
      # Without reset, new observations stay below stale high-water mark.
      echo 0 > "$obs_state_file"
    fi
  done
}

# ─────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────

cmd_start() {
  mkdir -p "$INSTINCTS_DIR"
  if ! acquire_lock && ! replace_foreign_daemon; then
    local running_pid
    running_pid=$(read_lock_pid)
    echo "Observer daemon already running (PID ${running_pid})"
    return 0
  fi
  # Lock acquired — we are the singleton
  echo "Starting observer daemon..."
  daemon_loop &
  echo "$!" > "$LOCK_DIR/pid"  # Update PID to the background process
  disown
  echo "Observer daemon started (PID $!)"
}

cmd_stop() {
  if ! is_running; then
    echo "Observer daemon is not running"
    remove_lock
    return 0
  fi

  local pid
  pid=$(read_lock_pid)
  echo "Stopping observer daemon (PID ${pid})..."
  kill "$pid" 2>/dev/null || true
  # Daemon's EXIT trap will clean up the lock
  echo "Observer daemon stopped"
}

cmd_status() {
  if is_running; then
    local pid
    pid=$(read_lock_pid)
    echo "Observer daemon: RUNNING (PID ${pid})"

    # Show observation counts per project
    if [ -d "$OBS_DIR" ]; then
      for project_dir in "$OBS_DIR"/*/; do
        [ -d "$project_dir" ] || continue
        local project
        project=$(basename "$project_dir")
        local count
        count=$(count_observations "$project")
        echo "  ${project}: ${count} pending observations"
      done
    fi

    # Show log tail
    if [ -f "$LOG_FILE" ]; then
      echo ""
      echo "Recent log:"
      tail -5 "$LOG_FILE" 2>/dev/null || true
    fi
  else
    echo "Observer daemon: STOPPED"
    remove_lock
  fi
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

# Guard: skip command dispatch when sourced (allows tests to import functions)
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  case "${1:-status}" in
    start)  cmd_start ;;
    stop)   cmd_stop ;;
    status) cmd_status ;;
    *)
      echo "Usage: $0 {start|stop|status}"
      exit 1
      ;;
  esac
fi
