"""Baseline tests for arc-reflecting skill.

These tests verify that the skill document contains required elements
for proper behavior guidance.
"""

from pathlib import Path


def _read_skill() -> str:
    """Read skill file using relative path (consistent with existing test patterns)."""
    skill_path = Path("skills/arc-reflecting/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def test_frontmatter_exists():
    """Skill must have valid frontmatter."""
    text = _read_skill()
    assert text.startswith("---\n")
    assert "name: arc-reflecting" in text


def test_documents_3_occurrence_threshold():
    """Skill must document 3+ occurrence rule for patterns."""
    text = _read_skill()
    # Check for the pattern threshold rule
    assert "3+" in text or "three or more" in text.lower() or "3 or more" in text.lower()


def test_documents_evidence_requirement():
    """Skill must require evidence citations for patterns."""
    text = _read_skill()
    lower_text = text.lower()
    # Check for evidence and citation requirements
    has_evidence = "evidence" in lower_text
    has_citation = "citation" in lower_text or "cite" in lower_text
    assert has_evidence and has_citation


def test_has_strategy_selection_logic():
    """Skill should explain strategy selection."""
    text = _read_skill()
    assert "unprocessed" in text
    assert "project_focused" in text or "project-focused" in text
    assert "recent_window" in text or "recent-window" in text


def test_documents_processed_log_update():
    """Skill must document processed.log update requirement."""
    text = _read_skill()
    assert "processed.log" in text


def test_has_quick_reference_section():
    """Skill should have Quick Reference for scannable commands."""
    text = _read_skill()
    assert "## Quick Reference" in text


def test_documents_permission_requirement():
    """Skill must require user permission before saving."""
    text = _read_skill()
    # Multiple acceptable phrasings
    has_never_auto_save = "NEVER auto-save" in text
    has_user_approval = "user approval" in text.lower()
    has_ask = "ask:" in text.lower() or "ask " in text.lower()
    assert has_never_auto_save or has_user_approval or has_ask


def test_has_common_mistakes_section():
    """Skill should document common mistakes."""
    text = _read_skill()
    assert "## Common Mistakes" in text


def test_documents_rule_violation_detection():
    """Skill should document detecting CLAUDE.md rule violations."""
    text = _read_skill()
    lower_text = text.lower()
    # Check for rule violation detection
    has_violation = "violation" in lower_text
    has_claude_md = "claude.md" in lower_text
    assert has_violation and has_claude_md


def test_distinguishes_from_learn():
    """Skill should explain difference from /learn."""
    text = _read_skill()
    lower_text = text.lower()
    # Check that it references /learn and distinguishes
    has_learn_reference = "/learn" in lower_text or "learn" in lower_text
    has_diaryed = "diaryed" in lower_text
    assert has_learn_reference and has_diaryed
