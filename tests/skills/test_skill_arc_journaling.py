"""Baseline tests for arc-journaling skill.

These tests verify that the skill document contains required elements
for proper behavior guidance.
"""

from pathlib import Path


def _read_skill() -> str:
    """Read skill file using relative path (consistent with existing test patterns)."""
    skill_path = Path("skills/arc-journaling/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def test_frontmatter_exists():
    """Skill must have valid frontmatter."""
    text = _read_skill()
    assert text.startswith("---\n")
    assert "name: arc-journaling" in text
    assert "description:" in text


def test_documents_no_file_reading_rule():
    """Skill must warn against reading files for context."""
    text = _read_skill()
    # Check for the critical instruction
    assert "DO NOT read files" in text or "from memory" in text.lower()


def test_documents_permission_requirement():
    """Skill must require user permission before saving."""
    text = _read_skill()
    # Multiple acceptable phrasings
    has_never_auto_save = "NEVER auto-save" in text
    has_ask_permission = "ask permission" in text.lower()
    has_explicit_approval = "explicit approval" in text.lower()
    assert has_never_auto_save or has_ask_permission or has_explicit_approval


def test_has_common_mistakes_section():
    """Skill should document common mistakes."""
    text = _read_skill()
    assert "## Common Mistakes" in text


def test_documents_generalizable_marker():
    """Skill should mention Generalizable? marker for challenges."""
    text = _read_skill()
    assert "Generalizable?" in text


def test_has_quick_reference_section():
    """Skill should have Quick Reference for scannable commands."""
    text = _read_skill()
    assert "## Quick Reference" in text


def test_documents_storage_location():
    """Skill should document where diaries are stored."""
    text = _read_skill()
    assert "~/.claude/sessions" in text or ".claude/sessions" in text


def test_has_template():
    """Skill should include diary template structure."""
    text = _read_skill()
    # Check for key template sections
    assert "## Decisions Made" in text
    assert "## User Preferences" in text
    assert "## What Worked Well" in text
    assert "## Challenges" in text
