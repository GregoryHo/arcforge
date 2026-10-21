"""Frontmatter, fence, and code-span parsing for lint_vault.py.

Reads a note as UTF-8 with line endings normalized, splits its frontmatter from
its body, and parses the frontmatter as a block: inline values (quoted ones with
their YAML escapes), inline lists, block lists (indented or at column 0), and
one-level nested mappings. Also
extracts the top-level ```yaml fences of a SCHEMA.md, and masks fenced and
indented code blocks, inline code, and Obsidian / HTML comments so a literal `[[link]]` shown
as an example or hidden in a comment is not a link. Stdlib only; imported by
lint_vault.py in this directory.
"""

from __future__ import annotations

import re
from pathlib import Path

KEY_RE = re.compile(r"^([A-Za-z0-9_-]+):(.*)$")
# Quoted YAML scalars: `''` is the only escape inside single quotes; inside
# double quotes a backslash escapes the next character.
SINGLE_QUOTED_RE = re.compile(r"'((?:[^']|'')*)'?")
DOUBLE_QUOTED_RE = re.compile(r'"((?:[^"\\]|\\.)*)"?', re.DOTALL)
FLOW_ITEM_RE = re.compile(r"\"(?:[^\"\\]|\\.)*\"|'(?:[^']|'')*'|[^,]+")
DOUBLE_ESCAPE_RE = re.compile(r"\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)", re.DOTALL)
DOUBLE_ESCAPES = {
    "0": "\0", "a": "\a", "b": "\b", "t": "\t", "\t": "\t", "n": "\n", "v": "\v",
    "f": "\f", "r": "\r", "e": "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\",
    "N": "\x85", "_": "\xa0", "L": " ", "P": " ",
}
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)")
# Any ATX heading, empty or not: it is a block of one line.
ATX_RE = re.compile(r" {0,3}#{1,6}(?:\s|$)")
# A thematic break (`***`, `- - -`) also ends a paragraph; a setext underline
# (`===`, `---`) under one turns it into a heading and ends it.
THEMATIC_RE = re.compile(r" {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$")
SETEXT_RE = re.compile(r" {0,3}(?:=+|-+)[ \t]*$")
# A fence delimiter may be indented by at most three spaces (CommonMark); four
# is an indented code block whose backticks are literal text. A fence inside a
# blockquote or Obsidian callout carries the container's `> ` prefix.
QUOTE_PREFIX_RE = re.compile(r"^(?: {0,3}> ?)+")
# A backtick fence's info string holds no backtick, so ```js `x` is prose.
FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}(?=[^`]*$)|~{3,})\s*(\S*)")
# A code span opens with a run of backticks and closes with a run of the same
# length: `a`, ``a ` b``, ```a``` — never a run of another length. It may cross
# a line break but not the end of its paragraph, which strip_code marks with a
# blank line (see _Blocks.advance).
INLINE_CODE_RE = re.compile(r"(?<!`)(`+)(?!`)((?:(?!\n\n)[\s\S])+?)(?<!`)\1(?!`)")
# Obsidian comments (`%% hidden %%`) and HTML comments are not rendered, so a
# [[link]] inside one is not a link.
COMMENT_RE = re.compile(r"%%.*?%%|<!--.*?-->", re.DOTALL)
COMMENT_OR_SPAN_RE = re.compile(r"<!--|%%|`+")
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


def _unescape_double(match: re.Match) -> str:
    code = match.group(1)
    if code[0] in "xuU":
        point = int(code[1:], 16)
        # Past U+10FFFF, or a lone surrogate, is not a character: keep the escape as written.
        if point > 0x10FFFF or 0xD800 <= point <= 0xDFFF:
            return match.group(0)
        return chr(point)
    return DOUBLE_ESCAPES.get(code, match.group(0))


def _quoted(value: str) -> str:
    """The text of a quoted YAML scalar, escapes honoured: `''` inside single
    quotes is one quote; inside double quotes a backslash escapes (`\\"`, `\\\\`,
    `\\n`, `\\t`, `\\xNN`, `\\uNNNN`, ...). An unclosed quote runs to the end."""
    match = (SINGLE_QUOTED_RE if value[0] == "'" else DOUBLE_QUOTED_RE).match(value)
    body = match.group(1)
    if value[0] == "'":
        return body.replace("''", "'")
    return DOUBLE_ESCAPE_RE.sub(_unescape_double, body)


def _scalar(raw: str):
    """Parse one inline YAML value: quoted string, inline list, empty, or bare."""
    value = raw.strip()
    if value[:1] in ("'", '"'):
        return _quoted(value)
    value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
    if value.startswith("[") and value.endswith("]"):
        # Flow list: a quoted item keeps its commas (`["[[Smith, John]]", b]`)
        # and its escaped quotes (`['O''Brien', "a \"b\""]`).
        inner = value[1:-1].strip()
        items = FLOW_ITEM_RE.findall(inner)
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


def _run_closer(run: str) -> re.Pattern:
    """A backtick run of exactly this length — the only thing that closes a span it opened."""
    return re.compile(rf"(?<!`){run}(?!`)")


class _Blocks:
    """The containers open before a line: the list-item stack (see
    _list_content), the blockquote depth, whether a paragraph is open — which
    decides lazy continuation and indented code — and whether the innermost
    item opened empty, which a blank line then ends (§5.2)."""

    def __init__(self) -> None:
        self.offsets: list[int] = []
        self.depth = 0
        self.para = False
        self.empty = False

    def copy(self) -> "_Blocks":
        other = _Blocks()
        other.offsets, other.depth, other.para = list(self.offsets), self.depth, self.para
        other.empty = self.empty
        return other

    def advance(self, line: str) -> tuple[str, int, str]:
        """Read one line outside a fence: (its content inside its blockquote or
        list item, the content's column, its flow). The flow is `continue` for a
        line that continues the open paragraph — a lazy one included, which keeps
        its blockquote and list items open — `code` for a line indented four
        spaces or more past its container that does not, and `new` for anything
        else: a blank or quoted blank line, or one that starts a block. A
        paragraph, and any code span in it, ends before a `new` line (§4.4, §5)."""
        quoted = QUOTE_PREFIX_RE.match(line)
        depth = quoted.group(0).count(">") if quoted else 0
        empty, self.empty = self.empty, False
        lazy = False
        if quoted:
            self.offsets.clear()
            content, base = line[quoted.end():], 0
            starts = depth > self.depth  # a blockquote start
            lazy = depth < self.depth  # a lazy line of the deeper quote's paragraph
        elif self.depth and self.para and line.strip() and not _interrupts(line):
            content, base, starts, depth = line, 0, False, self.depth  # lazy: the quote stays open
            lazy = True
        elif line.strip():
            # A line that leaves a blockquote does not continue its paragraph.
            base, content, starts = _list_content(line, self.offsets, self.para and not self.depth)
            self.empty = starts and not content.strip()
            lazy = bool(self.offsets) and base < self.offsets[-1]
        else:
            if empty:
                self.offsets.pop()
            content, base, starts = line, self.offsets[-1] if self.offsets else 0, False
        indent = len(content) - len(content.lstrip(" "))
        # A setext underline belongs to a paragraph in its own container: not a
        # lazy line (§4.3), and not one that opens a blockquote or an item.
        underline = self.para and not (lazy or starts) and SETEXT_RE.match(content)
        if not content.strip():
            flow = "new"
        elif self.para and not (
            starts or underline or _interrupts(content, para=depth >= self.depth)
        ):
            flow = "continue"
        else:
            flow = "code" if indent >= 4 else "new"
        # A lazy line keeps the quotes it does not repeat open.
        self.depth = max(depth, self.depth) if flow == "continue" else depth
        self.para = flow != "code" and bool(content.strip()) and not (
            underline
            or ATX_RE.match(content)
            or THEMATIC_RE.match(content)
            or FENCE_OPEN_RE.match(content.rstrip())
        )
        return content, base, flow


def _interrupts(content: str, para: bool = False) -> bool:
    """Whether `content` opens a block that ends a paragraph: a fence, an ATX
    heading, a thematic break, a blockquote, or a list item. `para` when the
    paragraph's own containers all continue on this line, so only an item that
    may interrupt it counts (see _opens_item)."""
    item = LIST_ITEM_RE.match(content)
    return bool(
        FENCE_OPEN_RE.match(content.rstrip())
        or ATX_RE.match(content)
        or THEMATIC_RE.match(content)
        or QUOTE_PREFIX_RE.match(content)
        or (item and item.start(2) <= 3 and _opens_item(item, content, para))
    )


def _opens_item(item: re.Match, line: str, para: bool) -> bool:
    """Whether a list marker opens an item. One that would interrupt an open
    paragraph (`para`) must be a bullet or start at 1, and not be empty (§5.2)."""
    marker = item.group(2)
    first = marker in "-+*" or int(marker[:-1]) == 1
    return not para or (first and bool(line[item.end():].strip()))


def _span_closes(lines: list[str], i: int, run: str, pos: int, blocks: _Blocks) -> bool:
    """Whether a code span opened by `run` at `lines[i][pos:]` closes before the
    paragraph ends — at a blank or quoted blank line, a fence opener, an ATX
    heading, a blockquote start, or a list-item start (CommonMark §4.5, §5).
    `blocks` is the container state after `lines[i]`. An unclosed run is literal
    backticks."""
    closer = _run_closer(run)
    if closer.search(lines[i], pos):
        return True
    blocks = blocks.copy()
    for line in lines[i + 1 :]:
        if blocks.advance(line)[2] != "continue":
            return False
        if closer.search(line):
            return True
    return False


def _comment_after(
    lines: list[str], i: int, closer: str | None, span: str | None, blocks: _Blocks
):
    """(comment closer, code-span run) still awaited at the end of `lines[i]`.
    `closer` (`-->` or `%%`) and `span` are what was awaited at its start, and
    `blocks` is the container state after `lines[i]`. An opener inside a code span
    is code, even when the span crosses a line break, so it opens no comment."""
    line, pos = lines[i], 0
    while True:
        if span is not None:
            end = _run_closer(span).search(line, pos)
            if not end:
                return None, span
            pos, span = end.end(), None
        elif closer is not None:
            end = line.find(closer, pos)
            if end == -1:
                return closer, None
            pos, closer = end + len(closer), None
        token = COMMENT_OR_SPAN_RE.search(line, pos)
        if not token:
            return None, None
        pos = token.end()
        if token.group(0).startswith("`"):
            if _span_closes(lines, i, token.group(0), pos, blocks):
                span = token.group(0)
        else:
            closer = COMMENT_CLOSERS[token.group(0)]


def _list_content(line: str, offsets: list[int], para: bool) -> tuple[int, str, bool]:
    """Track the open list items for one line outside a fence, and return
    (column where the line's content starts, the content, whether the line
    starts an item). `offsets` is the stack of content columns of the open
    items, innermost last; a line indented less than an item's column ends that
    item — unless it is a lazy continuation of the item's open paragraph
    (`para`) — and a marker opens a new one at its content column (CommonMark
    §5.2)."""
    indent = len(line) - len(line.lstrip(" "))
    if para and offsets and indent < offsets[-1] and line.strip() and not _interrupts(line):
        return indent, line[indent:], False
    matched = not offsets or indent >= offsets[-1]
    while offsets and indent < offsets[-1]:
        offsets.pop()
    base = offsets[-1] if offsets else 0
    starts = False
    while True:
        item = LIST_ITEM_RE.match(line, base)
        if (
            not item
            or item.start(2) - base > 3
            or THEMATIC_RE.match(line, base)
            or not _opens_item(item, line, para and matched and not starts)
        ):
            return base, line[base:], starts
        gap = len(item.group(3))
        base = item.end(2) + (gap if 1 <= gap <= 4 and item.end() < len(line) else 1)
        offsets.append(base)
        starts = True


def _fence_line(line: str, prefix: str, base: int) -> str | None:
    """`line` inside a fence opened in a blockquote (`prefix`) or a list item
    (content column `base`), with the container's prefix or indentation removed;
    None when the line ends that container, and the fence with it (a fence has
    no lazy lines). Each quoted line carries its own `>` run: strip that line's
    prefix, not the opener's (`> ```yaml` may close as `>```` `)."""
    if prefix:
        quoted = QUOTE_PREFIX_RE.match(line)
        if quoted and quoted.group(0).count(">") >= prefix.count(">"):
            return line[quoted.end():]
        return None
    if line.strip() and len(line) - len(line.lstrip(" ")) < base:
        return None
    return line[base:]


def _walk_fences(text: str):
    """Yield (state, info, line, nested) per line: `text` outside any fence;
    `open`, `body`, `close` inside one; `code` in an indented code block;
    `comment` inside a comment block that spans lines; and, with an empty line,
    `break` before a text line that starts a new paragraph or block, which no
    code span crosses (see _Blocks.advance). `nested` when the fence sits in a
    blockquote, callout, or list item. A fence closes only at a delimiter of its own character and at least
    its own length (CommonMark), so a ```yaml inside a ```` illustration fence
    is body, the illustration's closer does not open a new fence, and a ```
    fence closed by ```` ends where the longer delimiter is. A delimiter
    indented four spaces or more past its container's content column is literal
    text, not a fence. A fence inside a blockquote or callout (`> ```yaml`) is
    recognised, its body yielded with the `> ` prefix removed, and closes early
    when the blockquote ends (a fence has no lazy lines); one inside a list
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
    span: str | None = None
    blocks = _Blocks()
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if marker is not None:
            inner = _fence_line(line, prefix, base)
            if inner is None:
                marker = None  # its container ended, and the fence with it
            else:
                if re.fullmatch(rf" {{0,3}}{re.escape(marker[0])}{{{len(marker)},}}\s*", inner):
                    yield "close", info, line, bool(prefix or base)
                    marker = None
                else:
                    yield "body", info, inner, bool(prefix or base)
                continue
        if comment is not None:
            comment, span = _comment_after(lines, i, comment, None, blocks)
            yield ("comment" if comment else "text"), "", line, False
            continue
        if span is not None:
            # Inside a code span that crosses lines: this line is span text.
            comment, span = _comment_after(lines, i, None, span, blocks)
            yield "text", "", line, False
            continue
        quoted = QUOTE_PREFIX_RE.match(line)
        prefix = quoted.group(0) if quoted else ""
        content, base, flow = blocks.advance(line)
        if flow == "code":
            yield "code", "", line, False
            continue
        match = FENCE_OPEN_RE.match(content.rstrip())
        if match:
            marker, info = match.group(1), match.group(2).lower()
            yield "open", info, line, bool(prefix or base)
            continue
        if flow == "new":
            yield "break", "", "", False
        comment, span = _comment_after(lines, i, None, None, blocks)
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
    """The lines outside every fence, indented code block and comment block,
    inline code left in place."""
    return [line for state, _, line, _ in _walk_fences(text) if state == "text"]


def strip_code(text: str) -> str:
    """The text with fenced and indented code blocks, inline code spans, and
    Obsidian / HTML comments removed. Each code line, and each paragraph or
    block start (`break`), leaves a blank line, so no code span pairs runs
    across the end of its block."""
    kept = [
        line if state == "text" else ""
        for state, _, line, _ in _walk_fences(text)
        if state != "comment"
    ]
    return COMMENT_RE.sub("", INLINE_CODE_RE.sub("", "\n".join(kept)))
