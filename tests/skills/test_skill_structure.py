"""Structure-only validation for every skill under skills/*/SKILL.md.

Replaces the 32 per-skill literal-prose assertion files (D6). Checks frontmatter
validity, name == dirname, description presence, generic structure, cross-reference
resolution, referenced supporting-file existence, and line budget (D7). No literal
sentence assertions — behavioral protection is the eval layer's job (D5).

Skills are discovered dynamically, so merges, renames, and new skills need zero
test edits. Paths are anchored to the repo root, so the suite is cwd-proof.
"""
import re
import warnings
from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = PROJECT_ROOT / "skills"

# Line budget (D7): soft cap warns, hard cap fails.
SOFT_LINE_CAP = 150
HARD_LINE_CAP = 250

# Permanent exceptions — engine/content dependencies that stay above the hard cap.
PERMANENT_LINE_BUDGET = {
    "arc-refining": 300,
    "arc-finishing": 430,
}

# Temporary v5-transition exceptions — cap = current size so files cannot GROW.
# Wave 4 body-diet lanes delete their entry here as each skill is brought under
# budget; once removed, the skill falls back to its permanent cap (or the hard cap).
TEMPORARY_LINE_BUDGET = {
    "arc-writing-skills": 675,
    "arc-finishing": 618,
    "arc-refining": 454,
    "arc-reflecting": 416,
    "arc-tdd": 413,
    "arc-brainstorming": 360,
    "arc-dispatching-parallel": 338,
    "arc-auditing-spec": 337,
    "arc-diagramming-obsidian": 320,
    "arc-journaling": 312,
    "arc-agent-driven": 306,
    "arc-looping": 301,
    "arc-debugging": 296,
    "arc-researching": 287,
    "arc-planning": 260,
}

# Supporting-file references: references/, scripts/, templates/, agents/ paths ending
# in a known extension. The lookbehind skips matches embedded in a longer path
# (cross-skill `arc-using/references/...`) or a variable example
# (`${SKILL_ROOT}/scripts/...`) so only first-class path pointers are validated.
_SUPPORTING_FILE_PATTERN = re.compile(
    r"(?<![\w./$-])(?:references|scripts|templates|agents)/[A-Za-z0-9._/-]+\.(?:md|js|sh|ya?ml)"
)

# Cross-references: first arc-* token after a REQUIRED SUB-SKILL / REQUIRED BACKGROUND
# marker (absorbs the former test_skill_cross_references.py).
_CROSS_REF_PATTERN = re.compile(r"(?:REQUIRED SUB-SKILL|REQUIRED BACKGROUND).*?(arc-[\w-]+)")


def _skill_dirs() -> list[Path]:
    return sorted(
        d for d in SKILLS_DIR.iterdir() if d.is_dir() and (d / "SKILL.md").exists()
    )


SKILL_DIRS = _skill_dirs()
SKILL_NAMES = {d.name for d in SKILL_DIRS}


def _read(skill_dir: Path) -> str:
    return (skill_dir / "SKILL.md").read_text(encoding="utf-8")


def _split_frontmatter(text: str) -> tuple[str, str]:
    """Return (frontmatter_text, body) or raise AssertionError on malformed fences."""
    assert text.startswith("---\n"), "missing frontmatter start fence"
    end = text.find("\n---\n", 4)
    assert end != -1, "missing frontmatter end fence"
    return text[4:end], text[end + 5 :]


def _load_frontmatter(text: str) -> dict:
    front, _ = _split_frontmatter(text)
    data = yaml.safe_load(front)
    assert isinstance(data, dict), "frontmatter is not a YAML mapping"
    return data


def _line_budget(name: str) -> int:
    return TEMPORARY_LINE_BUDGET.get(name, PERMANENT_LINE_BUDGET.get(name, HARD_LINE_CAP))


def _collect_cross_references() -> list[tuple[str, str, str]]:
    refs = []
    for skill_dir in SKILL_DIRS:
        for line in _read(skill_dir).splitlines():
            for match in _CROSS_REF_PATTERN.finditer(line):
                ref_type = "SUB-SKILL" if "SUB-SKILL" in line else "BACKGROUND"
                refs.append((skill_dir.name, ref_type, match.group(1)))
    return refs


CROSS_REFS = _collect_cross_references()


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_frontmatter_valid(skill_dir):
    """Frontmatter parses as YAML, name == dirname, description present (<1024 combined)."""
    data = _load_frontmatter(_read(skill_dir))

    assert data.get("name") == skill_dir.name, (
        f"frontmatter name {data.get('name')!r} != directory {skill_dir.name!r}"
    )
    description = data.get("description")
    assert isinstance(description, str) and description.strip(), "description missing or empty"
    combined = len(f"{data['name']}{description}")
    assert combined < 1024, f"name+description is {combined} chars (>= 1024)"


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_has_section_and_body(skill_dir):
    """Every skill has at least one '## ' section heading and a non-empty body."""
    _, body = _split_frontmatter(_read(skill_dir))
    assert body.strip(), "skill body is empty"
    assert re.search(r"(?m)^## ", body), "skill has no '## ' section heading"


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_referenced_supporting_files_exist(skill_dir):
    """Every references/scripts/templates/agents pointer resolves (skill-local or repo-root)."""
    missing = []
    for match in _SUPPORTING_FILE_PATTERN.finditer(_read(skill_dir)):
        rel = match.group(0)
        if not (skill_dir / rel).exists() and not (PROJECT_ROOT / rel).exists():
            missing.append(rel)
    assert not missing, (
        f"{skill_dir.name} references supporting files that do not exist: {sorted(set(missing))}"
    )


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_line_budget(skill_dir):
    """SKILL.md stays within its hard cap; over the soft cap emits a warning."""
    lines = _read(skill_dir).count("\n")
    limit = _line_budget(skill_dir.name)
    assert lines <= limit, f"{skill_dir.name} SKILL.md is {lines} lines (hard cap {limit})"
    if lines > SOFT_LINE_CAP:
        warnings.warn(
            f"{skill_dir.name} SKILL.md is {lines} lines (> soft cap {SOFT_LINE_CAP})",
            stacklevel=2,
        )


@pytest.mark.parametrize(
    "source,ref_type,target",
    CROSS_REFS,
    ids=[f"{s}->{t}" for s, _, t in CROSS_REFS],
)
def test_cross_reference_resolves(source, ref_type, target):
    """Every REQUIRED SUB-SKILL / REQUIRED BACKGROUND target points to an existing skill."""
    assert target in SKILL_NAMES, (
        f"{source} has REQUIRED {ref_type} reference to '{target}' "
        f"but no skills/{target}/SKILL.md exists"
    )


def test_cross_references_found():
    """Sanity floor: cross-reference scan actually found references to validate."""
    assert len(CROSS_REFS) >= 3, (
        f"expected >= 3 cross-references across all skills, found {len(CROSS_REFS)}"
    )
