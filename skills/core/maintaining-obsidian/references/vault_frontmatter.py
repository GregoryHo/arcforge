"""Frontmatter, fence, and code-span parsing for lint_vault.py.

Reads a note as UTF-8 with line endings normalized, splits its frontmatter from
its body, and parses the frontmatter as a block: inline values, inline lists,
block lists (indented or at column 0), and one-level nested mappings. Also
extracts the top-level ```yaml fences of a SCHEMA.md, and masks fenced code
blocks, inline code, and Obsidian / HTML comments so a literal `[[link]]` shown
as an example or hidden in a comment is not a link. Stdlib only; imported by
lint_vault.py in this directory.
"""

from __future__ import annotations

import re
from pathlib import Path

KEY_RE = re.compile(r"^([A-Za-z0-9_-]+):(.*)$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)")
# A fence delimiter may be indented by at most three spaces (CommonMark); four
# is an indented code block whose backticks are literal text. A fence inside a
# blockquote or Obsidian callout carries the container's `> ` prefix.
QUOTE_PREFIX_RE = re.compile(r"^(?: {0,3}> ?)+")
FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})\s*(\S*)")
# A code span opens with a run of backticks and closes with a run of the same
# length: `a`, ``a ` b``, ```a``` — never a run of another length. It may cross
# a line break but not a blank line (a paragraph end).
INLINE_CODE_RE = re.compile(r"(?<!`)(`+)(?!`)((?:(?!\n\n)[\s\S])+?)(?<!`)\1(?!`)")
# Obsidian comments (`%% hidden %%`) and HTML comments are not rendered, so a
# [[link]] inside one is not a link.
COMMENT_RE = re.compile(r"%%.*?%%|<!--.*?-->", re.DOTALL)


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
        # Flow list: a quoted item keeps its commas (`["[[Smith, John]]", b]`).
        inner = value[1:-1].strip()
        items = re.findall(r"\"[^\"]*\"|'[^']*'|[^,]+", inner)
        return [_scalar(item) for item in items if item.strip()] if inner else []
    if value in ("", "null", "~"):
        return ""
    return value


def parse_frontmatter(text: str) -> dict:
    """Parse a frontmatter block. Block lists, nested mappings, and block scalars
    (`key: |` / `key: >`) are read whole."""
    data: dict = {}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        match = KEY_RE.match(lines[i])
        i += 1
        if not match:
            continue
        key, rest = match.group(1), match.group(2)
        indicator = rest.split("#", 1)[0].strip()
        if indicator in ("|", "|-", "|+", ">", ">-", ">+"):
            # A block scalar: the indented lines that follow are the value.
            scalar: list[str] = []
            while i < len(lines) and (not lines[i].strip() or lines[i][:1] in (" ", "\t")):
                scalar.append(lines[i].strip())
                i += 1
            joiner = "\n" if indicator[0] == "|" else " "
            data[key] = joiner.join(s for s in scalar if s).strip()
            continue
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
            # A comment-only line is neither a list item nor a mapping entry.
            if lines[i].strip() and not lines[i].strip().startswith("#"):
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


def is_raw_source(fm: dict | None) -> bool:
    """A Raw Source note to the script: carries `sha256` and no `type:`."""
    return fm is not None and "sha256" in fm and note_type(fm) is None


def _walk_fences(text: str):
    """Yield (state, info, line, quoted) per line: `text` outside any fence; `open`,
    `body`, `close` inside one; `quoted` when the fence sits in a blockquote or
    callout. A fence closes only at a delimiter of its own character and
    at least its own length (CommonMark), so a ```yaml inside a ```` illustration
    fence is body, the illustration's closer does not open a new fence, and a
    ``` fence closed by ```` ends where the longer delimiter is. A delimiter
    indented four spaces or more is literal text, not a fence. A fence inside a
    blockquote or callout (`> ```yaml`) is recognised, its body yielded with the
    `> ` prefix removed.
    """
    marker: str | None = None
    info = ""
    prefix = ""
    for line in text.split("\n"):
        if marker is None:
            quoted = QUOTE_PREFIX_RE.match(line)
            prefix = quoted.group(0) if quoted else ""
            match = FENCE_OPEN_RE.match(line[len(prefix):].rstrip())
            if match:
                marker, info = match.group(1), match.group(2).lower()
                yield "open", info, line, bool(prefix)
            else:
                yield "text", "", line, False
            continue
        # Inside a quoted fence each line carries its own `>` run; strip that
        # line's prefix, not the opener's (`> ```yaml` may close as `>```` `).
        if prefix:
            quoted = QUOTE_PREFIX_RE.match(line)
            inner = line[quoted.end():] if quoted else line
        else:
            inner = line
        if re.fullmatch(rf" {{0,3}}{re.escape(marker[0])}{{{len(marker)},}}\s*", inner):
            yield "close", info, line, bool(prefix)
            marker = None
        else:
            yield "body", info, inner, bool(prefix)


def yaml_fences(text: str) -> list[tuple[str, str]]:
    """(headings, body) per top-level ```yaml fence. `headings` is the enclosing
    heading path joined with " / " (`Source / Frontmatter`), "" before any. A
    fence inside a blockquote or callout is an illustration and is not returned
    (see _walk_fences for nesting)."""
    fences: list[tuple[str, str]] = []
    stack: list[str] = []
    buf: list[str] = []
    for state, info, line, quoted in _walk_fences(text):
        if state == "text":
            match = HEADING_RE.match(line)
            if match:
                level = len(match.group(1))
                del stack[level - 1 :]
                stack.extend([""] * (level - 1 - len(stack)))
                stack.append(match.group(2))
        elif state == "open":
            buf = []
        elif state == "body":
            buf.append(line)
        elif state == "close" and info in ("yaml", "yml") and not quoted:
            fences.append((" / ".join(h for h in stack if h), "\n".join(buf)))
    return fences


def text_lines(text: str) -> list[str]:
    """The lines outside every fence, inline code left in place."""
    return [line for state, _, line, _ in _walk_fences(text) if state == "text"]


def strip_code(text: str) -> str:
    """The text with fenced code blocks, inline code spans, and Obsidian / HTML
    comments removed."""
    return COMMENT_RE.sub("", INLINE_CODE_RE.sub("", "\n".join(text_lines(text))))
