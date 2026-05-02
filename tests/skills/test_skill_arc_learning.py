"""Tests for arc-learning skill.

Verifies the skill document describes the optional learning lifecycle:
observe -> automatic candidate queue -> review/approve -> draft materialize -> inspect -> explicit activate.
"""

from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-learning/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def test_frontmatter_exists():
    text = _read_skill()
    assert text.startswith("---\n")
    assert "name: arc-learning" in text
    assert "description:" in text


def test_description_mentions_optional_candidate_lifecycle():
    text = _read_skill().lower()
    assert "optional" in text
    assert "candidate" in text
    assert "lifecycle" in text


def test_has_quick_reference_for_supported_arcforge_commands():
    text = _read_skill()
    assert "## Quick Reference" in text
    for command in [
        "arcforge learn status",
        "arcforge learn enable --project",
        "arcforge learn disable --project",
        "arcforge learn analyze --project",
        "arcforge learn review --project",
        "arcforge learn approve <candidate-id> --project",
        "arcforge learn reject <candidate-id> --project",
        "arcforge learn materialize <candidate-id> --project",
        "arcforge learn inspect <candidate-id> --project",
        "arcforge learn drafts --project",
        "arcforge learn activate <candidate-id> --project",
    ]:
        assert command in text


def test_has_workflow_with_approval_and_activation_gates():
    text = _read_skill().lower()
    assert "## workflow" in text
    assert "disabled by default" in text
    assert "automatic once enabled" in text
    assert "pending candidate" in text
    assert "approve" in text
    assert "reject" in text
    assert "materialize" in text
    assert ".draft" in text
    assert "inspect" in text
    assert "explicit activation" in text


def test_key_principles_enforce_conservative_learning():
    text = _read_skill().lower()
    assert "## key principles" in text
    assert "no active behavior change without explicit activation" in text
    assert "project scope first" in text
    assert "global" in text and "unsupported" in text
    assert "redacted" in text


def test_when_to_use_and_not_to_use_sections_exist():
    text = _read_skill()
    assert "## When to Use" in text
    assert "## When NOT to Use" in text


def test_no_legacy_direct_generation_guidance():
    text = _read_skill().lower()
    assert "generate artifact" not in text
    assert "directly generate active" not in text
    assert "learn.js generate" not in text
    assert "check-duplicate" not in text


def test_position_documents_queue_and_draft_path():
    text = _read_skill().lower()
    assert "position:" in text
    assert "observations" in text
    assert "candidate queue" in text
    assert "inactive drafts" in text
    assert "active artifacts" in text


def test_scripts_exist_as_legacy_compatibility_only():
    assert Path("skills/arc-learning/scripts/learn.js").exists()
    text = _read_skill().lower()
    assert "legacy" in text
