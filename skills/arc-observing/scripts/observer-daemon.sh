#!/usr/bin/env bash
# Observer Daemon — Background behavioral pattern detection
#
# Commands: start, stop, status
# Runs in background, periodically analyzing observations with Haiku.
#
# Adapted from: continuous-learning-v2/agents/start-observer.sh

set -euo pipefail

ARCFORGE_DIR="${HOME}/.arcforge"
INSTINCTS_DIR="${ARCFORGE_DIR}/instincts"
OBS_DIR="${ARCFORGE_DIR}/observations"
LOCK_DIR="${INSTINCTS_DIR}/.observer.lock"
LOG_FILE="${INSTINCTS_DIR}/observer.log"
GLOBAL_INDEX="${INSTINCTS_DIR}/global-index.jsonl"

# ARCFORGE_ROOT: path to the arcforge repo containing scripts/lib/learning-curator/cli.js
# Prefer env var (set by plugin sessions + tests); fall back to grandparent of SCRIPT_DIR.
# SCRIPT_DIR is set below, but we need it here — so we derive it first.
if [ -z "${SCRIPT_DIR:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
# Derive ARCFORGE_ROOT from SCRIPT_DIR (skills/arc-observing/scripts → repo root = ../../../)
ARCFORGE_ROOT="${ARCFORGE_ROOT:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
CURATOR_CLI="${ARCFORGE_ROOT}/scripts/lib/learning-curator/cli.js"

# Daemon configuration
POLL_INTERVAL=300      # 5 minutes
MIN_OBSERVATIONS=10    # Minimum obs before analysis
IDLE_TIMEOUT=1800      # 30 minutes no new obs → auto-stop
MAX_AGE=7200           # 2 hours maximum lifetime
ANALYSIS_COOLDOWN=60   # Minimum 60 seconds between analyses
# Watchdog timeout for claude CLI invocation (override via env var for tests)
OBSERVER_DAEMON_WATCHDOG_SECS="${OBSERVER_DAEMON_WATCHDOG_SECS:-120}"

# Path to observer prompt (relative to this script's directory)
OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────

log_msg() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null || true
}

# ─────────────────────────────────────────────
# Lock Management (mkdir-based singleton)
# ─────────────────────────────────────────────

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    return 0
  fi
  # Lock exists — check for stale lock from crashed process
  local old_pid
  old_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    return 1  # genuinely running
  fi
  # Stale lock — reclaim atomically (mv is atomic; prevents TOCTOU race
  # where two processes both rm + mkdir and both think they won)
  local tmp_stale="${LOCK_DIR}.stale.$$"
  log_msg "Reclaiming stale lock (old PID: ${old_pid:-unknown})"
  if mv "$LOCK_DIR" "$tmp_stale" 2>/dev/null; then
    rm -rf "$tmp_stale"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo $$ > "$LOCK_DIR/pid"
      return 0
    fi
  fi
  return 1  # lost the race to another instance
}

remove_lock() {
  rm -rf "$LOCK_DIR"
}

is_running() {
  if [ ! -d "$LOCK_DIR" ]; then
    return 1
  fi
  local pid
  pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)
  if [ -z "$pid" ]; then
    return 1
  fi
  kill -0 "$pid" 2>/dev/null
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

  # Verify Node CLI is available
  if ! command -v node &>/dev/null; then
    log_msg "WARNING: node not found, skipping analysis"
    return
  fi
  if [ ! -f "$CURATOR_CLI" ]; then
    log_msg "ERROR: curator CLI not found at ${CURATOR_CLI} (ARCFORGE_ROOT=${ARCFORGE_ROOT})"
    return
  fi

  # ── Layer 3: Assemble batch via Node CLI ──────────────────────────────────
  # Bash 'set -e' aborts the function if `var=$(node ...)` non-zero, so the
  # error check must use `if !` form (a failed assignment via `set -e` skips
  # the next-line check entirely).
  local batch_info=""
  local batch_err_file="${INSTINCTS_DIR}/.assemble-batch.err"
  mkdir -p "$INSTINCTS_DIR"
  if ! batch_info=$(node "$CURATOR_CLI" assemble-batch --project "$project" 2>"$batch_err_file"); then
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
  # Response file: transient, cleaned in EXIT trap and after ingestion.
  # Note: Layer 4 spec says tool_access=false — no --tools flag.
  local response_file="${INSTINCTS_DIR}/.curator-response.${batch_id}.json"
  local analysis_success=false
  local retry_count=0
  local max_retries=1

  # Ensure INSTINCTS_DIR exists for the response file
  mkdir -p "$INSTINCTS_DIR"

  # Register response file in EXIT trap (best-effort cleanup)
  local tmp_out="${INSTINCTS_DIR}/.analyzing.output.tmp"
  trap 'rm -f "$tmp_out" "$response_file"' RETURN

  while [ "$retry_count" -le "$max_retries" ] && [ "$analysis_success" = false ]; do
    if command -v claude &>/dev/null; then
      local exit_code=0
      local claude_pid=""
      local watchdog_pid=""

      # Pipe prompt file to claude; capture JSON output to response_file.
      # No --tools flag: Layer 4 LLM curator must not have tool access.
      (claude --model haiku \
        --max-turns 15 \
        --print \
        --disable-slash-commands \
        --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
        < "$prompt_path" \
        > "$response_file" 2>"$tmp_out") &
      claude_pid=$!

      # Watchdog: kill claude if it exceeds OBSERVER_DAEMON_WATCHDOG_SECS
      (sleep "$OBSERVER_DAEMON_WATCHDOG_SECS" && \
        if kill -0 "$claude_pid" 2>/dev/null; then \
          log_msg "WATCHDOG: claude exceeded ${OBSERVER_DAEMON_WATCHDOG_SECS}s — killing (PID ${claude_pid})"; \
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
        retry_count=$((retry_count + 1))
        if [ "$retry_count" -le "$max_retries" ]; then
          log_msg "Retrying analysis (attempt ${retry_count}/${max_retries})..."
          sleep 2
        fi
      fi
    else
      log_msg "WARNING: claude CLI not found, skipping analysis"
      return
    fi
  done

  if [ "$analysis_success" = false ]; then
    log_msg "ERROR: Analysis failed after ${max_retries} retries for ${project}"
    echo $((fail_count + 1)) > "$fail_count_file"
    rm -f "$response_file"
    return
  fi

  # ── Layer 5: Hand off to queue via Node CLI ───────────────────────────────
  local ingest_result=""
  local ingest_err_file="${INSTINCTS_DIR}/.ingest-proposal.err"
  if ! ingest_result=$(node "$CURATOR_CLI" ingest-proposal \
      --batch-id "$batch_id" \
      --response-file "$response_file" 2>"$ingest_err_file"); then
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
  trap 'log_msg "Daemon stopping (EXIT)"; rm -f "${INSTINCTS_DIR}/.analyzing.lock" "${INSTINCTS_DIR}/.analyzing.output.tmp" "${INSTINCTS_DIR}"/.curator-response.*.json; remove_lock' EXIT
  trap 'log_msg "Daemon stopping (signal)"; rm -f "${INSTINCTS_DIR}/.analyzing.lock" "${INSTINCTS_DIR}/.analyzing.output.tmp" "${INSTINCTS_DIR}"/.curator-response.*.json; remove_lock; exit 0' TERM INT

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
  if ! acquire_lock; then
    local running_pid
    running_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)
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
  pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)
  echo "Stopping observer daemon (PID ${pid})..."
  kill "$pid" 2>/dev/null || true
  # Daemon's EXIT trap will clean up the lock
  echo "Observer daemon stopped"
}

cmd_status() {
  if is_running; then
    local pid
    pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)
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
