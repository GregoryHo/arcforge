"""Tests that skill cross-references point to real skills.

Scans all SKILL.md files for REQUIRED SUB-SKILL and REQUIRED BACKGROUND
markers, extracts referenced skill names, and verifies they exist.
"""
import re
from pathlib import Path

import pytest

SKILLS_DIR = Path("skills")

# Pattern: backtick-wrapped or bare arc-* name after REQUIRED SUB-SKILL / REQUIRED BACKGROUND
_REF_PATTERN = re.compile(
    r"(?:REQUIRED SUB-SKILL|REQUIRED BACKGROUND).*?(arc-[\w-]+)"
)


def _all_skill_names() -> set[str]:
    """Return set of all skill directory names under skills/."""
    return {
        d.name
        for d in SKILLS_DIR.iterdir()
        if d.is_dir() and (d / "SKILL.md").exists()
    }


def _collect_cross_references() -> list[tuple[str, str, str]]:
    """Collect (source_skill, ref_type, target_skill) from all skills."""
    refs = []
    for skill_dir in sorted(SKILLS_DIR.iterdir()):
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue
        content = skill_file.read_text(encoding="utf-8")
        for line in content.splitlines():
            for match in _REF_PATTERN.finditer(line):
                target = match.group(1)
                ref_type = "SUB-SKILL" if "SUB-SKILL" in line else "BACKGROUND"
                refs.append((skill_dir.name, ref_type, target))
    return refs


# Collect once at module level for parametrize
_REFS = _collect_cross_references()


@pytest.mark.parametrize(
    "source,ref_type,target",
    _REFS,
    ids=[f"{s}->{t}" for s, _, t in _REFS],
)
def test_cross_reference_target_exists(source, ref_type, target):
    """Every REQUIRED SUB-SKILL / REQUIRED BACKGROUND must point to an existing skill."""
    all_skills = _all_skill_names()
    assert target in all_skills, (
        f"{source} has {ref_type} reference to '{target}' "
        f"but no skills/{target}/SKILL.md exists"
    )


def test_cross_references_found():
    """Sanity check: we actually found cross-references to validate."""
    assert len(_REFS) >= 3, (
        f"Expected at least 3 cross-references across all skills, found {len(_REFS)}"
    )
