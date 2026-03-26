"""
Tool input/output summarization and timestamp formatting.
"""

import datetime
from pathlib import Path
from typing import Dict, Any


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
        return f"Failed: {truncate(str(error), 30)}"

    if tool_name == "Read":
        if isinstance(tool_response, dict):
            file_info = tool_response.get("file", {})
            num_lines = file_info.get("numLines") or file_info.get("totalLines", "?")
            return f"{num_lines} lines"
        return "OK"

    elif tool_name == "Grep":
        if isinstance(tool_response, dict):
            filenames = tool_response.get("filenames", [])
            num_files = tool_response.get("numFiles", len(filenames))
            return f"{num_files} files matched"
        return "OK"

    elif tool_name == "Glob":
        if isinstance(tool_response, dict):
            filenames = tool_response.get("filenames", [])
            num_files = tool_response.get("numFiles", len(filenames))
            return f"{num_files} files"
        return "OK"

    elif tool_name in ("Edit", "MultiEdit"):
        if isinstance(tool_response, dict):
            patch = tool_response.get("structuredPatch", [])
            if patch:
                total_lines = sum(p.get("newLines", 0) for p in patch)
                return f"{total_lines} lines changed"

    return ""


def format_timestamp(iso_time: str) -> str:
    """Formats ISO timestamp to MM-DD HH:MM format for timeline readability."""
    try:
        dt = datetime.datetime.fromisoformat(iso_time)
        return dt.strftime("%m-%d %H:%M")
    except Exception:
        return iso_time
