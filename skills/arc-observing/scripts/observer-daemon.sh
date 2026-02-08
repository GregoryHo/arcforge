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
PID_FILE="${INSTINCTS_DIR}/.observer.pid"
LOG_FILE="${INSTINCTS_DIR}/observer.log"
GLOBAL_INDEX="${INSTINCTS_DIR}/global-index.jsonl"

# Daemon configuration
POLL_INTERVAL=300      # 5 minutes
MIN_OBSERVATIONS=10    # Minimum obs before analysis
IDLE_TIMEOUT=1800      # 30 minutes no new obs → auto-stop

# Path to observer prompt (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBSERVER_PROMPT="${SCRIPT_DIR}/observer-prompt.md"

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────

log_msg() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null || true
}

# ─────────────────────────────────────────────
# PID Management
# ─────────────────────────────────────────────

is_running() {
  if [ ! -f "$PID_FILE" ]; then
    return 1
  fi
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null)
  if [ -z "$pid" ]; then
    return 1
  fi
  kill -0 "$pid" 2>/dev/null
}

write_pid() {
  mkdir -p "$(dirname "$PID_FILE")"
  echo "$$" > "$PID_FILE"
}

remove_pid() {
  rm -f "$PID_FILE"
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

  # Call Haiku for analysis with output capture
  local claude_output
  local analysis_success=false
  local retry_count=0
  local max_retries=1

  while [ "$retry_count" -le "$max_retries" ] && [ "$analysis_success" = false ]; do
    if command -v claude &>/dev/null; then
      # Capture stdout and stderr separately
      claude_output=$(echo "$prompt" | claude --model haiku --max-turns 3 --print 2>&1)
      local exit_code=$?

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
    return
  fi

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
  write_pid
  log_msg "Observer daemon started (PID $$)"

  local last_activity
  last_activity=$(date +%s)

  # Graceful shutdown handler
  trap 'log_msg "Daemon stopping (signal)"; remove_pid; exit 0' TERM INT

  # SIGUSR1 handler — immediate analysis
  trap 'log_msg "SIGUSR1 received — immediate analysis"; last_activity=$(date +%s); analyze_all_projects' USR1

  while true; do
    sleep "$POLL_INTERVAL" &
    wait $! 2>/dev/null || true

    # Check idle timeout
    local now
    now=$(date +%s)
    local idle_secs=$((now - last_activity))

    if [ "$idle_secs" -ge "$IDLE_TIMEOUT" ]; then
      log_msg "Idle timeout (${IDLE_TIMEOUT}s) — auto-stopping"
      remove_pid
      exit 0
    fi

    # Check for new observations across all projects
    local has_new=false
    if [ -d "$OBS_DIR" ]; then
      for project_dir in "$OBS_DIR"/*/; do
        [ -d "$project_dir" ] || continue
        local obs_file="${project_dir}observations.jsonl"
        if [ -f "$obs_file" ] && [ -s "$obs_file" ]; then
          has_new=true
          last_activity="$now"
          break
        fi
      done
    fi

    if [ "$has_new" = true ]; then
      analyze_all_projects
    fi
  done
}

# ─────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────

cmd_start() {
  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    echo "Observer daemon already running (PID ${pid})"
    return 0
  fi

  mkdir -p "$INSTINCTS_DIR"
  echo "Starting observer daemon..."
  daemon_loop &
  disown
  echo "Observer daemon started (PID $!)"
}

cmd_stop() {
  if ! is_running; then
    echo "Observer daemon is not running"
    remove_pid
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  echo "Stopping observer daemon (PID ${pid})..."
  kill "$pid" 2>/dev/null || true
  remove_pid
  echo "Observer daemon stopped"
}

cmd_status() {
  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
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
    remove_pid
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
