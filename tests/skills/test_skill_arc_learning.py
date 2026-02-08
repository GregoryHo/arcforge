"""Tests for arc-learning skill.

Verifies the skill document contains required elements for confidence scoring,
lifecycle management, and transferability testing.
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


def test_has_confidence_metadata():
    """Skill must document confidence metadata fields."""
    text = _read_skill()
    assert "## Confidence Metadata" in text
    assert "confidence" in text
    assert "last_confirmed" in text
    assert "confirmations" in text
    assert "contradictions" in text


def test_has_lifecycle_states():
    """Skill must document lifecycle states."""
    text = _read_skill()
    assert "## Lifecycle States" in text
    assert "draft" in text.lower()
    assert "active" in text.lower()
    assert "decaying" in text.lower()
    assert "archived" in text.lower()


def test_has_transferability_test():
    """Skill must document the transferability test."""
    text = _read_skill()
    assert "## Transferability Test" in text
    assert "different project" in text.lower()
    assert "different person" in text.lower() or "another developer" in text.lower()
    assert "recurrence" in text.lower()


def test_has_pattern_quality_filter():
    """Skill must document pattern quality requirements."""
    text = _read_skill()
    assert "## Pattern Quality Filter" in text
    assert "specific" in text.lower()
    assert "actionable" in text.lower()
    assert "evidence" in text.lower()


def test_has_bubble_up_section():
    """Skill must document bubble-up to global mechanism."""
    text = _read_skill()
    assert "Bubble-up" in text or "bubble-up" in text
    assert "global" in text.lower()
    assert "2+" in text or "two" in text.lower()


def test_has_confidence_in_frontmatter_template():
    """Skill draft format must include confidence fields."""
    text = _read_skill()
    assert "confidence:" in text
    assert "scope:" in text
    assert "last_confirmed:" in text


def test_has_cli_commands():
    """Skill must document CLI commands."""
    text = _read_skill()
    assert "save" in text
    assert "list" in text
    assert "confirm" in text
    assert "contradict" in text
    assert "check-duplicate" in text


def test_has_when_to_use():
    """Skill must have When to Use section."""
    text = _read_skill()
    assert "## When to Use" in text


def test_has_when_not_to_use():
    """Skill must have When NOT to Use section."""
    text = _read_skill()
    assert "## When NOT to Use" in text


def test_has_common_mistakes():
    """Skill must have Common Mistakes section."""
    text = _read_skill()
    assert "## Common Mistakes" in text


def test_scripts_exist():
    """Learn CLI script must exist."""
    assert Path("skills/arc-learning/scripts/learn.js").exists()
