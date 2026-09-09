"""Frontmatter, fence, and code-span parsing for lint_vault.py.

Reads a note as UTF-8 with line endings normalized, splits its frontmatter from
its body, and parses the frontmatter as a block: inline values, inline lists,
block lists (indented or at column 0), and one-level nested mappings. Also
extracts the top-level ```yaml fences of a SCHEMA.md, and masks fenced code
blocks and inline code so a literal `[[link]]` shown as an example is not a
link. Stdlib only; imported by lint_vault.py in this directory.
"""

from __future__ import annotations

import re
from pathlib import Path

KEY_RE = re.compile(r"^([A-Za-z0-9_-]+):(.*)$")
HEADING_RE = re.compile(r"^#{1,6}\s+(.*\S)")
# A fence delimiter may be indented by at most three spaces (CommonMark); four
# is an indented code block whose backticks are literal text.
FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})\s*(\S*)")
# A code span opens with a run of backticks and closes with a run of the same
# length: `a`, ``a ` b``, ```a``` — never a run of another length. It may cross
# a line break but not a blank line (a paragraph end).
INLINE_CODE_RE = re.compile(r"(?<!`)(`+)(?!`)((?:(?!\n\n)[\s\S])+?)(?<!`)\1(?!`)")


def read_text(path: Path) -> str:
    """Read as UTF-8 with line endings normalized to \\n."""
    return path.read_bytes().decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")


def split_frontmatter(text: str) -> tuple[str | None, str]:
    """Return (frontmatter text, body). Frontmatter is None when the note has none."""
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end == -1:
        if text.endswith("\n---"):
            return text[4:-4], ""
        return None, text
    return text[4:end], text[end + 5 :]


def _scalar(raw: str):
    """Parse one inline YAML value: quoted string, inline list, empty, or bare."""
    value = raw.strip()
    if value[:1] in ("'", '"'):
        close = value.find(value[0], 1)
        return value[1:close] if close != -1 else value[1:]
    value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        return [_scalar(item) for item in inner.split(",")] if inner else []
    if value in ("", "null", "~"):
        return ""
    return value


def parse_frontmatter(text: str) -> dict:
    """Parse a frontmatter block. Block lists and nested mappings are read whole."""
    data: dict = {}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        match = KEY_RE.match(lines[i])
        i += 1
        if not match:
            continue
        key, rest = match.group(1), match.group(2)
        if rest.strip() and not rest.strip().startswith("#"):
            data[key] = _scalar(rest)
            continue
        block: list[str] = []
        while i < len(lines) and (
            not lines[i].strip()
            or lines[i][:1] in (" ", "\t")
            or lines[i] == "-"
            or lines[i].startswith("- ")
        ):
            if lines[i].strip():
                block.append(lines[i].strip())
            i += 1
        if not block:
            data[key] = ""
        elif all(item == "-" or item.startswith("- ") for item in block):
            data[key] = [_scalar(item[1:]) for item in block]
        else:
            data[key] = {
                item.split(":", 1)[0].strip(): _scalar(item.split(":", 1)[1]) if ":" in item else ""
                for item in block
            }
    return data


def is_empty(value) -> bool:
    return value == "" or value == [] or value == {}


def note_tags(fm: dict | None) -> list[str]:
    """The note's frontmatter tags as bare strings (inline, block, or comma/space-separated)."""
    tags = (fm or {}).get("tags", [])
    if isinstance(tags, str):
        tags = [t for t in re.split(r"[,\s]+", tags) if t]
    elif isinstance(tags, dict):
        tags = list(tags)
    return [tag.lstrip("#") for tag in tags if isinstance(tag, str) and tag]


def note_type(fm: dict | None) -> str | None:
    """The note's `type:` when it is a non-empty string; None for an untyped note."""
    value = fm.get("type") if fm else None
    return value if isinstance(value, str) and value else None


def _walk_fences(text: str):
    """Yield (state, info, line) per line: `text` outside any fence; `open`, `body`,
    `close` inside one. A fence closes only at a delimiter of its own character and
    at least its own length (CommonMark), so a ```yaml inside a ```` illustration
    fence is body, the illustration's closer does not open a new fence, and a
    ``` fence closed by ```` ends where the longer delimiter is. A delimiter
    indented four spaces or more is literal text, not a fence.
    """
    marker: str | None = None
    info = ""
    for line in text.split("\n"):
        if marker is None:
            match = FENCE_OPEN_RE.match(line.rstrip())
            if match:
                marker, info = match.group(1), match.group(2).lower()
                yield "open", info, line
            else:
                yield "text", "", line
        elif re.fullmatch(rf" {{0,3}}{re.escape(marker[0])}{{{len(marker)},}}\s*", line):
            yield "close", info, line
            marker = None
        else:
            yield "body", info, line


def yaml_fences(text: str) -> list[tuple[str, str]]:
    """(heading, body) per top-level ```yaml fence — the heading is the nearest one
    above the fence, "" before any (see _walk_fences for nesting)."""
    fences: list[tuple[str, str]] = []
    heading = ""
    buf: list[str] = []
    for state, info, line in _walk_fences(text):
        if state == "text":
            match = HEADING_RE.match(line)
            if match:
                heading = match.group(1)
        elif state == "open":
            buf = []
        elif state == "body":
            buf.append(line)
        elif state == "close" and info in ("yaml", "yml"):
            fences.append((heading, "\n".join(buf)))
    return fences


def strip_code(text: str) -> str:
    """The text with fenced code blocks and inline code spans removed."""
    kept = [line for state, _, line in _walk_fences(text) if state == "text"]
    return INLINE_CODE_RE.sub("", "\n".join(kept))
