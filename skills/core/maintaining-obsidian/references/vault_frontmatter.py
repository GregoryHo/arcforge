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
FENCE_OPEN_RE = re.compile(r"^(`{3,}|~{3,})\s*(\S*)")
CODE_FENCE_RE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n.*?^[ \t]{0,3}\1[ \t]*$", re.MULTILINE | re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")


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


def yaml_fences(text: str) -> list[str]:
    """Bodies of the top-level ```yaml fences.

    A fence closes only at a delimiter of its own character and at least its own
    length (CommonMark), so a ```yaml inside a ```` illustration fence is content
    and the illustration's own closer does not open a fence that swallows the
    rest of the file.
    """
    fences: list[str] = []
    marker: str | None = None
    info = ""
    buf: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if marker is None:
            match = FENCE_OPEN_RE.match(stripped)
            if match:
                marker, info, buf = match.group(1), match.group(2).lower(), []
        elif re.fullmatch(rf"{re.escape(marker[0])}{{{len(marker)},}}", stripped):
            if info in ("yaml", "yml"):
                fences.append("\n".join(buf))
            marker = None
        else:
            buf.append(line)
    return fences


def strip_code(text: str) -> str:
    """The text with fenced code blocks and inline code spans removed."""
    return INLINE_CODE_RE.sub("", CODE_FENCE_RE.sub("", text))
