"""
Log file I/O: snapshot writing and log file management.
"""

import sys
import json
import datetime
from pathlib import Path
from typing import Dict, Any

from .config import get_log_dir_path, CONTEXT_LIMIT
from .tokens import get_session_info, calculate_cost, calculate_duration
from .state import ensure_schema_file, get_session_id


def write_log_snapshot(state: Dict[str, Any], config: Dict[str, Any], full_token_update: bool = False):
    """Writes current state snapshot to log file.

    Args:
        state: Current session state
        config: Configuration
        full_token_update: If True, re-parse transcript for accurate token count (slower).
                          If False, use cached tokens from state (faster).
    """
    if not state or not state.get("start_time"):
        return

    now = datetime.datetime.now().isoformat()

    if full_token_update:
        # Full accuracy: parse entire transcript from session start (slow but accurate)
        session_info = get_session_info(
            state.get("transcript_path", ""),
            state["start_time"]
        )
        tokens = session_info["tokens"]
        context_tokens = session_info["context_tokens"]
        model = session_info["model"] or state.get("model")
        # Update state cache for next time
        state["tokens"] = tokens
        state["context_tokens"] = context_tokens
        if model:
            state["model"] = model
    else:
        # Fast: use cached tokens from state
        tokens = state.get("tokens", {
            "input": 0, "output": 0, "cache_read": 0, "cache_creation": 0
        })
        context_tokens = state.get("context_tokens", 0)
        model = state.get("model")

    # Calculate stats
    cost = calculate_cost(tokens)
    duration = calculate_duration(state["start_time"], now)
    context_limit = config.get("context_limit", CONTEXT_LIMIT)
    context_used = f"{round(context_tokens / context_limit * 100, 1)}%" if context_limit > 0 else "0%"
    context_remaining = f"{round((context_limit - context_tokens) / context_limit * 100, 1)}%" if context_limit > 0 else "100%"

    append_to_log({
        "model": model,
        "duration_sec": duration,
        "cost_estimate": cost,
        "tokens": tokens,
        "context_tokens": context_tokens,
        "context_limit": context_limit,
        "context_used": context_used,
        "context_remaining": context_remaining,
        "files_modified": state.get("files_modified", []),
        "error_count": state.get("error_count", 0),
        "start_time": state["start_time"],
        "end_time": now,
        "transcript_path": state.get("transcript_path", ""),
        "timeline": state.get("timeline", [])
    })


def append_to_log(entry: Dict[str, Any]):
    """Writes a log entry to a session-specific file."""
    try:
        log_dir = get_log_dir_path()
        log_dir.mkdir(parents=True, exist_ok=True)

        ensure_schema_file(log_dir)

        # Generate filename: 2026-01-20-1858-4f3bdd8d.log
        start_time = entry.get("start_time", "")
        transcript_path = entry.get("transcript_path", "")
        session_id = get_session_id(transcript_path)

        if start_time:
            dt = datetime.datetime.fromisoformat(start_time)
            date_str = dt.strftime('%Y-%m-%d')
            time_str = dt.strftime('%H%M')
        else:
            now = datetime.datetime.now()
            date_str = now.strftime('%Y-%m-%d')
            time_str = now.strftime('%H%M')

        log_file = log_dir / f"{date_str}-{time_str}-{session_id}.log"

        # Always update (overwrite) the session log file
        # Same session (same start_time) will update the same file
        # Resume (different start_time) will create a new file
        log_file.write_text(
            json.dumps(entry, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    except Exception as e:
        print(f"Hook Log Error: {e}", file=sys.stderr)
