#!/usr/bin/env bash
# Observer Daemon — Background behavioral pattern detection
#
# Commands: start, stop, status
# Runs in background, periodically analyzing observations with Haiku.
#
# Adapted from: continuous-learning-v2/agents/start-observer.sh

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
INSTINCTS_DIR="${CLAUDE_DIR}/instincts"
OBS_DIR="${CLAUDE_DIR}/observations"
LOCK_DIR="${INSTINCTS_DIR}/.observer.lock"
LOG_FILE="${INSTINCTS_DIR}/observer.log"
GLOBAL_INDEX="${INSTINCTS_DIR}/global-index.jsonl"

# Daemon configuration
POLL_INTERVAL=300      # 5 minutes
MIN_OBSERVATIONS=10    # Minimum obs before analysis
IDLE_TIMEOUT=1800      # 30 minutes no new obs → auto-stop
MAX_AGE=7200           # 2 hours maximum lifetime
ANALYSIS_COOLDOWN=60   # Minimum 60 seconds between analyses

# Path to observer prompt (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"
OBSERVER_SYSTEM_PROMPT="${SCRIPT_DIR}/observer-system-prompt.md"

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
  local project_instincts="${INSTINCTS_DIR}/${project}"

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

  # Ensure instincts directory exists
  mkdir -p "$project_instincts"

  # Count instincts before analysis
  local before_count=0
  if [ -d "$project_instincts" ]; then
    before_count=$(find "$project_instincts" -maxdepth 1 -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
  fi

  # Read existing instincts for dedup context
  local existing_instincts=""
  if [ -d "$project_instincts" ]; then
    existing_instincts=$(find "$project_instincts" -maxdepth 1 -name '*.md' -exec cat {} + 2>/dev/null || true)
  fi

  # Build prompt with observations and existing instincts
  local prompt
  prompt=$(cat "$OBSERVER_PROMPT")
  prompt="${prompt}

## Current Observations (${project})

\`\`\`jsonl
$(tail -200 "$obs_file")
\`\`\`

## Existing Instincts (${project})

${existing_instincts:-None yet.}

## Output Directory

Write instinct files to: ${project_instincts}/
Each file: {id}.md with YAML frontmatter + markdown body.
"

  # Call Haiku for analysis — clean session with zero MCP overhead
  local claude_output
  local analysis_success=false
  local retry_count=0
  local max_retries=1

  while [ "$retry_count" -le "$max_retries" ] && [ "$analysis_success" = false ]; do
    if command -v claude &>/dev/null; then
      # Capture stdout and stderr separately
      local exit_code=0
      claude_output=$(echo "$prompt" | claude --model haiku \
        --max-turns 3 \
        --print \
        --system-prompt "$(cat "$OBSERVER_SYSTEM_PROMPT")" \
        --tools "Write,Read,Bash,Grep,Glob" \
        --disable-slash-commands \
        --strict-mcp-config --mcp-config '{}' \
        2>&1) || exit_code=$?

      if [ "$exit_code" -eq 0 ]; then
        analysis_success=true
        log_msg "Claude analysis completed successfully"
      else
        log_msg "ERROR: claude analysis failed (exit code: ${exit_code})"
        if [ "$retry_count" -lt "$max_retries" ]; then
          retry_count=$((retry_count + 1))
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
    # Circuit breaker — increment failure count
    echo $((fail_count + 1)) > "$fail_count_file"
    return
  fi

  # Circuit breaker — reset on success
  rm -f "$fail_count_file"

  # Verify instinct creation by counting files after analysis
  local after_count=0
  if [ -d "$project_instincts" ]; then
    after_count=$(find "$project_instincts" -maxdepth 1 -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
  fi

  local new_instincts=$((after_count - before_count))

  if [ "$new_instincts" -gt 0 ]; then
    log_msg "✓ Successfully created ${new_instincts} new instinct(s) for ${project}"
  elif [ "$after_count" -gt 0 ]; then
    log_msg "No new instincts created (${after_count} existing instincts)"
  else
    log_msg "⚠ No instinct files found after analysis"
  fi

  # Archive processed observations
  archive_observations "$project"

  # Check bubble-up to global
  check_bubble_up "$project"
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

check_bubble_up() {
  local project="$1"

  # Delegate to Node.js for unified bubble-up logic
  node "${SCRIPT_DIR}/../../../scripts/lib/global-index.js" --check-promote --project "$project" 2>&1 | while read -r line; do
    log_msg "$line"
  done
}

analyze_all_projects() {
  if [ ! -d "$OBS_DIR" ]; then
    return
  fi

  for project_dir in "$OBS_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    local project
    project=$(basename "$project_dir")
    analyze_project "$project"
  done
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

  # Cleanup lock on exit
  trap 'log_msg "Daemon stopping (EXIT)"; remove_lock' EXIT
  trap 'log_msg "Daemon stopping (signal)"; remove_lock; exit 0' TERM INT

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

case "${1:-status}" in
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
