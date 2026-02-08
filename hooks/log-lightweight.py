#!/usr/bin/env python3
"""
Lightweight Log Hook for arcforge
=====================================
Records simplified session logs with tool usage summaries.

Version: 1.0.0
"""

import sys
import os
import json
import datetime
import time
from pathlib import Path
from typing import Dict, Any, Optional


# Default tools to log (others are just exploration/research)
# Read, Grep, Glob, WebFetch, Bash are excluded as they're just exploration
DEFAULT_TOOLS_TO_LOG = ["Edit", "MultiEdit", "Write", "NotebookEdit", "Skill", "Task", "AskUserQuestion"]

# Context window limit (Claude Standard plan: 200K tokens)
CONTEXT_LIMIT = 200_000

# Claude API pricing (per 1M tokens, USD)
PRICING = {
    "input": 3.00,           # $3/1M
    "output": 15.00,         # $15/1M
    "cache_read": 0.30,      # $0.30/1M (0.1x)
    "cache_creation": 3.75,  # $3.75/1M (1.25x)
}

# Global project root (set in main())
_PROJECT_ROOT: Optional[Path] = None


def get_log_dir_path() -> Path:
    """Returns the log directory path for the current project."""
    if _PROJECT_ROOT:
        return Path(_PROJECT_ROOT) / ".claude" / "logs" / "lightweight"
    # Fallback to cwd
    return Path.cwd() / ".claude" / "logs" / "lightweight"


def get_config() -> Dict[str, Any]:
    """Reads config from <project>/.claude/log-lightweight.config.json, returns defaults if not found."""
    if _PROJECT_ROOT:
        config_file = Path(_PROJECT_ROOT) / ".claude" / "log-lightweight.config.json"
    else:
        config_file = Path.cwd() / ".claude" / "log-lightweight.config.json"
    # Default: logging enabled, alerts disabled (0 = off), response unlimited (0 = no limit)
    defaults = {
        "enabled": True,
        "cost_alert": {
            "warning": 0,
            "critical": 0
        },
        "response_max_length": 0,
        "context_limit": CONTEXT_LIMIT,
        "tools_to_log": DEFAULT_TOOLS_TO_LOG,
        "performance_tracking": False
    }
    if config_file.exists():
        try:
            user_config = json.loads(config_file.read_text(encoding="utf-8"))
            # Merge with defaults
            for key in defaults:
                if key in user_config:
                    if isinstance(defaults[key], dict):
                        defaults[key].update(user_config[key])
                    else:
                        defaults[key] = user_config[key]
            return defaults
        except (json.JSONDecodeError, IOError):
            pass
    return defaults

# Schema for log file (written as first line)
LOG_SCHEMA = {
    "_type": "schema",
    "_description": "Lightweight log for Claude Code sessions",
    "fields": {
        "start_time": "Session 開始時間 (ISO 格式)",
        "transcript_path": "完整對話記錄路徑，可用於回溯詳細內容",
        "timeline": "所有事件按時間排列，每個包含 ts/type 及對應資料",
        "timeline_types": {
            "prompt": "用戶輸入的 prompt（content）",
            "response": "Claude 回覆（content，截斷至 200 字）",
            "tool": "工具使用（tool/input/output）",
            "subagent": "Subagent 完成（subagent_type/duration_sec/success）",
            "permission_request": "權限請求（tool/input）"
        },
        "tokens": {
            "input": "新輸入 token (1x 價格)",
            "output": "輸出 token (1x 價格)",
            "cache_read": "從 cache 讀取的 token (0.1x 價格，最省)",
            "cache_creation": "建立 cache 的 token (1.25x 價格)"
        },
        "context_tokens": "最後一次 API 呼叫的 context 大小 (input + cache_read)",
        "context_limit": "模型 context window 上限 (預設 200K)",
        "context_used": "Context 已使用百分比",
        "context_remaining": "Context 剩餘百分比",
        "model": "使用的模型",
        "duration_sec": "Session 持續秒數",
        "cost_estimate": "估算成本 (USD)",
        "files_modified": "修改的檔案列表（從 Edit/Write 提取）",
        "error_count": "工具執行失敗次數",
        "end_time": "Session 結束時間 (ISO 格式)"
    }
}


def get_latest_response(transcript_path: str, max_length: int = 0) -> Optional[str]:
    """Extracts latest assistant response from transcript tail.

    Only reads the last ~50KB for efficiency.
    """
    if not transcript_path or not Path(transcript_path).exists():
        return None

    try:
        with open(transcript_path, "rb") as f:
            f.seek(0, 2)
            file_size = f.tell()
            read_size = min(file_size, 50 * 1024)
            f.seek(max(0, file_size - read_size))
            tail_content = f.read().decode("utf-8", errors="ignore")

        for line in reversed(tail_content.strip().split("\n")):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                msg = entry.get("message", {})
                if msg.get("role") == "assistant":
                    content = msg.get("content", [])
                    if isinstance(content, list):
                        texts = [c.get("text", "") for c in content if c.get("type") == "text"]
                        response = " ".join(texts).strip()
                        if response:
                            if max_length > 0 and len(response) > max_length:
                                response = response[:max_length] + "..."
                            return response
            except (json.JSONDecodeError, ValueError):
                continue
    except Exception:
        pass

    return None


def get_incremental_usage(transcript_path: str, last_timestamp: str = "") -> Dict[str, Any]:
    """Reads transcript and accumulates usage from entries after last_timestamp.

    Reads entire file but filters by timestamp to ensure accuracy.
    No entries will be missed or double-counted.

    Args:
        transcript_path: Path to the transcript file
        last_timestamp: Only process entries with timestamp > this value (ISO format)

    Returns:
        Dict with 'usage' (accumulated from new entries), 'model', 'context_tokens', 'last_timestamp'
    """
    result = {
        "usage": {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0},
        "model": None,
        "context_tokens": 0,
        "last_timestamp": last_timestamp
    }

    if not transcript_path or not Path(transcript_path).exists():
        return result

    try:
        # Read entire file to ensure no entries are missed
        with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # Parse entries and filter by timestamp
        latest_ts = last_timestamp
        for line in content.strip().split("\n"):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                entry_ts = entry.get("timestamp", "")

                # Skip entries without timestamp or already processed
                if not entry_ts:
                    continue
                if last_timestamp and entry_ts <= last_timestamp:
                    continue

                # Track latest timestamp
                if entry_ts > latest_ts:
                    latest_ts = entry_ts

                # Extract and accumulate usage
                usage = entry.get("usage") or entry.get("message", {}).get("usage", {})
                if usage and usage.get("input_tokens"):
                    input_tokens = usage.get("input_tokens", 0)
                    cache_read = usage.get("cache_read_input_tokens", 0)
                    result["usage"]["input"] += input_tokens
                    result["usage"]["output"] += usage.get("output_tokens", 0)
                    result["usage"]["cache_read"] += cache_read
                    result["usage"]["cache_creation"] += usage.get("cache_creation_input_tokens", 0)
                    # Track latest context size
                    result["context_tokens"] = input_tokens + cache_read

                # Extract model (use latest)
                model = entry.get("message", {}).get("model")
                if model:
                    result["model"] = model

            except (json.JSONDecodeError, ValueError):
                continue

        result["last_timestamp"] = latest_ts

    except Exception:
        pass

    return result


def get_session_info(transcript_path: str, session_start_time: str) -> Dict[str, Any]:
    """Extracts token usage, model, and context from transcript file for the current session.

    Context = input_tokens + cache_read_input_tokens
    (This is the actual context window usage, as cached tokens also occupy context space)
    """
    result = {
        "tokens": {
            "input": 0,
            "output": 0,
            "cache_read": 0,
            "cache_creation": 0
        },
        "model": None,
        "context_tokens": 0  # Latest context size (input + cache_read)
    }

    if not transcript_path or not Path(transcript_path).exists():
        return result

    try:
        start_dt = datetime.datetime.fromisoformat(session_start_time)

        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)

                    # Check timestamp - only count entries after session start
                    timestamp = entry.get("timestamp", "")
                    if timestamp:
                        # Handle ISO format with Z suffix
                        if timestamp.endswith("Z"):
                            timestamp = timestamp[:-1] + "+00:00"
                        entry_dt = datetime.datetime.fromisoformat(timestamp)
                        # Make start_dt timezone-aware if entry_dt is
                        if entry_dt.tzinfo and not start_dt.tzinfo:
                            # start_dt 是本地時間，需要先標記本地時區再轉換為 UTC
                            local_tz = datetime.datetime.now().astimezone().tzinfo
                            start_dt = start_dt.replace(tzinfo=local_tz).astimezone(datetime.timezone.utc)
                        if entry_dt < start_dt:
                            continue

                    # Extract model (only need first occurrence)
                    if not result["model"]:
                        model = entry.get("message", {}).get("model")
                        if model:
                            result["model"] = model

                    # Extract usage from message or directly
                    usage = entry.get("usage") or entry.get("message", {}).get("usage", {})
                    if usage:
                        input_tokens = usage.get("input_tokens", 0)
                        cache_read = usage.get("cache_read_input_tokens", 0)
                        result["tokens"]["input"] += input_tokens
                        result["tokens"]["output"] += usage.get("output_tokens", 0)
                        result["tokens"]["cache_read"] += cache_read
                        result["tokens"]["cache_creation"] += usage.get("cache_creation_input_tokens", 0)

                        # Track latest context size (input + cache_read = actual context window usage)
                        result["context_tokens"] = input_tokens + cache_read

                except (json.JSONDecodeError, ValueError):
                    continue

    except Exception:
        pass

    return result


def calculate_cost(tokens: Dict[str, int]) -> float:
    """Calculates estimated cost in USD based on token usage."""
    cost = 0.0
    cost += tokens.get("input", 0) * PRICING["input"] / 1_000_000
    cost += tokens.get("output", 0) * PRICING["output"] / 1_000_000
    cost += tokens.get("cache_read", 0) * PRICING["cache_read"] / 1_000_000
    cost += tokens.get("cache_creation", 0) * PRICING["cache_creation"] / 1_000_000
    return round(cost, 4)


def calculate_duration(start_time: str, end_time: str) -> Optional[int]:
    """Calculates duration in seconds between start and end time."""
    try:
        start_dt = datetime.datetime.fromisoformat(start_time)
        end_dt = datetime.datetime.fromisoformat(end_time)
        return int((end_dt - start_dt).total_seconds())
    except (ValueError, TypeError):
        return None


def get_state_file_path() -> Path:
    """Returns the absolute path to the state file in project's log directory."""
    return get_log_dir_path() / ".state.json"


def read_state() -> Dict[str, Any]:
    """Reads the current state from the state file."""
    state_file = get_state_file_path()
    if state_file.exists():
        try:
            return json.loads(state_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def write_state(state: Dict[str, Any]):
    """Writes the given state to the state file."""
    state_file = get_state_file_path()
    # Ensure directory exists
    state_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        state_file.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    except IOError as e:
        print(f"Hook State Error: {e}", file=sys.stderr)


def ensure_schema_file(log_dir: Path):
    """Ensures _schema.json exists in the log directory."""
    schema_file = log_dir / "_schema.json"
    if not schema_file.exists():
        schema_file.write_text(
            json.dumps(LOG_SCHEMA, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )


def get_session_id(transcript_path: str) -> str:
    """Extracts session ID from transcript path."""
    if not transcript_path:
        return "unknown"
    # transcript_path: /Users/.../.claude/projects/.../4f3bdd8d-e816-490f-8f98-9270c3a22c64.jsonl
    # Extract: 4f3bdd8d (first 8 chars of UUID)
    filename = Path(transcript_path).stem  # 4f3bdd8d-e816-490f-8f98-9270c3a22c64
    return filename.split("-")[0] if filename else "unknown"


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

        # Ensure schema file exists
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


def truncate(text: str, max_len: int) -> str:
    """Truncates text to max_len characters."""
    if not text or len(text) <= max_len:
        return text
    
    return text[:max_len] + "..."


def get_filename(path: str) -> str:
    """Extracts filename from a path."""
    if not path:
        return ""
    return Path(path).name


def summarize_tool_input(tool_name: str, tool_input: Dict[str, Any]) -> str:
    """Generates a summary of tool input."""
    if not tool_input:
        return ""

    if tool_name == "Read":
        file_path = tool_input.get("file_path", "")
        return get_filename(file_path)

    elif tool_name == "Grep":
        pattern = tool_input.get("pattern", "")
        path = tool_input.get("path", ".")
        return f'pattern="{truncate(pattern, 30)}", path={get_filename(path) or "."}'

    elif tool_name == "Glob":
        pattern = tool_input.get("pattern", "")
        return truncate(pattern, 50)

    elif tool_name in ("Edit", "MultiEdit"):
        file_path = tool_input.get("file_path", "")
        return get_filename(file_path)

    elif tool_name == "Write":
        file_path = tool_input.get("file_path", "")
        return get_filename(file_path)

    elif tool_name == "Bash":
        command = tool_input.get("command", "")
        return truncate(command, 50)

    elif tool_name == "Skill":
        skill = tool_input.get("skill", "")
        return skill

    elif tool_name == "Task":
        prompt = tool_input.get("prompt", "")
        subagent = tool_input.get("subagent_type", "")
        return f"{subagent}: {truncate(prompt, 40)}" if subagent else truncate(prompt, 50)

    else:
        # Generic: try to extract meaningful info
        if "file_path" in tool_input:
            return get_filename(tool_input["file_path"])
        if "pattern" in tool_input:
            return truncate(str(tool_input["pattern"]), 50)
        return truncate(str(tool_input), 50)


def summarize_tool_output(tool_name: str, tool_response: Any) -> str:
    """Generates a summary of tool output."""
    if tool_response is None:
        return ""

    # Handle error responses
    if isinstance(tool_response, dict) and tool_response.get("error"):
        error = tool_response.get("error", "")
        return f"失敗: {truncate(str(error), 30)}"

    if tool_name == "Read":
        if isinstance(tool_response, dict):
            file_info = tool_response.get("file", {})
            num_lines = file_info.get("numLines") or file_info.get("totalLines", "?")
            return f"{num_lines} 行"
        return "成功"

    elif tool_name == "Grep":
        if isinstance(tool_response, dict):
            filenames = tool_response.get("filenames", [])
            num_files = tool_response.get("numFiles", len(filenames))
            return f"{num_files} 檔案匹配"
        return "成功"

    elif tool_name == "Glob":
        if isinstance(tool_response, dict):
            filenames = tool_response.get("filenames", [])
            num_files = tool_response.get("numFiles", len(filenames))
            return f"{num_files} 檔案"
        return "成功"

    elif tool_name in ("Edit", "MultiEdit"):
        if isinstance(tool_response, dict):
            # Check for structured patch info
            patch = tool_response.get("structuredPatch", [])
            if patch:
                total_lines = sum(p.get("newLines", 0) for p in patch)
                return f"{total_lines} 行變更"
        return ""

    elif tool_name == "Write":
        # Success: no output needed
        return ""

    elif tool_name == "NotebookEdit":
        # Success: no output needed
        return ""

    elif tool_name == "Skill":
        # Success: no output needed
        return ""

    elif tool_name == "Task":
        # Success: no output needed
        return ""

    elif tool_name == "AskUserQuestion":
        # Always no output needed
        return ""

    else:
        return ""


def format_timestamp(iso_time: str) -> str:
    """Formats ISO timestamp to MM-DD HH:MM format for timeline readability."""
    try:
        dt = datetime.datetime.fromisoformat(iso_time)
        return dt.strftime("%m-%d %H:%M")
    except:
        return iso_time


def main():
    """Main entry point."""
    global _PROJECT_ROOT
    _start_time = time.perf_counter()  # Performance tracking
    try:
        input_data = json.load(sys.stdin)
        hook_event = input_data.get("hook_event_name")
        cwd = input_data.get("cwd", "")

        # Set project root for all path operations
        _PROJECT_ROOT = Path(cwd) if cwd else Path.cwd()

        # Read config
        config = get_config()

        # Check if logging is enabled
        if not config.get("enabled", True):
            sys.exit(0)

        tools_to_log = set(config.get("tools_to_log", DEFAULT_TOOLS_TO_LOG))

        state = read_state()

        if hook_event == "SessionStart":
            # Initialize state at session start
            session_id = input_data.get("session_id", "")
            transcript_path = input_data.get("transcript_path", "")
            trigger = input_data.get("trigger", "")

            # Only preserve timeline if UserPromptSubmit fired before SessionStart (same session)
            # For resume/clear/compact, start fresh timeline
            existing_timeline = []
            if trigger == "startup" and state.get("transcript_path") == transcript_path:
                # First startup - UserPromptSubmit might have fired first
                existing_timeline = state.get("timeline", [])
            # For resume/clear/compact - start fresh (don't inherit old timeline)

            # Use current time as starting timestamp for incremental reading
            # Only entries after this timestamp will be processed
            # Use Z suffix to match transcript format (not +00:00)
            initial_timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

            new_state = {
                "start_time": datetime.datetime.now().isoformat(),
                "session_id": session_id,
                "transcript_path": transcript_path,
                "project_root": cwd,
                "timeline": existing_timeline,
                "pending_tool": None,
                "pending_subagent": None,
                "files_modified": [],
                "error_count": 0,
                "tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0},
                "context_tokens": 0,
                "model": None,
                "last_processed_timestamp": initial_timestamp
            }
            write_state(new_state)

        elif hook_event == "UserPromptSubmit":
            # Add prompt to timeline
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
                # Use current time as starting timestamp (Z suffix to match transcript format)
                initial_timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

                new_state = {
                    "start_time": datetime.datetime.now().isoformat(),
                    "transcript_path": transcript_path,
                    "project_root": cwd,
                    "timeline": [{
                        "ts": format_timestamp(datetime.datetime.now().isoformat()),
                        "type": "prompt",
                        "content": prompt
                    }],
                    "pending_tool": None,
                    "pending_subagent": None,
                    "files_modified": [],
                    "error_count": 0,
                    "tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0},
                    "context_tokens": 0,
                    "model": None,
                    "last_processed_timestamp": initial_timestamp
                }
                write_state(new_state)
                write_log_snapshot(new_state, config)

        elif hook_event == "PreToolUse":
            # Store pending tool info (only for tools we care about)
            tool_name = input_data.get("tool_name", "")
            tool_input = input_data.get("tool_input", {})

            if state and tool_name in tools_to_log:
                state["pending_tool"] = {
                    "ts": datetime.datetime.now().isoformat(),
                    "tool": tool_name,
                    "input": summarize_tool_input(tool_name, tool_input)
                }
                write_state(state)

        elif hook_event == "PostToolUse":
            # Complete tool entry with output (only for tools we care about)
            tool_name = input_data.get("tool_name", "")
            tool_input = input_data.get("tool_input", {})
            tool_response = input_data.get("tool_response")

            if state and tool_name in tools_to_log:
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

        elif hook_event == "SubagentStop":
            # Track subagent completion in timeline
            if state:
                pending = state.get("pending_subagent")
                if pending:
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

        elif hook_event == "PermissionRequest":
            # Track permission request in timeline
            if state:
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

        elif hook_event == "Stop":
            # Update log with current progress (don't clear state)
            if state and state.get("start_time"):
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

        elif hook_event == "SessionEnd":
            # Final log write and clear state
            if state and state.get("start_time"):
                # Check if we have valid token data from previous Stop
                tokens = state.get("tokens", {})
                has_valid_tokens = tokens.get("input", 0) > 0 or tokens.get("output", 0) > 0
                # Use cache if valid, otherwise do full update
                write_log_snapshot(state, config, full_token_update=not has_valid_tokens)

            # Clear state on session end
            write_state({})

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
        except:
            pass  # Silently fail if can't write error log

        sys.exit(0)


if __name__ == "__main__":
    main()
