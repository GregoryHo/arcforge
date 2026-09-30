"""The full `index.md` rebuild has one home: a write step of the audit's LINK mode.

obsidian B-5 (D-028): only the link pass writes, and LINT never writes — the
index included. Every file of maintaining-obsidian that promises the rebuild
must name LINK as the mode that performs it, and `references/audit.md`'s LINK
section must carry the procedure those promises point at.
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKILL_DIR = PROJECT_ROOT / "skills" / "core" / "maintaining-obsidian"
AUDIT = SKILL_DIR / "references" / "audit.md"
LINK_HEADING = "## LINK — resolve relationships"
LINT_HEADING = "## LINT — mechanical checks"

REBUILD = re.compile(r"rebuil|populat|generat", re.IGNORECASE)
INDEX = re.compile(r"\bindex\b", re.IGNORECASE)
NAMES_LINK = re.compile(r"\bLINK\b|audit link")
NAMES_LINT = re.compile(r"\bLINT\b|audit lint")
CLAUSE_BREAK = re.compile(r"[.;]\s")
UNIT_START =re.compile(r"\s*(?:[-*|#>]|\d+\.|```)")


def _units(text: str) -> list[str]:
    """Split Markdown into prose units: a paragraph, a list item, a table row, a heading."""
    units: list[str] = []
    for line in text.splitlines():
        if not line.strip():
            units.append("")
        elif UNIT_START.match(line) or not units or not units[-1]:
            units.append(line.strip())
        else:
            units[-1] += " " + line.strip()
    return [unit for unit in units if unit]


def _section(text: str, heading: str) -> str:
    match = re.search(rf"^{re.escape(heading)}\n(.*?)(?=^## )", text, re.MULTILINE | re.DOTALL)
    assert match, f"{AUDIT.name} has no {heading!r} section"
    return match.group(1)


def _skill_markdown() -> list[Path]:
    return sorted(SKILL_DIR.rglob("*.md"))


def _text_outside_the_procedure(path: Path) -> str:
    # audit.md's LINK section is the procedure itself, checked on its own below;
    # everywhere else a mention of the rebuild is a promise that must point at it.
    text = path.read_text(encoding="utf-8")
    if path == AUDIT:
        text = text.replace(_section(text, LINK_HEADING), "")
    return text


def _promises() -> list[tuple[str, str]]:
    return [
        (str(path.relative_to(SKILL_DIR)), unit)
        for path in _skill_markdown()
        for unit in _units(_text_outside_the_procedure(path))
        if REBUILD.search(unit) and (INDEX.search(unit) or NAMES_LINT.search(unit))
    ]


def _credits_lint(unit: str) -> bool:
    # A clause that both rebuilds and names LINT gives the rebuild to LINT;
    # "LINT reports; LINK rebuilds" in one unit is a contrast, not a promise.
    return any(
        REBUILD.search(clause) and NAMES_LINT.search(clause)
        for clause in CLAUSE_BREAK.split(unit)
    )


def test_every_index_rebuild_promise_names_link():
    wrong = [
        f"{path}: {unit}"
        for path, unit in _promises()
        if not NAMES_LINK.search(unit) or _credits_lint(unit)
    ]
    assert wrong == [], "promises an index rebuild without naming LINK:\n" + "\n".join(wrong)


def test_the_promises_are_found_where_the_skill_makes_them():
    # A floor, so a regex that stops matching cannot pass the test above vacuously.
    promising = {path for path, _ in _promises()}
    assert {
        "SKILL.md",
        "references/mode-ingest.md",
        "references/bootstrap-workflow.md",
        "presets/llm-wiki/AGENTS.md",
        "presets/news/AGENTS.md",
        "presets/project-tracker/AGENTS.md",
    } <= promising


def test_link_section_defines_the_rebuild_procedure():
    link = _section(AUDIT.read_text(encoding="utf-8"), LINK_HEADING)
    assert "`index.md`" in link
    assert "SCHEMA.md" in link, "the section-to-type mapping comes from the vault's SCHEMA.md"
    assert re.search(r"idempoten", link, re.IGNORECASE)
    assert "**Reads.**" in link and "**Writes.**" in link, "what it reads and what it writes"


def test_lint_section_does_not_rebuild_the_index():
    lint = _section(AUDIT.read_text(encoding="utf-8"), LINT_HEADING)
    assert not [unit for unit in _units(lint) if REBUILD.search(unit) and INDEX.search(unit)]
