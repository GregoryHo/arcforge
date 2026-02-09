"""Tests for arc-learning skill.

Verifies the skill document contains required elements for instinct clustering,
including cluster workflow, key principles, and CLI commands.
"""

from pathlib import Path


def _read_skill() -> str:
    """Read skill file using relative path (consistent with existing test patterns)."""
    skill_path = Path("skills/arc-learning/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def test_frontmatter_exists():
    """Skill must have valid frontmatter."""
    text = _read_skill()
    assert text.startswith("---\n")
    assert "name: arc-learning" in text
    assert "description:" in text


def test_description_mentions_clustering():
    """Description should reference clustering instincts."""
    text = _read_skill()
    assert "cluster" in text.lower()
    assert "instinct" in text.lower()


def test_has_workflow():
    """Skill must document the clustering workflow."""
    text = _read_skill()
    assert "## Workflow" in text
    assert "Scan" in text
    assert "Cluster" in text
    assert "Filter" in text
    assert "Preview" in text


def test_has_key_principles():
    """Skill must document key principles."""
    text = _read_skill()
    assert "## Key Principles" in text
    assert "User-driven" in text
    assert "Minimum cluster size" in text
    assert "Quality threshold" in text


def test_has_cli_commands():
    """Skill must document new CLI commands (scan, preview)."""
    text = _read_skill()
    assert "scan" in text
    assert "preview" in text


def test_no_old_commands():
    """Skill must NOT reference old commands (save, confirm, contradict, check-duplicate)."""
    text = _read_skill()
    # These old commands should not appear as CLI commands
    assert "check-duplicate" not in text
    # save/confirm/contradict could appear in general text, but not as CLI command references
    assert "learn.js save" not in text
    assert "learn.js confirm" not in text
    assert "learn.js contradict" not in text


def test_has_when_to_use():
    """Skill must have When to Use section."""
    text = _read_skill()
    assert "## When to Use" in text


def test_has_when_not_to_use():
    """Skill must have When NOT to Use section."""
    text = _read_skill()
    assert "## When NOT to Use" in text


def test_has_quick_reference():
    """Skill must have Quick Reference table."""
    text = _read_skill()
    assert "## Quick Reference" in text


def test_has_pipeline_position():
    """Skill must document its pipeline position."""
    text = _read_skill()
    assert "Pipeline position" in text
    assert "instincts" in text.lower()


def test_scripts_exist():
    """Learn CLI script must exist."""
    assert Path("skills/arc-learning/scripts/learn.js").exists()
