"""
Token extraction, cost calculation, and duration utilities.
"""

import json
import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from .config import PRICING


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
                            # start_dt is local time, need to mark local timezone then convert to UTC
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
