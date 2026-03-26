"""
Configuration, constants, and schema for log-lightweight hook.
"""

import json
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

_PROJECT_ROOT: Optional[Path] = None


def set_project_root(root: Optional[Path]):
    """Set the global project root for all path operations."""
    global _PROJECT_ROOT
    _PROJECT_ROOT = root


def get_project_root() -> Optional[Path]:
    """Get the current project root."""
    return _PROJECT_ROOT


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
    try:
        user_config = json.loads(config_file.read_text(encoding="utf-8"))
        for key in defaults:
            if key in user_config:
                if isinstance(defaults[key], dict):
                    defaults[key].update(user_config[key])
                else:
                    defaults[key] = user_config[key]
        return defaults
    except (json.JSONDecodeError, IOError, FileNotFoundError):
        pass
    return defaults


# Schema for log file (written as first line)
LOG_SCHEMA = {
    "_type": "schema",
    "_description": "Lightweight log for Claude Code sessions",
    "fields": {
        "start_time": "Session start time (ISO format)",
        "transcript_path": "Full transcript path for detailed review",
        "timeline": "All events in chronological order, each with ts/type and corresponding data",
        "timeline_types": {
            "prompt": "User prompt input (content)",
            "response": "Claude response (content, truncated to 200 chars)",
            "tool": "Tool usage (tool/input/output)",
            "subagent": "Subagent completion (subagent_type/duration_sec/success)",
            "permission_request": "Permission request (tool/input)"
        },
        "tokens": {
            "input": "New input tokens (1x price)",
            "output": "Output tokens (1x price)",
            "cache_read": "Cache read tokens (0.1x price, most efficient)",
            "cache_creation": "Cache creation tokens (1.25x price)"
        },
        "context_tokens": "Context size of last API call (input + cache_read)",
        "context_limit": "Model context window limit (default 200K)",
        "context_used": "Context usage percentage",
        "context_remaining": "Context remaining percentage",
        "model": "Model used",
        "duration_sec": "Session duration in seconds",
        "cost_estimate": "Estimated cost (USD)",
        "files_modified": "List of modified files (extracted from Edit/Write)",
        "error_count": "Number of tool execution failures",
        "end_time": "Session end time (ISO format)"
    }
}
