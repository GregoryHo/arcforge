"""
Session state persistence (read/write state file, schema file, session ID).
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any

from .config import get_log_dir_path, LOG_SCHEMA


def get_state_file_path() -> Path:
    """Returns the absolute path to the state file in project's log directory."""
    return get_log_dir_path() / ".state.json"


def read_state() -> Dict[str, Any]:
    """Reads the current state from the state file."""
    state_file = get_state_file_path()
    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, IOError, FileNotFoundError):
        return {}


def write_state(state: Dict[str, Any]):
    """Writes the given state to the state file."""
    state_file = get_state_file_path()
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
