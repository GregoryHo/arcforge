"""
Main event dispatcher for log-lightweight hook.

Handles all Claude Code hook events: SessionStart, UserPromptSubmit,
PreToolUse, PostToolUse, SubagentStop, PermissionRequest, Stop, SessionEnd.
"""

import sys
import os
import json
import datetime
import time
from pathlib import Path

from .config import set_project_root, get_log_dir_path, get_config, DEFAULT_TOOLS_TO_LOG
from .state import read_state, write_state
from .io_writer import write_log_snapshot
from .tokens import get_latest_response, get_incremental_usage, calculate_duration
from .tools import summarize_tool_input, summarize_tool_output, get_filename, format_timestamp


def main():
    """Main entry point."""
    _start_time = time.perf_counter()  # Performance tracking
    try:
        input_data = json.load(sys.stdin)
        hook_event = input_data.get("hook_event_name")
        cwd = input_data.get("cwd", "")

        # Set project root for all path operations
        set_project_root(Path(cwd) if cwd else Path.cwd())

        # Read config
        config = get_config()

        # Check if logging is enabled
        if not config.get("enabled", True):
            sys.exit(0)

        tools_to_log = set(config.get("tools_to_log", DEFAULT_TOOLS_TO_LOG))

        state = read_state()

        if hook_event == "SessionStart":
            _handle_session_start(input_data, state, cwd)

        elif hook_event == "UserPromptSubmit":
            _handle_user_prompt(input_data, state, config, cwd)

        elif hook_event == "PreToolUse":
            _handle_pre_tool_use(input_data, state, tools_to_log)

        elif hook_event == "PostToolUse":
            _handle_post_tool_use(input_data, state, config, tools_to_log)

        elif hook_event == "SubagentStop":
            _handle_subagent_stop(state, config)

        elif hook_event == "PermissionRequest":
            _handle_permission_request(input_data, state, config)

        elif hook_event == "Stop":
            _handle_stop(state, config)

        elif hook_event == "SessionEnd":
            _handle_session_end(state, config)

        # Performance tracking (enable via config or env var)
        if config.get("performance_tracking") or os.environ.get("HOOK_PERF"):
            elapsed_ms = (time.perf_counter() - _start_time) * 1000
            perf_log = get_log_dir_path() / "performance.log"
            perf_log.parent.mkdir(parents=True, exist_ok=True)
            with open(perf_log, "a", encoding="utf-8") as f:
                f.write(f"{datetime.datetime.now().isoformat()} {hook_event}: {elapsed_ms:.3f}ms\n")

        sys.exit(0)

    except Exception as e:
        # Always exit 0 to not block Claude Code
        # Errors are logged to file and stderr
        import traceback
        error_msg = f"[{datetime.datetime.now().isoformat()}] Hook Error: {e}\n{traceback.format_exc()}"
        print(error_msg, file=sys.stderr)

        # Write error to log file
        try:
            error_log = get_log_dir_path() / "errors.log"
            error_log.parent.mkdir(parents=True, exist_ok=True)
            with open(error_log, "a", encoding="utf-8") as f:
                f.write(error_msg + "\n")
        except Exception:
            pass  # Silently fail if can't write error log

        sys.exit(0)


def _make_initial_timestamp() -> str:
    """Create a UTC timestamp in Z-suffix format to match transcript entries."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _make_initial_state(cwd, transcript_path, timeline=None, session_id=None):
    """Create a fresh session state dict."""
    state = {
        "start_time": datetime.datetime.now().isoformat(),
        "transcript_path": transcript_path,
        "project_root": cwd,
        "timeline": timeline or [],
        "pending_tool": None,
        "pending_subagent": None,
        "files_modified": [],
        "error_count": 0,
        "tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0},
        "context_tokens": 0,
        "model": None,
        "last_processed_timestamp": _make_initial_timestamp()
    }
    if session_id is not None:
        state["session_id"] = session_id
    return state


def _handle_session_start(input_data, state, cwd):
    """Initialize state at session start."""
    session_id = input_data.get("session_id", "")
    transcript_path = input_data.get("transcript_path", "")
    trigger = input_data.get("trigger", "")

    # Only preserve timeline if UserPromptSubmit fired before SessionStart (same session)
    existing_timeline = []
    if trigger == "startup" and state.get("transcript_path") == transcript_path:
        existing_timeline = state.get("timeline", [])

    new_state = _make_initial_state(cwd, transcript_path, timeline=existing_timeline, session_id=session_id)
    write_state(new_state)


def _handle_user_prompt(input_data, state, config, cwd):
    """Add prompt to timeline."""
    prompt = input_data.get("prompt", "")
    transcript_path = input_data.get("transcript_path", "")

    # Check if same transcript (same session)
    if state.get("transcript_path") == transcript_path and state.get("start_time"):
        # Same session - add prompt to timeline
        timeline = state.setdefault("timeline", [])
        timeline.append({
            "ts": format_timestamp(datetime.datetime.now().isoformat()),
            "type": "prompt",
            "content": prompt
        })
        write_state(state)
        write_log_snapshot(state, config)
    else:
        # New session (SessionStart might not have fired)
        initial_timeline = [{
            "ts": format_timestamp(datetime.datetime.now().isoformat()),
            "type": "prompt",
            "content": prompt
        }]
        new_state = _make_initial_state(cwd, transcript_path, timeline=initial_timeline)
        write_state(new_state)
        write_log_snapshot(new_state, config)


def _handle_pre_tool_use(input_data, state, tools_to_log):
    """Store pending tool info (only for tools we care about)."""
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if state and tool_name in tools_to_log:
        state["pending_tool"] = {
            "ts": datetime.datetime.now().isoformat(),
            "tool": tool_name,
            "input": summarize_tool_input(tool_name, tool_input)
        }
        write_state(state)


def _handle_post_tool_use(input_data, state, config, tools_to_log):
    """Complete tool entry with output (only for tools we care about)."""
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    tool_response = input_data.get("tool_response")

    if not (state and tool_name in tools_to_log):
        return

    pending = state.get("pending_tool")
    output = summarize_tool_output(tool_name, tool_response)

    if pending and pending.get("tool") == tool_name:
        # Merge with pending
        tool_entry = {
            "ts": format_timestamp(pending["ts"]),
            "type": "tool",
            "tool": tool_name,
            "input": pending.get("input", ""),
        }
    else:
        # No pending, create from PostToolUse data
        tool_entry = {
            "ts": format_timestamp(datetime.datetime.now().isoformat()),
            "type": "tool",
            "tool": tool_name,
            "input": summarize_tool_input(tool_name, tool_input),
        }

    # Only add output if not empty
    if output:
        tool_entry["output"] = output

    state.setdefault("timeline", []).append(tool_entry)
    state["pending_tool"] = None

    # Track files_modified for Edit/Write tools
    if tool_name in ("Edit", "MultiEdit", "Write"):
        file_path = tool_input.get("file_path", "")
        if file_path:
            filename = get_filename(file_path)
            files_modified = state.setdefault("files_modified", [])
            if filename and filename not in files_modified:
                files_modified.append(filename)

    # Track error_count
    is_error = False
    if isinstance(tool_response, dict) and tool_response.get("error"):
        is_error = True
    elif tool_name == "Bash" and isinstance(tool_response, dict):
        exit_code = tool_response.get("exitCode", tool_response.get("exit_code"))
        if exit_code is not None and exit_code != 0:
            is_error = True
    if is_error:
        state["error_count"] = state.get("error_count", 0) + 1

    # Track pending subagent for Task tool
    if tool_name == "Task":
        subagent_type = tool_input.get("subagent_type", "unknown")
        state["pending_subagent"] = {
            "type": subagent_type,
            "start_time": datetime.datetime.now().isoformat()
        }

    write_state(state)
    write_log_snapshot(state, config)


def _handle_subagent_stop(state, config):
    """Track subagent completion in timeline."""
    if not state:
        return
    pending = state.get("pending_subagent")
    if not pending:
        return

    start_time = pending.get("start_time", "")
    end_time = datetime.datetime.now().isoformat()
    duration = calculate_duration(start_time, end_time) if start_time else None

    subagent_entry = {
        "ts": format_timestamp(end_time),
        "type": "subagent",
        "subagent_type": pending.get("type", "unknown"),
        "duration_sec": duration,
        "success": True  # SubagentStop means it completed
    }
    state.setdefault("timeline", []).append(subagent_entry)
    state["pending_subagent"] = None
    write_state(state)
    write_log_snapshot(state, config)


def _handle_permission_request(input_data, state, config):
    """Track permission request in timeline."""
    if not state:
        return
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    permission_entry = {
        "ts": format_timestamp(datetime.datetime.now().isoformat()),
        "type": "permission_request",
        "tool": tool_name,
        "input": summarize_tool_input(tool_name, tool_input)
    }
    state.setdefault("timeline", []).append(permission_entry)
    write_state(state)
    write_log_snapshot(state, config)


def _handle_stop(state, config):
    """Update log with current progress (don't clear state)."""
    if not (state and state.get("start_time")):
        return

    transcript_path = state.get("transcript_path", "")
    max_length = config.get("response_max_length", 0)

    # Get latest response for timeline (fast, only reads tail)
    response = get_latest_response(transcript_path, max_length)
    if response:
        state.setdefault("timeline", []).append({
            "ts": format_timestamp(datetime.datetime.now().isoformat()),
            "type": "response",
            "content": response
        })

    # Incremental token update: only process entries after last timestamp
    last_ts = state.get("last_processed_timestamp", "")
    incremental = get_incremental_usage(transcript_path, last_ts)

    # Accumulate tokens
    tokens = state.setdefault("tokens", {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0})
    for key in ["input", "output", "cache_read", "cache_creation"]:
        tokens[key] += incremental["usage"].get(key, 0)

    # Update context and model
    if incremental["context_tokens"]:
        state["context_tokens"] = incremental["context_tokens"]
    if incremental["model"]:
        state["model"] = incremental["model"]

    # Save new timestamp for next time
    if incremental["last_timestamp"]:
        state["last_processed_timestamp"] = incremental["last_timestamp"]

    write_state(state)
    write_log_snapshot(state, config, full_token_update=False)


def _handle_session_end(state, config):
    """Final log write and clear state."""
    if state and state.get("start_time"):
        # Check if we have valid token data from previous Stop
        tokens = state.get("tokens", {})
        has_valid_tokens = tokens.get("input", 0) > 0 or tokens.get("output", 0) > 0
        # Use cache if valid, otherwise do full update
        write_log_snapshot(state, config, full_token_update=not has_valid_tokens)

    # Clear state on session end
    write_state({})
