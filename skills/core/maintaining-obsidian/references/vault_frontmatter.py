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
COMMENT_OPEN_RE = re.compile(r"<!--|%%")
COMMENT_CLOSERS = {"<!--": "-->", "%%": "%%"}
# A list item: up to three spaces, a bullet or an ordinal, then spaces or the
# line's end. Its content column is the marker's end plus 1–4 spaces (CommonMark).
LIST_ITEM_RE = re.compile(r"( *)([-+*]|\d{1,9}[.)])( +|$)")


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


def _comment_after(line: str, closer: str | None) -> str | None:
    """The comment closer still awaited at the end of `line` (`-->` or `%%`), or
    None when the line leaves no comment open. `closer` is the one awaited at
    its start. Openers inside the line's inline code are not openers."""
    line = INLINE_CODE_RE.sub("", line)
    pos = 0
    while True:
        if closer is not None:
            end = line.find(closer, pos)
            if end == -1:
                return closer
            pos, closer = end + len(closer), None
        opener = COMMENT_OPEN_RE.search(line, pos)
        if not opener:
            return None
        pos, closer = opener.end(), COMMENT_CLOSERS[opener.group(0)]


def _list_content(line: str, offsets: list[int]) -> tuple[int, str]:
    """Track the open list items for one line outside a fence, and return
    (column where the line's content starts, the content). `offsets` is the
    stack of content columns of the open items, innermost last; a line indented
    less than an item's column ends that item, and a marker opens a new one at
    its content column (CommonMark §5.2)."""
    indent = len(line) - len(line.lstrip(" "))
    while offsets and indent < offsets[-1]:
        offsets.pop()
    base = offsets[-1] if offsets else 0
    while True:
        item = LIST_ITEM_RE.match(line, base)
        if not item or item.start(2) - base > 3:
            return base, line[base:]
        gap = len(item.group(3))
        base = item.end(2) + (gap if 1 <= gap <= 4 and item.end() < len(line) else 1)
        offsets.append(base)


def _walk_fences(text: str):
    """Yield (state, info, line, nested) per line: `text` outside any fence;
    `open`, `body`, `close` inside one; `comment` inside a comment block that
    spans lines; `nested` when the fence sits in a blockquote, callout, or list
    item. A fence closes only at a delimiter of its own character and at least
    its own length (CommonMark), so a ```yaml inside a ```` illustration fence
    is body, the illustration's closer does not open a new fence, and a ```
    fence closed by ```` ends where the longer delimiter is. A delimiter
    indented four spaces or more past its container's content column is literal
    text, not a fence. A fence inside a blockquote or callout (`> ```yaml`) is
    recognised, its body yielded with the `> ` prefix removed; one inside a list
    item is measured from the item's content column, closes early when the item
    does, and its body is yielded with that indentation removed. The lines
    between a comment's opener and its closer (`<!--` … `-->`, `%%` … `%%`)
    are `comment`: a delimiter there opens no fence. The opener's and the
    closer's lines stay `text`, so joining the text lines still leaves the whole
    comment for COMMENT_RE to remove.
    """
    marker: str | None = None
    info = ""
    prefix = ""
    base = 0
    comment: str | None = None
    offsets: list[int] = []
    for line in text.split("\n"):
        if marker is not None:
            # Inside a quoted fence each line carries its own `>` run; strip that
            # line's prefix, not the opener's (`> ```yaml` may close as `>```` `).
            if prefix:
                quoted = QUOTE_PREFIX_RE.match(line)
                inner = line[quoted.end():] if quoted else line
            elif line.strip() and len(line) - len(line.lstrip(" ")) < base:
                marker = None  # the list item ended, and its fence with it
            else:
                inner = line[base:]
            if marker is not None:
                if re.fullmatch(rf" {{0,3}}{re.escape(marker[0])}{{{len(marker)},}}\s*", inner):
                    yield "close", info, line, bool(prefix or base)
                    marker = None
                else:
                    yield "body", info, inner, bool(prefix or base)
                continue
        if comment is not None:
            comment = _comment_after(line, comment)
            yield ("comment" if comment else "text"), "", line, False
            continue
        quoted = QUOTE_PREFIX_RE.match(line)
        prefix = quoted.group(0) if quoted else ""
        if prefix:
            offsets.clear()
            base, content = 0, line[len(prefix):]
        elif line.strip():
            base, content = _list_content(line, offsets)
        else:
            base, content = (offsets[-1] if offsets else 0), line
        match = FENCE_OPEN_RE.match(content.rstrip())
        if match:
            marker, info = match.group(1), match.group(2).lower()
            yield "open", info, line, bool(prefix or base)
            continue
        comment = _comment_after(line, None)
        yield "text", "", line, False


def yaml_fences(text: str) -> list[tuple[str, str]]:
    """(headings, body) per top-level ```yaml fence. `headings` is the enclosing
    heading path joined with " / " (`Source / Frontmatter`), "" before any. A
    fence inside a blockquote, callout, or list item is an illustration and is
    not returned, and one inside a comment is not a fence (see _walk_fences for
    nesting)."""
    fences: list[tuple[str, str]] = []
    stack: list[str] = []
    buf: list[str] = []
    for state, info, line, nested in _walk_fences(text):
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
        elif state == "close" and info in ("yaml", "yml") and not nested:
            fences.append((" / ".join(h for h in stack if h), "\n".join(buf)))
    return fences


def text_lines(text: str) -> list[str]:
    """The lines outside every fence and comment block, inline code left in place."""
    return [line for state, _, line, _ in _walk_fences(text) if state == "text"]


def strip_code(text: str) -> str:
    """The text with fenced code blocks, inline code spans, and Obsidian / HTML
    comments removed."""
    return COMMENT_RE.sub("", INLINE_CODE_RE.sub("", "\n".join(text_lines(text))))
